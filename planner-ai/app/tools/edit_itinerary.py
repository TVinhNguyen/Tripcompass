"""
tools/edit_itinerary.py — Propose granular edits to the user's CURRENT itinerary.

This tool does NOT write to the database. It validates + normalises a list of
edit operations and returns them as JSON; the streaming layer (pump.py) forwards
them to the frontend, which previews the changes and — only after the user
confirms — applies each one through the SAME REST + WebSocket path a human edit
uses, so collaborators see the changes in realtime.

`activity_id` values come from the itinerary context the agent was given. Op
shapes:
    {"op": "add",    "day_number": 1, "title": "...", "category": "FOOD",
     "start_time": "08:00", "estimated_cost": 50000, "notes": "..."}
    {"op": "update", "activity_id": "<uuid>", "start_time": "09:30", ...}
    {"op": "delete", "activity_id": "<uuid>"}
"""
import json

from langchain_core.tools import tool

# Mirrors the FE API_CATEGORY values (frontend .../edit/_lib/constants.tsx) and
# the schema_travel.category enum the activity endpoints accept.
_VALID_CATEGORIES = {"FOOD", "ATTRACTION", "TRANSPORT", "STAY", "ACTIVITY"}
_VALID_OPS = {"add", "update", "delete"}


def _copy_optional_fields(raw: dict, out: dict) -> None:
    """Copy the editable fields that survive validation from raw → out.

    LLMs frequently return numbers as strings (``"day_number": "3"``) or use
    alternate key names (``day`` instead of ``day_number``).  We coerce to the
    canonical types so the normaliser doesn't silently drop valid ops.
    """
    title = raw.get("title") or raw.get("name")
    if isinstance(title, str) and title.strip():
        out["title"] = title.strip()

    cat = raw.get("category")
    if isinstance(cat, str) and cat.strip().upper() in _VALID_CATEGORIES:
        out["category"] = cat.strip().upper()

    start = raw.get("start_time")
    if isinstance(start, str) and start.strip():
        out["start_time"] = start.strip()[:5]  # HH:MM

    day = raw.get("day_number") or raw.get("day")
    day = _to_positive_int(day)
    if day is not None:
        out["day_number"] = day

    cost = raw.get("estimated_cost") or raw.get("cost") or raw.get("price")
    cost = _to_non_negative_number(cost)
    if cost is not None:
        out["estimated_cost"] = cost

    notes = raw.get("notes") or raw.get("description")
    if isinstance(notes, str) and notes.strip():
        out["notes"] = notes.strip()


def _to_positive_int(value: object) -> int | None:
    """Coerce value to a positive int, accepting strings and floats."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value >= 1 else None
    if isinstance(value, float) and value == int(value):
        return int(value) if int(value) >= 1 else None
    if isinstance(value, str):
        try:
            n = int(value.strip())
            return n if n >= 1 else None
        except ValueError:
            return None
    return None


def _to_non_negative_number(value: object) -> int | None:
    """Coerce value to a non-negative int, accepting strings and floats."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value) if value >= 0 else None
    if isinstance(value, str):
        try:
            return max(0, int(float(value.strip())))
        except ValueError:
            return None
    return None


def _normalise_op(raw: object) -> dict | None:
    """Validate one op, returning a clean dict or None to drop it."""
    if not isinstance(raw, dict):
        return None
    op = str(raw.get("op") or "").strip().lower()
    if op not in _VALID_OPS:
        return None

    # The itinerary context labels each activity `id`; small models often echo
    # that key instead of the op's `activity_id`. Accept either so a correct
    # reference isn't dropped (an update/delete with no id silently produced an
    # empty ops list → no preview card on the FE).
    if op in ("delete", "update"):
        aid = raw.get("activity_id") or raw.get("id")
        if not aid:
            return None
        if op == "delete":
            return {"op": "delete", "activity_id": str(aid)}
        out = {"op": "update", "activity_id": str(aid)}
        _copy_optional_fields(raw, out)
        # An update that changes nothing is a no-op — drop it.
        return out if len(out) > 2 else None

    # op == "add"
    out = {"op": "add"}
    _copy_optional_fields(raw, out)
    if "title" not in out or "day_number" not in out:
        return None  # an add needs at least a title + day to be actionable
    out.setdefault("category", "ACTIVITY")
    # When the agent grounded the suggestion in a real DB place (via the place
    # lookup tools), it passes that place's id — thread it so the created
    # activity links to the Place (detail page, location, coords) instead of
    # being free text. The backend validates it exists.
    pid = raw.get("place_id")
    if isinstance(pid, str) and pid.strip():
        out["place_id"] = pid.strip()
    return out


@tool
async def edit_itinerary(ops: list[dict]) -> str:
    """Đề xuất chỉnh sửa các hoạt động trong lịch trình HIỆN TẠI của user (thêm/sửa/xoá).

    CHỈ dùng khi dữ liệu lịch trình hiện tại đã được cung cấp và user muốn thay đổi
    các hoạt động cụ thể (đổi giờ, đổi ngày, thêm, xoá, sửa mô tả). KHÔNG dùng để
    tạo lịch trình mới — lịch mới viết theo ĐỊNH DẠNG LỊCH TRÌNH dạng văn bản.
    Tham chiếu hoạt động cần sửa/xoá bằng activity_id có trong dữ liệu lịch trình.

    Mỗi phần tử trong ops:
      - {"op":"add","day_number":N,"title":"...","category":"FOOD|ATTRACTION|TRANSPORT|STAY|ACTIVITY","start_time":"HH:MM","estimated_cost":int,"notes":"...","place_id":"<id từ kết quả tra cứu địa điểm nếu có>"}
      - {"op":"update","activity_id":"...", + các trường cần đổi}
      - {"op":"delete","activity_id":"..."}

    activity_id: dùng đúng giá trị `id` của hoạt động trong dữ liệu lịch trình.
    place_id (chỉ cho "add"): nếu địa điểm mới lấy từ kết quả tra cứu địa điểm/quán ăn,
    truyền `id` của nó vào đây để hoạt động liên kết với địa điểm thật.
    """
    if not isinstance(ops, list):
        return json.dumps({"success": False, "error": "ops must be a list", "ops": []}, ensure_ascii=False)
    normalised = [op for op in (_normalise_op(o) for o in ops) if op]
    return json.dumps({"success": True, "ops": normalised}, ensure_ascii=False)
