# Vietnam Destinations Master List (No-LLM Crawl Plan)

Mục tiêu: phủ đủ điểm đến trên toàn Việt Nam, crawl + validate bằng Tavily/Apify/SerpAPI, sau đó import dần vào DB.

> Cập nhật theo mô hình **34 đơn vị hành chính cấp tỉnh** (28 tỉnh + 6 thành phố trực thuộc trung ương).

## 34 tỉnh/thành

### Thành phố trực thuộc trung ương (6)
- [x] Hà Nội ✅ (20 places: 11 attractions + 9 food - MANUALLY VERIFIED)
- [x] Hải Phòng ✅ (23 places: 15 attractions + 8 food - MANUALLY VERIFIED 2026-04-08)
- [x] Huế ✅ (23 places: 15 attractions + 8 food - MANUALLY VERIFIED 2026-04-08)
- [x] Đà Nẵng ✅ (27 places: 15 attractions + 12 food)
- [x] Cần Thơ ✅ (20 places: 12 attractions + 8 food - TAVILY + APIFY VERIFIED 2026-04-10)
- [x] Hồ Chí Minh ✅ (23 places: 15 attractions + 8 food - CORRECTED & RE-IMPORTED 2026-04-08)

### Tỉnh (28)
- [x] An Giang ✅ (~17 attractions + food - TRIPADVISOR IMPORT 2026-04-25)
- [x] Bắc Ninh ✅ (~17 attractions + food - TRIPADVISOR IMPORT 2026-04-25)
- [x] Cao Bằng ✅ (~17 attractions + food - TRIPADVISOR IMPORT 2026-04-25)
- [x] Cà Mau ✅ (~17 attractions + food - TRIPADVISOR IMPORT 2026-04-25)
- [x] Đồng Nai ✅ (~17 attractions + food - TRIPADVISOR IMPORT 2026-04-25)
- [x] Đồng Tháp ✅ (~17 attractions + food - TRIPADVISOR IMPORT 2026-04-25)
- [x] Đắk Lắk ✅ (~17 attractions + food - TRIPADVISOR IMPORT 2026-04-25)
- [x] Gia Lai ✅ (~17 attractions + food - TRIPADVISOR IMPORT 2026-04-25)
- [x] Hà Tĩnh ✅ (~17 attractions + food - TRIPADVISOR IMPORT 2026-04-25)
- [x] Hưng Yên ✅ (attractions OK; food: re-import pending with --skip-existing-external)
- [x] Khánh Hòa ✅ (23 places: 15 attractions + 8 food - TAVILY + SERPAPI VERIFIED 2026-04-10)
- [x] Lai Châu ✅ (~17 attractions + food - TRIPADVISOR IMPORT 2026-04-25)
- [x] Lâm Đồng ✅ (23 places: 15 attractions + 8 food - TAVILY + APIFY VERIFIED 2026-04-10)
- [x] Lạng Sơn ✅ (attractions OK; food: re-import pending with --skip-existing-external)
- [x] Lào Cai ✅ (25 places: 16 attractions + 9 food - TAVILY + APIFY VERIFIED 2026-04-10)
- [x] Nghệ An ✅ (16 places: 10 attractions + 6 food - SERPAPI VERIFIED 2026-04-10)
- [x] Ninh Bình ✅ (23 places: 15 attractions + 8 food - SERPAPI VERIFIED 2026-04-10)
- [x] Phú Thọ ✅ (~17 attractions + food - TRIPADVISOR IMPORT 2026-04-25)
- [x] Quảng Ninh ✅ (23 places: 15 attractions + 8 food - SERPAPI VERIFIED 2026-04-10)
- [x] Quảng Ngãi ✅ (~17 attractions + food - TRIPADVISOR IMPORT 2026-04-25)
- [x] Quảng Trị ✅ (15 places: 10 attractions + 5 food - SERPAPI VERIFIED 2026-04-10)
- [ ] Sơn La ⚠ (food only; attractions: TripAdvisor upstream 500 → cần Tavily fallback)
- [x] Tây Ninh ✅ (~17 attractions + food - TRIPADVISOR IMPORT 2026-04-25)
- [x] Thái Nguyên ✅ (attractions OK; food: re-import pending with --skip-existing-external)
- [x] Thanh Hóa ✅ (~17 attractions + food - TRIPADVISOR IMPORT 2026-04-25)
- [x] Tuyên Quang ✅ (~17 attractions + food - TRIPADVISOR IMPORT 2026-04-25)
- [x] Vĩnh Long ✅ (~17 attractions + food - TRIPADVISOR IMPORT 2026-04-25)
- [x] Điện Biên ✅ (~17 attractions + food - TRIPADVISOR IMPORT 2026-04-25)

