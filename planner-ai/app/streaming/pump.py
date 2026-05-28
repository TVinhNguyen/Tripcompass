"""
streaming/pump.py — Producer-consumer loop for one chat agent turn.

Yields structured turn events (typed `dict` matching schemas.StreamEvent):
  thinking    → LLM is processing (heartbeat — emitted on idle gaps)
  tool_start  → a tool call started: {tool, label}
  token       → an LLM token chunk: {content}
  error       → mid-stream error: {message}
  done        → terminal event (always the last yield) carrying the
                aggregated turn result: {session_id, tool_calls, plan,
                full_text, stream_dropped}

The caller (routes/chat.py) frames each event as SSE; non-HTTP callers
(tests, future webhook adapter) consume the events directly. Previously
this function yielded pre-formatted SSE strings and the route parsed the
final `done` chunk by substring-matching '"type": "done"' — fragile and
made the contract invisible from the schema.
"""
import asyncio
import json
import time
from typing import AsyncIterator

from loguru import logger

from app.streaming.helpers import _content_to_text, _message_content, _has_tool_calls
from app.streaming.think_stripper import _ThinkStripper, _strip_thinking
from app.streaming.json_stripper import _JsonStripper
from app.streaming.response_shape import _to_generate_response, _extract_plan
from app.streaming.summary import _strip_json_objects, _deterministic_summary
from app.extractor import prose_to_plan


