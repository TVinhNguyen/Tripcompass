#!/usr/bin/env python3
"""
Validate data quality after import
"""

import os
import httpx

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8080").rstrip("/")
LOOKUP_URL = f"{BACKEND_URL}/api/v1/knowledge-base/lookup"

DESTINATIONS = [
    "Hà Nội", "Hải Phòng", "Huế", "Đà Nẵng", "Cần Thơ", "TP. Hồ Chí Minh",
    "An Giang", "Bắc Ninh", "Cao Bằng", "Cà Mau", "Đồng Nai", "Đồng Tháp",
    "Đắk Lắk", "Gia Lai", "Hà Tĩnh", "Hưng Yên", "Khánh Hòa", "Lai Châu",
    "Lâm Đồng", "Lạng Sơn", "Lào Cai", "Nghệ An", "Ninh Bình", "Phú Thọ",
    "Quảng Ninh", "Quảng Ngãi", "Quảng Trị", "Sơn La", "Tây Ninh", "Thái Nguyên",
    "Thanh Hóa", "Tuyên Quang", "Vĩnh Long", "Điện Biên",
]

def validate_destination(destination: str) -> dict:
    """Check quality of data for one destination."""
    try:
        resp = httpx.get(LOOKUP_URL, params={"destination": destination, "stale_days": "9999"}, timeout=5.0)
        if resp.status_code != 200:
            return {"error": f"HTTP {resp.status_code}"}

        data = resp.json()
        places = data.get("places", [])

        stats = {
            "total": len(places),
            "attractions": 0,
            "food": 0,
            "with_image": 0,
            "with_name_en": 0,
            "with_price": 0,
            "missing_address": 0,
            "missing_hours": 0,
            "missing_image": 0,
            "missing_name_en": 0,
        }

        for p in places:
            if p.get("category") == "ATTRACTION":
                stats["attractions"] += 1
            elif p.get("category") == "FOOD":
                stats["food"] += 1

            if p.get("cover_image"):
                stats["with_image"] += 1
            else:
                stats["missing_image"] += 1

            if p.get("name_en"):
                stats["with_name_en"] += 1
            else:
                stats["missing_name_en"] += 1

            if p.get("base_price"):
                stats["with_price"] += 1

            if not p.get("address"):
                stats["missing_address"] += 1
            if not p.get("hours"):
                stats["missing_hours"] += 1

        return stats
    except Exception as e:
        return {"error": str(e)}


def main():
    print("\n" + "=" * 80)
    print("📊 DATA QUALITY VALIDATION")
    print("=" * 80)

    all_stats = {}
    total_places = 0
    total_missing_image = 0
    total_missing_name_en = 0

    for dest in DESTINATIONS:
        stats = validate_destination(dest)
        all_stats[dest] = stats

        if "error" in stats:
            print(f"\n❌ {dest:20} - {stats['error']}")
        else:
            total = stats.get("total", 0)
            missing_img = stats.get("missing_image", 0)
            missing_en = stats.get("missing_name_en", 0)

            total_places += total
            total_missing_image += missing_img
            total_missing_name_en += missing_en

            if total == 0:
                print(f"\n⚠️  {dest:20} - No data")
            else:
                img_status = "✓" if missing_img == 0 else "⚠️ "
                en_status = "✓" if missing_en == 0 else "⚠️ "
                print(f"\n✓ {dest:20} - {total:3d} places ({stats['attractions']} attr, {stats['food']} food)")
                print(f"   {img_status} Images: {stats['with_image']}/{total} " +
                      f"({missing_img} missing)" if missing_img > 0 else "")
                print(f"   {en_status} name_en: {stats['with_name_en']}/{total} " +
                      f"({missing_en} missing)" if missing_en > 0 else "")
                if stats.get("with_price", 0) > 0:
                    print(f"   💰 Prices: {stats['with_price']} places")

    print(f"\n" + "=" * 80)
    print(f"📈 SUMMARY")
    print(f"=" * 80)
    print(f"Total places: {total_places}")
    print(f"Missing images: {total_missing_image}")
    print(f"Missing name_en: {total_missing_name_en}")
    print(f"Data quality: {100 * (total_places - total_missing_image - total_missing_name_en) / max(total_places, 1):.1f}%")


if __name__ == "__main__":
    main()
