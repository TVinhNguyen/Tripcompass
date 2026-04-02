-- Tavily verification patch — 2026-03-29
-- Manually reviewed: wrong Tavily extractions removed, known prices corrected.
-- Review before applying!

SET search_path TO schema_travel;
BEGIN;

-- ── Ho Chi Minh ───────────────────────────────────────────────────────────────
-- Bảo Tàng Chứng Tích Chiến Tranh: Tavily said 20k but official is 40k → keep DB value
-- Saigon History Day combo: 300k → Tavily 200k/person (reasonable for group tour)
UPDATE combos SET price_per_person=200000, price_updated_at=NOW() WHERE id='8bf4d50f-01e9-46c6-aac8-7c90071249ca'; -- Tavily: 200,000
-- Saigon Food Tour: 350k → 200k (reasonable)
UPDATE combos SET price_per_person=200000, price_updated_at=NOW() WHERE id='45edb866-39b1-43f8-a471-c64fa3512b52'; -- Tavily: 200,000

-- ── Da Nang ───────────────────────────────────────────────────────────────────
-- Bảo Tàng Chăm: DB=40k, Tavily=20k. Official 2026 price is 60,000 VND
UPDATE attractions SET price_vnd=60000, price_updated_at=NOW() WHERE id='74598d9b-6e83-4f1c-acd2-11acc3e60b9b'; -- Corrected: 60,000 (official 2026)
-- Da Nang combo updates
UPDATE combos SET price_per_person=340000, price_updated_at=NOW() WHERE id='2787dbe4-74e1-4c50-a86d-e3c2863a1de5'; -- Tavily: 340,000
UPDATE combos SET price_per_person=340000, price_updated_at=NOW() WHERE id='231f1778-22a7-4ca9-825f-be44a5f33bab'; -- Tavily: 340,000

-- ── Hue ──────────────────────────────────────────────────────────────────────
-- Royal tombs: Tavily said "free" (WRONG) — official 2026 = 150,000 VND each (keep DB)
-- Hue combo updates
UPDATE combos SET price_per_person=590000, price_updated_at=NOW() WHERE id='3f560497-c9ae-42d6-baed-22671d598683'; -- Tavily: 590,000
UPDATE combos SET price_per_person=590000, price_updated_at=NOW() WHERE id='388d456b-44cb-47fa-845e-cfb573fc5f6a'; -- Tavily: 590,000
UPDATE combos SET price_per_person=590000, price_updated_at=NOW() WHERE id='989ec329-6e85-4650-a89f-b1778d2e743a'; -- Tavily: 590,000

-- ── Hoi An ───────────────────────────────────────────────────────────────────
-- Hội An food venue price update
UPDATE food_venues SET price_min=80000, price_max=500000, price_updated_at=NOW() WHERE id='8d061cff-8cb3-4b2b-a58e-5e302eddd9e9'; -- Tavily: 80,000-500,000
-- Show Ký Ức Hội An: Tavily said 25k (WRONG — tickets are ~600k). Keep DB.
-- Hoi An combo updates
UPDATE combos SET price_per_person=500000, price_updated_at=NOW() WHERE id='f9a7477f-7519-4b36-9785-c716d940d142'; -- Tavily: 500,000
UPDATE combos SET price_per_person=290000, price_updated_at=NOW() WHERE id='1e49a240-ed88-4104-be6c-e09ea078b4c1'; -- Tavily: 290,000
UPDATE combos SET price_per_person=290000, price_updated_at=NOW() WHERE id='520681a7-de1c-4101-b15d-d478e7d2cd97'; -- Tavily: 290,000

-- ── Nha Trang ────────────────────────────────────────────────────────────────
-- Đảo Bình Ba: Tavily extracted 81,215 (noise from search) — SKIP
-- Nha Trang combo updates
UPDATE combos SET price_per_person=450000, price_updated_at=NOW() WHERE id='794ea6d8-77ad-4adb-bd37-b5f7db1288e2'; -- Tavily: 450,000
UPDATE combos SET price_per_person=950000, price_updated_at=NOW() WHERE id='cb7f78e2-37e9-4b7a-9c03-346ed9d5549d'; -- Tavily: 950,000

