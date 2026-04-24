#!/usr/bin/env python3
"""
Quick import for 4 cities first: Hà Nội, HCM, Đà Nẵng, Huế
Test workflow before rolling out to all 34 destinations
"""

import sys
sys.path.insert(0, str(__import__('pathlib').Path(__file__).parent.parent))

from scripts.direct_import_all import import_destination

PRIORITY_4_CITIES = [
    ("Hà Nội", "Hanoi"),
    ("TP. Hồ Chí Minh", "Ho Chi Minh City"),
    ("Đà Nẵng", "Da Nang"),
    ("Huế", "Hue"),
]

if __name__ == "__main__":
    print("🚀 Quick Import: 4 Priority Cities")
    print("=" * 70)

    for i, (city, city_en) in enumerate(PRIORITY_4_CITIES, 1):
        print(f"\n[{i}/4] {city}")
        try:
            import_destination(city, city_en)
        except Exception as e:
            print(f"  ❌ Error: {e}")
            import traceback
            traceback.print_exc()

    print("\n" + "=" * 70)
    print("✅ 4-city import complete!")
