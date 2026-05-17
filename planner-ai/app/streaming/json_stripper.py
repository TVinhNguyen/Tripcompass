"""
streaming/json_stripper.py — Streaming top-level JSON dump filter.

Some providers (Gemma via Ollama Cloud) serialize tool-call arguments into
the model's `content` channel instead of the native `tool_call_chunks`
channel. The args then leak into the user-visible token stream before the
tool actually fires.

This stripper consumes tokens char-by-char and drops any balanced top-level
`{...}` block. Mirrors `summary._strip_json_objects` but runs live.

Trade-off: also strips JSON the LLM might place inside a fenced code block.
Acceptable for the travel-chat surface — code samples are not a feature.
"""
from loguru import logger


class _JsonStripper:
    """Suppress balanced top-level `{...}` JSON blocks from a token stream."""

    def __init__(self) -> None:
        self._depth = 0
        self._in_str = False
        self._esc = False
        self._dropped_total = 0

    def feed(self, token: str) -> str:
        out: list[str] = []
        for c in token:
            if self._depth > 0:
                self._dropped_total += 1
                if self._esc:
                    self._esc = False
                elif c == "\\" and self._in_str:
                    self._esc = True
                elif c == '"':
                    self._in_str = not self._in_str
                elif not self._in_str:
                    if c == "{":
                        self._depth += 1
                    elif c == "}":
                        self._depth -= 1
                continue
            if c == "{":
                self._depth = 1
                self._in_str = False
                self._esc = False
                self._dropped_total += 1
                continue
            out.append(c)
        return "".join(out)

    def flush(self) -> str:
        """End of stream — log + reset. Any unclosed JSON tail is dropped."""
        if self._dropped_total > 0:
            logger.warning(
                f"[json-stripper] dropped {self._dropped_total} chars of leaked JSON "
                f"(depth-at-end={self._depth})"
            )
        self._depth = 0
        self._in_str = False
        self._esc = False
        self._dropped_total = 0
        return ""