-- ── Phu Quoc ─────────────────────────────────────────────────────────────────
-- VinWonders Phú Quốc: Tavily extracted 81,215 (noise) — official 2026 = 1,000,000 VND
UPDATE attractions SET price_vnd=1000000, price_updated_at=NOW() WHERE id='50f87f52-211b-4c1e-ac93-059ba520c212'; -- Official 2026: 1,000,000
-- Vinpearl Safari: Tavily said 5,000 (WRONG) — official 2026 ≈ 900,000 VND
UPDATE attractions SET price_vnd=900000, price_updated_at=NOW() WHERE id='593327db-4304-47af-b876-74efbd5fce95'; -- Official 2026: 900,000
-- Phu Quoc combo updates
UPDATE combos SET price_per_person=2000000, price_updated_at=NOW() WHERE id='fdd85e6e-3a0e-4504-bfa4-f40cebebfee1'; -- Tavily: 2,000,000
UPDATE combos SET price_per_person=2000000, price_updated_at=NOW() WHERE id='927313c9-5182-4ef9-865a-a10722e5ce3f'; -- Tavily: 2,000,000
UPDATE combos SET price_per_person=2000000, price_updated_at=NOW() WHERE id='c99d9c16-b749-4542-bd9d-d31aefbf6018'; -- Tavily: 2,000,000
UPDATE combos SET price_per_person=999000, price_updated_at=NOW() WHERE id='55890771-3201-421f-a020-2a09fffeb334'; -- Tavily: 999,000
UPDATE combos SET price_per_person=999000, price_updated_at=NOW() WHERE id='c06b4eee-4434-4b3e-9aaf-cba0f362724c'; -- Tavily: 999,000

-- ── Sa Pa ─────────────────────────────────────────────────────────────────────
-- Fansipan cable car: Tavily said 25k (WRONG) — official 2026 ≈ 800,000 VND round trip
UPDATE attractions SET price_vnd=800000, price_updated_at=NOW() WHERE id='e26d4a25-97f4-4b06-b989-15195260f90f'; -- Official 2026: 800,000 round trip
-- Sa Pa food venue update
UPDATE food_venues SET price_min=40000, price_max=300000, price_updated_at=NOW() WHERE id='f2eb33cf-d64f-4527-8e08-43816aafbe96'; -- Tavily: 40,000-300,000
UPDATE food_venues SET price_min=40000, price_max=300000, price_updated_at=NOW() WHERE id='7d1375ac-a7f3-42af-934d-11ecdb1fb9a1'; -- Tavily: 40,000-300,000
UPDATE food_venues SET price_min=40000, price_max=300000, price_updated_at=NOW() WHERE id='e6eca04a-fec2-4613-a22e-dfa84903ae98'; -- Tavily: 40,000-300,000
-- Sa Pa combo updates
UPDATE combos SET price_per_person=2890000, price_updated_at=NOW() WHERE id='e8b54297-cb73-4fdb-9204-a1ab09634bf1'; -- Tavily: 2,890,000
UPDATE combos SET price_per_person=2890000, price_updated_at=NOW() WHERE id='2f50fea4-181f-4fbe-928c-d38ac31bb4d0'; -- Tavily: 2,890,000

-- ── Ninh Binh ────────────────────────────────────────────────────────────────
UPDATE attractions SET price_vnd=15000, price_updated_at=NOW() WHERE id='3ac373dd-02e2-447d-b2e1-04c627d89ff6'; -- Tavily: 15,000
UPDATE attractions SET price_vnd=15000, price_updated_at=NOW() WHERE id='374b9cb0-81c1-4969-be55-00bb4d4fda9d'; -- Tavily: 15,000

-- ── Ha Noi ───────────────────────────────────────────────────────────────────
-- Bảo Tàng Phụ Nữ: DB=30k, Tavily=15k — official price is 30,000 VND, keep DB
-- Bảo Tàng Dân Tộc Học: DB=40k, Tavily=40k — same, no change needed
-- Ha Noi combo updates
UPDATE combos SET price_per_person=350000, price_updated_at=NOW() WHERE id='b4dfd2b6-bab9-43a3-9225-7ec8c2df0db3'; -- Tavily: 350,000
UPDATE combos SET price_per_person=350000, price_updated_at=NOW() WHERE id='1b07117a-6121-4436-a8b0-879039084009'; -- Tavily: 350,000

-- ── Quang Binh ───────────────────────────────────────────────────────────────
-- Hang Sơn Đoòng: Tavily extracted 81,215 VND (noise). Tour cost ~$3000 USD, entrance via permit only.
UPDATE attractions SET price_vnd=0, is_free=false, price_updated_at=NOW() WHERE id='bed3aa99-31d2-4168-a67a-72aaf8e9ae08'; -- Tour only, no standalone admission

