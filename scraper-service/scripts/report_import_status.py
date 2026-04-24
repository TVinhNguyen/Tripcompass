#!/usr/bin/env python3
"""
Real-time import status report
Run this while import is running to see progress
"""

import os
import sys
import httpx
from datetime import datetime

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8080").rstrip("/")
LOOKUP_URL = f"{BACKEND_URL}/api/v1/knowledge-base/lookup"

ALL_34_DESTINATIONS = [
    "Hà Nội", "Hải Phòng", "Huế", "Đà Nẵng", "Cần Thơ", "TP. Hồ Chí Minh",
    "An Giang", "Bắc Ninh", "Cao Bằng", "Cà Mau", "Đồng Nai", "Đồng Tháp",
    "Đắk Lắk", "Gia Lai", "Hà Tĩnh", "Hưng Yên", "Khánh Hòa", "Lai Châu",
    "Lâm Đồng", "Lạng Sơn", "Lào Cai", "Nghệ An", "Ninh Bình", "Phú Thọ",
    "Quảng Ninh", "Quảng Ngãi", "Quảng Trị", "Sơn La", "Tây Ninh", "Thái Nguyên",
    "Thanh Hóa", "Tuyên Quang", "Vĩnh Long", "Điện Biên",
]

def check_destination(destination: str) -> dict:
    try:
        resp = httpx.get(LOOKUP_URL, params={"destination": destination, "stale_days": "9999"}, timeout=5.0)
        if resp.status_code != 200:
            return {}

        data = resp.json()
        places = data.get("places", [])
        if not places:
            return {}

        stats = {
            "total": len(places),
            "attractions": sum(1 for p in places if p.get("category") == "ATTRACTION"),
            "food": sum(1 for p in places if p.get("category") == "FOOD"),
            "with_images": sum(1 for p in places if p.get("cover_image")),
            "with_name_en": sum(1 for p in places if p.get("name_en")),
            "with_prices": sum(1 for p in places if p.get("base_price")),
        }
        return stats
    except:
        return {}

def main():
    print("\n" + "=" * 90)
    print(f"📊 IMPORT STATUS REPORT - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 90)

    total_places = 0
    total_with_images = 0
    total_with_name_en = 0
    total_with_prices = 0
    completed = 0

    print(f"\n{'Destination':<20} {'Total':<8} {'Attr':<6} {'Food':<6} {'Images':<8} {'name_en':<8} {'Prices':<8}")
    print("-" * 90)

    for dest in ALL_34_DESTINATIONS:
        stats = check_destination(dest)
        if stats:
            completed += 1
            total = stats["total"]
            total_places += total
            total_with_images += stats["with_images"]
            total_with_name_en += stats["with_name_en"]
            total_with_prices += stats["with_prices"]

            img_pct = f"{100*stats['with_images']//max(total,1)}%" if total > 0 else "0%"
            en_pct = f"{100*stats['with_name_en']//max(total,1)}%" if total > 0 else "0%"
            pr_pct = f"{100*stats['with_prices']//max(total,1)}%" if total > 0 else "0%"

            print(f"{dest:<20} {total:<8} {stats['attractions']:<6} {stats['food']:<6} "
                  f"{img_pct:<8} {en_pct:<8} {pr_pct:<8}")

    print("-" * 90)
    print(f"\n📈 SUMMARY:")
    print(f"   Destinations with data: {completed}/34")
    print(f"   Total places: {total_places}")
    print(f"   With images: {total_with_images}/{total_places} ({100*total_with_images//max(total_places,1)}%)")
    print(f"   With name_en: {total_with_name_en}/{total_places} ({100*total_with_name_en//max(total_places,1)}%)")
    print(f"   With prices: {total_with_prices}/{total_places} ({100*total_with_prices//max(total_places,1)}%)")

    print(f"\n💾 Data completeness: {100*min(total_with_images, total_with_name_en, total_with_prices)//max(total_places,1)}%")
    print("=" * 90)

    if completed < 34:
        print(f"\n⏳ Still importing... ({34-completed} destinations pending)")
    else:
        print(f"\n✅ IMPORT COMPLETE!")

if __name__ == "__main__":
    main()