## Quy trình chuẩn cho mỗi điểm đến
1. Crawl tavily theo category (attractions + food), combos.
2. Validate/chuẩn hóa qua apify (tọa độ, rating, ảnh).
4. Gộp dữ liệu, chấm confidence, giữ bản chất lượng cao.
5. Import batch vào endpoint `/api/v1/knowledge-base/seed`.
6. Cập nhật checklist và log kết quả.

## Nhật ký chạy

### 2026-04-07
- Khởi tạo danh sách master.
- Cập nhật danh mục theo 34 tỉnh/thành.
- Trạng thái: chuẩn bị chạy batch đầu tiên.

### 2026-04-08
- ✅ **Đà Nẵng** completed: 27 places imported (15 attractions + 12 food)
  - Deleted 13 old places
  - Verified prices: Ba Na Hills (1M VND), My Khe Beach (free), etc.
  - All fields complete and accurate
  
- ✅ **Hà Nội** completed: 20 places imported (11 attractions + 9 food)
  - Deleted 92 old automated import places
  - Tavily discovery + WebSearch verification
  - Fixed area mapping (West Lake, Tran Quoc → north)
  - Michelin-starred restaurants included
  
- ✅ **HỒ CHÍ MINH** completed: 23 places imported (15 attractions + 8 food)
  - Tavily + WebSearch discovery
  - 3 Michelin-starred restaurants: Anan Saigon, AKUNA, Long Trieu
  - Major attractions: War Remnants Museum, Independence Palace, Cu Chi Tunnels
  - Status: Ready for next destinations (Huế, Hải Phòng priority)

### 2026-04-25 — Session TripAdvisor Bulk Import
- ✅ **19 tỉnh mới** import via TripAdvisor omkar API (scraper-service/scripts/tripadvisor_import.py)
  - Script: `tripadvisor_import.py` (mới tạo session này)
  - Destinations thành công (attractions): An Giang, Bắc Ninh, Cao Bằng, Cà Mau, Đồng Nai, Đồng Tháp, Đắk Lắk, Gia Lai, Hà Tĩnh, **Hưng Yên**, Lai Châu, **Lạng Sơn**, Phú Thọ, Quảng Ngãi, Tây Ninh, **Thái Nguyên**, Thanh Hóa, Tuyên Quang, Vĩnh Long, Điện Biên
  - Food thành công: 18/21 tỉnh (Hưng Yên, Lạng Sơn, Thái Nguyên FAIL — unique constraint collision)
  - **Sơn La** (location_id 12612245): attractions 500 upstream error, chỉ có food → cần Tavily fallback
  - Tổng DB: ~1100 rows
- ⚙ **Code changes** (planner-ai refactor uncommitted — commit tiếp theo):
  - `app/services/planning_service.py` (new)
  - `tests/test_planning_service.py` (new)
  - `app/routes/plan.py`, `app/schemas.py`, `app/tools/create_plan.py` (modified)
  - `app/tools/get_places.py`, `app/tools/get_food_venues.py` — preference soft rank
- 🔧 **Fix applied**: `tripadvisor_import.py` thêm `--skip-existing-external` + `--bulk-fail-food`
- 📷 **New**: `tripadvisor_photos_backfill.py` để backfill nhiều ảnh từ official TA API
- 🔒 **Security**: API keys chuyển vào .env, test_tripadvisor_api.py → .gitignore

### TODO tiếp theo
- [ ] Chạy `python tripadvisor_import.py --bulk-fail-food --skip-existing-external` để fix Hưng Yên, Lạng Sơn, Thái Nguyên
- [ ] Chạy `python tripadvisor_photos_backfill.py --bulk-new --min-photos 3` để backfill ảnh
- [ ] Sơn La attractions: thử `python tavily_only_import.py --dest "Sơn La"`
- [ ] Backfill lat/lng cho 340 attractions mới qua Apify enrich
- [ ] Commit planner-ai refactor (pytest phải pass trước)
- [ ] Combos seed cho 5 destinations ưu tiên
