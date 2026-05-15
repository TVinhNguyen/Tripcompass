"""
streaming/summary.py — Post-processing for agent output text.

- _strip_json_objects: removes leaked JSON dumps from LLM text.
- _deterministic_summary: generates a short Vietnamese recap from plan data
  when the LLM's post-tool call returned no text.
"""
import re


def _strip_json_objects(text: str) -> str:
    """Remove raw JSON dumps from text while preserving normal markdown content.

    Designed for the post-create_travel_plan path where the LLM sometimes leaks
    the full plan JSON before its natural-language summary. The function:

      - PRESERVES fenced code blocks (```...```) unless they are explicitly
        tagged ```json — Python/Bash/ASCII diagrams etc. are user-facing.
      - REMOVES top-level balanced { ... } JSON objects (the leaked plan dump).
      - Falls back to a markdown-line heuristic only when stripping ate almost
        everything (defensive — should rarely fire).
    """
    result: list[str] = []
    i = 0
    n = len(text)

    while i < n:
        # Fenced code block — keep verbatim unless it's a ```json block.
        if text[i:i+3] == '```':
            end_fence = text.find('```', i + 3)
            if end_fence == -1:
                # Unterminated fence — preserve the rest of the text as-is.
                result.append(text[i:])
                break
            block = text[i:end_fence + 3]
            lang_line = block[3:].split('\n', 1)[0].strip().lower()
            if lang_line == 'json':
                # Explicit JSON block — drop it.
                i = end_fence + 3
                continue
            result.append(block)
            i = end_fence + 3
            continue

        # Top-level balanced JSON object — drop it.
        if text[i] == '{':
            depth = 1
            j = i + 1
            in_str = False
            esc = False
            while j < n and depth > 0:
                c = text[j]
                if esc:
                    esc = False
                elif c == '\\' and in_str:
                    esc = True
                elif c == '"':
                    in_str = not in_str
                elif not in_str:
                    if c == '{':
                        depth += 1
                    elif c == '}':
                        depth -= 1
                j += 1
            if depth == 0:
                i = j
                continue
            # Unclosed brace — likely not JSON. Treat as literal text.
            result.append(text[i])
            i += 1
            continue

        result.append(text[i])
        i += 1

    cleaned = ''.join(result).strip()

    # Defensive: if stripping ate almost everything but original had content,
    # try to recover from the first markdown-ish line.
    if len(cleaned) < 50 and len(text) > 200:
        md_match = re.search(
            r'^(?:Mình đã|##? |[\*\-] |\*\*|🎉|📅|💰|📌|Đây là)',
            text,
            re.MULTILINE,
        )
        if md_match:
            cleaned = text[md_match.start():].strip()

    return cleaned


_DAY_LABEL = {"arrival": "Đến nơi", "departure": "Trở về", "standard": ""}


def _deterministic_summary(plan: dict, stream_dropped: bool) -> str:
    """Produce a short Vietnamese reply from a GenerateResponse-shaped plan.

    Used as a fallback when the agent's post-tool LLM call returned no text
    (e.g. the upstream provider dropped the connection). The reply is
    intentionally terse: the FE renders the plan card right below it.
    """
    days = plan.get("days") or []
    dest = (days[0].get("primary_area") if days else None) or "chuyến đi"
    num_days = len(days) or "?"

    lines: list[str] = [
        f"Mình đã lên xong lịch trình **{num_days} ngày tại {dest}** cho bạn rồi! 🎉",
        "",
    ]
    for d in days[:7]:
        names = [
            s["place"]["name"]
            for s in (d.get("slots") or [])
            if isinstance(s.get("place"), dict) and s["place"].get("name")
        ]
        if not names:
            continue
        label = _DAY_LABEL.get(d.get("day_type", ""), "")
        prefix = f"**Ngày {d.get('day_num')}**" + (f" — {label}" if label else "")
        lines.append(f"- {prefix}: {' · '.join(names)}")

    recap = plan.get("budget_recap") or {}
    total = recap.get("total_budget_vnd")
    spent = (recap.get("attraction_spent_vnd") or 0) + (recap.get("food_spent_vnd") or 0)
    if total:
        lines += [
            "",
            f"💰 Ngân sách: **{int(spent):,}₫ / {int(total):,}₫**".replace(",", "."),
        ]

    if stream_dropped:
        lines += [
            "",
            "_⚠️ Phần mô tả chi tiết bị cắt do nhà cung cấp LLM ngắt kết nối — bạn vẫn lưu và chỉnh sửa được lịch trình bên dưới._",
        ]
    else:
        lines += [
            "",
            "Bạn muốn mình **điều chỉnh** chỗ nào hay **lưu thành lịch trình** luôn?",
        ]
    return "\n".join(lines)