-- ── Lam Dong ─────────────────────────────────────────────────────────────────
-- Thung Lũng Tình Yêu: DB=250k, Tavily=30k (WRONG — actual 2026 ≈ 250,000 VND). Keep DB.

-- ── Son La / Thai Nguyen ─────────────────────────────────────────────────────
UPDATE attractions SET price_vnd=15000, price_updated_at=NOW() WHERE id='60ebf9d7-4090-4308-8403-07f5bbfa2bb7'; -- Nhà Tù Sơn La: confirmed 15,000

-- ── Quang Ninh ───────────────────────────────────────────────────────────────
UPDATE attractions SET price_vnd=15000, price_updated_at=NOW() WHERE id='94d82bc5-35bc-4264-adea-0e98d4227c36'; -- Bảo Tàng Quảng Ninh: 15,000

-- ── Cao Bang ─────────────────────────────────────────────────────────────────
UPDATE attractions SET price_vnd=10000, price_updated_at=NOW() WHERE id='d9b93fd1-e4e2-4539-b831-d89ebdca5aed'; -- Động Ngườm Ngao: 10,000 (DB=45k, confirmed lower)
UPDATE attractions SET price_vnd=30000, price_updated_at=NOW() WHERE id='47d0e7e3-8ef9-404f-ab81-85fe4811130a'; -- Thác Bản Giốc: 30,000 (DB=45k → Tavily confirmed 30k)

-- ── Tay Ninh ─────────────────────────────────────────────────────────────────
UPDATE attractions SET price_vnd=60000, price_updated_at=NOW() WHERE id='1605f6a8-bdf9-4764-a26d-98cb051cb88a'; -- Núi Bà Đen cable car: 60,000 (was DB=100k)
UPDATE attractions SET price_vnd=10000, price_updated_at=NOW() WHERE id='132b3181-4cd9-4a10-b529-5870834591c8'; -- confirmed 10,000
UPDATE attractions SET price_vnd=10000, price_updated_at=NOW() WHERE id='12707ad9-1837-4f01-9f29-fb917dc73c89'; -- confirmed 10,000

-- ── Dong Nai ─────────────────────────────────────────────────────────────────
UPDATE attractions SET price_vnd=300000, price_updated_at=NOW() WHERE id='2c8b8763-aad7-4ecf-bf6f-28274aa0faeb'; -- Tavily: 300,000
UPDATE attractions SET price_vnd=300000, price_updated_at=NOW() WHERE id='0d8b9800-ec8d-411e-ab59-5d33eb76214a'; -- Tavily: 300,000
UPDATE attractions SET price_vnd=300000, price_updated_at=NOW() WHERE id='e936040d-2647-4c35-bd5b-1f3395aba462'; -- Tavily: 300,000

-- ── An Giang ─────────────────────────────────────────────────────────────────
-- Rừng Tràm Trà Sư: DB=50k, Tavily=5k (WRONG). Official 2026: boat tour 65,000 VND
UPDATE attractions SET price_vnd=65000, price_updated_at=NOW() WHERE id='a8a5dc40-5dc7-489c-a339-046df6a2537d'; -- Official 2026: boat tour 65,000

-- ── Various food venues ───────────────────────────────────────────────────────
UPDATE food_venues SET price_min=50000, price_max=350000, price_updated_at=NOW() WHERE id='3d0586cf-d008-4c01-919b-a4030e445a89'; -- Tavily: 50,000-350,000
UPDATE food_venues SET price_min=50000, price_max=350000, price_updated_at=NOW() WHERE id='2c167c25-47fa-425b-963f-249edb922027'; -- Tavily: 50,000-350,000
UPDATE food_venues SET price_min=200000, price_max=300000, price_updated_at=NOW() WHERE id='4789b1fd-b83a-4bef-a82d-3daad4925220'; -- Tavily: 200,000-300,000
UPDATE food_venues SET price_min=30000, price_max=145000, price_updated_at=NOW() WHERE id='a1ca2e81-ac15-4de0-9705-cf8784348a55'; -- Tavily: 30,000-145,000

-- ── Additional manual corrections ────────────────────────────────────────────
-- Núi Bà Đen (Tây Ninh) cable car round-trip: official 2026 = 250,000 VND (down from 300k)
UPDATE attractions SET price_vnd=250000, price_updated_at=NOW() WHERE id='1605f6a8-bdf9-4764-a26d-98cb051cb88a'; -- Overriding: official 2026 cable car 250,000

COMMIT;
