"""
streaming/think_stripper.py — Streaming-friendly <think>...</think> reasoning filter.

Reasoning models (minimax, qwen-thinking, etc.) emit chain-of-thought
wrapped in <think>...</think>. This module provides both a streaming filter
(_ThinkStripper) and a regex-based post-hoc cleaner (_strip_thinking).
"""
import re


class _ThinkStripper:
    """Stream-friendly filter that suppresses <think>...</think> reasoning.

    Reasoning models (minimax, qwen-thinking, etc.) emit chain-of-thought
    wrapped in <think>...</think>. The wrapping is sometimes asymmetric — a
    lone </think> shows up because the API dropped the opening tag. We treat
    both cases as thinking:

      explicit:    <think>plan a plan</think>actual reply
      implicit:    plan a plan</think>actual reply

    Initial buffer:
      To prevent leaked-reasoning from flashing in the UI before we see the
      first </think>, we hold the FIRST ``initial_buffer_chars`` of output
      for up to ``initial_buffer_seconds``. If </think> arrives in that
      window we drop the prefix; otherwise we treat the model as
      non-reasoning and flush.

    Beyond that window the stripper holds back only ``_HOLD`` bytes so a tag
    straddling two tokens isn't mistakenly emitted.
    """

    _OPEN = "<think>"
    _CLOSE = "</think>"
    _HOLD = 8  # len("</think>")

    def __init__(
        self,
        initial_buffer_chars: int = 80,
        initial_buffer_seconds: float = 0.4,
    ) -> None:
        # Initial buffer exists ONLY to catch a lone </think> that some providers
        # emit without an opening tag. As soon as the first 80 chars (or 0.4s)
        # pass without seeing any '<', we flush — otherwise non-thinking models
        # like Gemma/GPT/Claude get their entire short reply held silently and
        # the FE never sees streaming.
        self._pending = ""
        self._in_think = False
        self._initial_buffer_chars = initial_buffer_chars
        self._initial_buffer_seconds = initial_buffer_seconds
        self._initial_started: float | None = None
        self._initial_done = False
        self._buffered_initial = ""

    def _initial_phase_active(self) -> bool:
        if self._initial_done or self._initial_buffer_chars <= 0:
            return False
        import time
        if self._initial_started is None:
            self._initial_started = time.monotonic()
        if len(self._buffered_initial) >= self._initial_buffer_chars:
            return False
        if (time.monotonic() - self._initial_started) >= self._initial_buffer_seconds:
            return False
        return True

    def _close_initial(self) -> str:
        """Finalize the initial buffering window.

        If a lone </think> appeared inside the window (no preceding <think>),
        drop everything up to it — that prefix was leaked reasoning. For an
        explicit <think>...</think> pair we leave the text alone; the regular
        state machine downstream will strip the block.
        """
        self._initial_done = True
        text = self._buffered_initial
        self._buffered_initial = ""
        close_idx = text.find(self._CLOSE)
        open_idx = text.find(self._OPEN)
        if close_idx >= 0 and (open_idx < 0 or close_idx < open_idx):
            text = text[close_idx + len(self._CLOSE):].lstrip()
        return text

    def feed(self, token: str) -> str:
        # Initial-buffer phase: hold tokens just long enough to catch a lone
        # </think> at the very start (some providers drop the opening tag).
        # The moment we either (a) see ANY think marker, or (b) see plain
        # text with no '<' (so a tag can't be straddling), flush immediately.
        if self._initial_phase_active():
            self._buffered_initial += token
            saw_marker = (
                self._CLOSE in self._buffered_initial
                or self._OPEN in self._buffered_initial
            )
            if saw_marker:
                token = self._close_initial()
                if not token:
                    return ""
            elif "<" not in self._buffered_initial:
                # No tag possible — release the buffer NOW for snappy UX.
                # This is what makes non-thinking models (Gemma/Claude/GPT)
                # actually stream token-by-token instead of being held silent.
                token = self._close_initial()
                if not token:
                    return ""
            else:
                # '<' seen but no full marker yet — keep buffering up to the
                # char/time budget (could be a tag straddling chunks).
                return ""
        elif self._buffered_initial:
            # Budget exhausted before any marker — flush whatever we held.
            token = self._close_initial() + token

        self._pending += token
        out: list[str] = []
        while True:
            if self._in_think:
                idx = self._pending.find(self._CLOSE)
                if idx >= 0:
                    self._pending = self._pending[idx + len(self._CLOSE):].lstrip()
                    self._in_think = False
                    continue
                if len(self._pending) > self._HOLD:
                    self._pending = self._pending[-self._HOLD:]
                return "".join(out)

            open_idx = self._pending.find(self._OPEN)
            close_idx = self._pending.find(self._CLOSE)

            # Lone </think> before any <think> — treat what came before as
            # leaked reasoning, drop it. Tokens already emitted to the FE will
            # be replaced by clean_text in the final `done` event.
            if close_idx >= 0 and (open_idx < 0 or close_idx < open_idx):
                self._pending = self._pending[close_idx + len(self._CLOSE):].lstrip()
                continue

            if open_idx >= 0:
                out.append(self._pending[:open_idx])
                self._pending = self._pending[open_idx + len(self._OPEN):]
                self._in_think = True
                continue

            if len(self._pending) > self._HOLD:
                out.append(self._pending[:-self._HOLD])
                self._pending = self._pending[-self._HOLD:]
            return "".join(out)

    def flush(self) -> str:
        # If the stream ended while we were still in the initial buffer
        # window, finalize it (drop any lone </think> prefix) before
        # spilling the pending tail.
        prefix = ""
        if self._buffered_initial:
            prefix = self._close_initial()
        if self._in_think:
            return prefix
        out = prefix + self._pending
        self._pending = ""
        return out


def _strip_thinking(text: str) -> str:
    """Regex pass for the final clean_text — removes any <think>...</think>
    blocks plus a lone </think> + everything before it, so the FE's `done`
    event always carries a clean reply.
    """
    # 1. Explicit blocks anywhere.
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    # 2. Lone </think> — drop preceding leaked reasoning, keep the rest.
    text = re.sub(r"^.*?</think>", "", text, count=1, flags=re.DOTALL)
    # 3. Any stray closer that survived.
    text = text.replace("</think>", "")
    return text.lstrip()