async def stream_chat_response(
    agent,
    messages: list,
    session_id: str,
) -> AsyncIterator[dict]:
    """Stream agent response as structured turn events (dict). Caller frames
    them as SSE if needed.

    JSON suppression: two live layers + one post-hoc safety net.
      L1: chunks carrying tool_call_chunks have their content dropped — the
          model is mid-serializing a tool call, any content is unintended.
      L2: _JsonStripper drops balanced top-level {...} blocks char-by-char,
          for providers (Gemma+Ollama) that emit tool args as JSON text in
          content instead of using the tool_call_chunks channel.
      Final: _strip_json_objects also cleans full_text in the done event.
    """
    tools_used: list[str] = []
    plan_data: dict | None = None
    full_text = ""
    stream_dropped = False  # True if upstream LLM closed the connection mid-stream
    think_stripper = _ThinkStripper()
    json_stripper = _JsonStripper()

    # ── Diagnostics ──────────────────────────────────────────────────────────
    started_at = time.monotonic()
    token_event_count = 0
    first_token_at: float | None = None
    HEARTBEAT_INTERVAL = 5.0  # seconds without output before pinging the FE
    streamed_run_ids: set[str] = set()
    fast_finish_after_plan = False

    # ── Producer-consumer pattern ────────────────────────────────────────────
    # Async-for over agent.astream_events blocks the generator until the next
    # event arrives — so any heartbeat we tried to interleave inside the loop
    # would sit unflushed for the entire silence. Instead the producer task
    # streams events into a queue, and the consumer races queue-get against a
    # heartbeat timeout. Result: real-time heartbeats during LLM thinking.
    SENTINEL_DONE = object()
    SENTINEL_ERROR = object()
    event_q: asyncio.Queue = asyncio.Queue(maxsize=128)

    async def _produce_events() -> None:
        try:
            async for ev in agent.astream_events({"messages": messages}, version="v2"):
                await event_q.put(("event", ev))
            await event_q.put((SENTINEL_DONE, None))
        except Exception as exc:
            await event_q.put((SENTINEL_ERROR, exc))

    producer = asyncio.create_task(_produce_events())

    # Initial "thinking" indicator so the FE shows activity immediately —
    # the LLM's first token can be 5-30s away on a fresh container.
    yield ({"type": "thinking"})

    try:
        while True:
            try:
                tag, payload = await asyncio.wait_for(
                    event_q.get(), timeout=HEARTBEAT_INTERVAL,
                )
            except asyncio.TimeoutError:
                # Idle gap — keep the SSE connection warm and the UI animated.
                yield ({"type": "thinking"})
                continue

            if tag is SENTINEL_DONE:
                break
            if tag is SENTINEL_ERROR:
                raise payload

            event = payload
            kind = event.get("event", "")
            data = event.get("data", {})

            # ── Tool start: show "searching..." indicator ──────────────
            if kind == "on_tool_start":
                tool_name = event.get("name", "")
                tools_used.append(tool_name)

                labels = {
                    "get_places":      "🔍 Đang tìm địa điểm...",
                    "get_food_venues": "🍜 Đang tìm quán ăn...",
                    "get_combos":      "🎫 Đang tìm combo tour...",
                    "get_weather":     "🌤️ Đang kiểm tra thời tiết...",
                    "search_hotels":   "🏨 Đang tìm khách sạn...",
                    "search_flights":  "✈️ Đang tìm vé máy bay...",
                    "get_real_prices": "💰 Đang kiểm tra giá vé...",
                    "create_travel_plan": "📋 Đang lên lịch trình...",
                }
                label = labels.get(tool_name, f"⚙️ Đang xử lý {tool_name}...")
                yield ({"type": "tool_start", "tool": tool_name, "label": label})

            # ── Tool end: extract plan from output ─────────────────────
            elif kind == "on_tool_end":
                tool_name = event.get("name", "")
                if tool_name == "create_travel_plan":
                    output = data.get("output", "")
                    if hasattr(output, "content"):
                        output = output.content
                    if isinstance(output, dict):
                        output = json.dumps(output, ensure_ascii=False)
                    plan_data = _extract_plan(str(output))
                    if plan_data:
                        logger.info("[stream-extract] outcome=on_tool_end ok=true")
                        # The expensive part is already done and the FE renders
                        # the structured plan. Do not wait for another LLM call;
                        # synthesize a deterministic summary below instead.
                        fast_finish_after_plan = True
                    else:
                        # Plan was missed at on_tool_end — full_text fallback
                        # below will try again. This log lets us measure how
                        # often the primary path actually succeeds.
                        logger.warning("[stream-extract] outcome=on_tool_end ok=false")

            # ── LLM token streaming ────────────────────────────────────
            elif kind == "on_chat_model_stream":
                if event.get("run_id"):
                    streamed_run_ids.add(str(event["run_id"]))
                chunk = data.get("chunk")
                # L1: chunk carries tool_call_chunks → it's mid-serializing a
                # tool call. Any content alongside is unintended duplicate.
                if chunk and getattr(chunk, "tool_call_chunks", None):
                    logger.debug("[stream] L1 skipped content from tool-call chunk")
                    continue
                if chunk and hasattr(chunk, "content") and chunk.content:
                    token_event_count += 1
                    token = _content_to_text(chunk.content)
                    if not token:
                        continue
                    full_text += token
                    if first_token_at is None:
                        first_token_at = time.monotonic() - started_at
                        logger.info(f"[stream] first chat-model token at +{first_token_at:.2f}s")
                    clean_token = think_stripper.feed(token)
                    # L2: drop top-level {...} blocks for non-native tool calling.
                    clean_token = json_stripper.feed(clean_token)
                    if clean_token:
                        yield ({"type": "token", "content": clean_token})

            # Some OpenAI-compatible gateways accept stream=true but buffer the
            # whole answer and only emit on_chat_model_end. That is not true
            # token streaming, but surfacing the final content here prevents an
            # empty UI response.
            elif kind == "on_chat_model_end":
                run_id = str(event.get("run_id") or "")
                if run_id and run_id in streamed_run_ids:
                    continue
                output = data.get("output")
                if _has_tool_calls(output):
                    continue
                content = _message_content(output)
                if content:
                    token_event_count += 1
                    full_text += content
                    if first_token_at is None:
                        first_token_at = time.monotonic() - started_at
                        logger.info(f"[stream] first buffered chat-model output at +{first_token_at:.2f}s")
                    clean_token = think_stripper.feed(content)
                    clean_token = json_stripper.feed(clean_token)
                    if clean_token:
                        yield ({"type": "token", "content": clean_token})

            if fast_finish_after_plan:
                logger.info("[stream] Fast-finished after create_travel_plan")
                break

    except Exception as e:
        msg = str(e)
        is_stream_drop = any(
            tok in msg.lower()
            for tok in ("peer closed", "incomplete chunked read", "remoteprotocolerror")
        )
        if is_stream_drop:
            stream_dropped = True
            logger.warning(f"[stream] Upstream LLM dropped the stream: {msg}")
            yield ({
                "type": "error",
                "message": "Nhà cung cấp LLM ngắt kết nối giữa chừng. Lịch trình (nếu có) vẫn được giữ lại bên dưới.",
            })
        else:
            logger.error(f"[stream] Error: {e}")
            yield ({"type": "error", "message": msg})
    finally:
        producer.cancel()
        try:
            await producer
        except (asyncio.CancelledError, Exception):
            pass

    total_elapsed = time.monotonic() - started_at
    logger.info(
        f"[stream] done — tools={tools_used} tokens={token_event_count} "
        f"first_token={first_token_at if first_token_at else 'never'} "
        f"total={total_elapsed:.2f}s"
    )

    # ── Fallback: extract plan from full_text if on_tool_end was missed ──
    if not plan_data and "create_travel_plan" in tools_used:
        plan_data = _extract_plan(full_text)
        if plan_data:
            logger.info("[stream-extract] outcome=full_text_fallback ok=true")
        else:
            logger.error("[stream-extract] outcome=missed ok=false — plan lost despite create_travel_plan firing")

    # ── NEW: Prose extraction (v2 primary path) ────────────────────────────
    # When the agent did NOT call create_travel_plan but the response contains
    # day markers, treat it as a prose-format itinerary and project it into
    # the same GenerateResponse shape the FE consumes. This is the design
    # change that escapes the "JSON tax" Gemma struggles with: the model
    # reasons in natural Vietnamese, we structure it after the fact.
    #
    # Destination is left as None so the fuzzy resolver searches the whole
    # places table — slightly less precise than a destination-filtered query
    # but avoids fragile NER on the prose. If precision becomes an issue,
    # extract it from the day-1 title or from chat session context.
    if not plan_data and "create_travel_plan" not in tools_used:
        # The think-stripper has already cleaned reasoning tags but
        # full_text at this point still includes the day/slot bullets.
        prose_text = _strip_thinking(full_text)
        try:
            plan_data = await prose_to_plan(prose_text, destination=None)
            if plan_data:
                logger.info(
                    f"[prose-extract] outcome=ok days={len(plan_data.get('days', []))}"
                )
            else:
                logger.debug("[prose-extract] no day markers found — skipping")
        except Exception as exc:
            # Never let extractor failures break the chat response. Worst
            # case the user sees the prose without a card.
            logger.warning(f"[prose-extract] failed: {type(exc).__name__}: {exc}")

    # Emit anything still buffered by the think-stripper (post-</think> tail).
    trailing = think_stripper.flush()
    if trailing:
        trailing = json_stripper.feed(trailing)
    json_stripper.flush()
    if trailing:
        yield ({"type": "token", "content": trailing})

    # ── Clean full_text ─────────────────────────────────────────────────
    # Always strip <think>...</think> reasoning leaks. Only strip JSON dumps
    # when create_travel_plan ran — otherwise normal answers that legitimately
    # contain code/dict examples would be mangled.
    thought_clean = _strip_thinking(full_text)
    if fast_finish_after_plan and plan_data:
        clean_text = _deterministic_summary(plan_data, stream_dropped)
    elif "create_travel_plan" in tools_used:
        clean_text = _strip_json_objects(thought_clean)
    else:
        clean_text = thought_clean.strip()
    if stream_dropped and clean_text:
        clean_text += "\n\n_⚠️ Phần trả lời bị cắt giữa chừng do nhà cung cấp LLM ngắt kết nối — lịch trình đã được giữ lại._"

    # If the LLM returned nothing after create_travel_plan (free-tier
    # providers occasionally drop the second call), synthesise a short
    # Vietnamese summary from plan_data so the user still sees a reply.
    if not clean_text.strip() and plan_data:
        clean_text = _deterministic_summary(plan_data, stream_dropped)

    # ── Final event ────────────────────────────────────────────────────
    yield ({
        "type":       "done",
        "session_id": session_id,
        "tool_calls": tools_used,
        "plan":       plan_data,
        "full_text":  clean_text,
    })
