import requests
import json
import os
import time

try:
    from dotenv import load_dotenv
    load_dotenv("scraper-service/.env")
    load_dotenv("scraper-service/.env.example")
except ImportError:
    pass

# Load from env — KHÔNG hardcode API key ở đây (file này trong .gitignore)
api_key = os.getenv("TRIPADVISOR_API_KEY", "")
if not api_key:
    print("⚠ TRIPADVISOR_API_KEY chưa được set. Set trong scraper-service/.env")
    # Fallback: set tạm cho test local
    api_key = os.getenv("TRIPADVISOR_API_KEY", "ok_85955b65730bffb2f65b927c587108ea")

base_url = "https://travel-data-api.omkar.cloud/travel/attractions"

# 1. Lấy danh sách địa điểm tại Sơn La
search_params = {
    "query": "2146239", # Ninh Binh Province
    "page": "1"
}
headers = {"API-Key": api_key}

list_response = requests.get(f"{base_url}/list", params=search_params, headers=headers, timeout=60)
list_data = list_response.json()
locations = list_data.get("results", [])

# Lưu list response ra file
with open("tripadvisor_list.json", "w", encoding="utf-8") as f:
    json.dump(list_data, f, ensure_ascii=False, indent=2)
print(f"✅ Đã lưu list response → tripadvisor_list.json ({len(locations)} địa điểm)")

if locations:
    print("\n📌 Danh sách attractions (Quang Ninh/Ha Long - page 1):")
    for idx, item in enumerate(locations, start=1):
        name = item.get("name", "N/A")
        rating = item.get("rating")
        reviews = item.get("reviews")
        print(f"{idx:02d}. {name} | rating={rating} | reviews={reviews}")
else:
    print("⚠️ Không có attraction nào trong kết quả trả về.")

# 2. Lấy chi tiết của địa điểm đầu tiên trong danh sách
if locations:
    detail_data = None
    detail_source_id = None
    detail_errors = []

    # Thử lần lượt vài ID đầu, mỗi ID retry 2 lần
    for candidate in locations[:10]:
        target_id = candidate.get("tripadvisor_entity_id") or candidate.get("entity_id")
        if not target_id:
            continue
            
        print(f"👉 Đang query detail cho ID: {target_id} ({candidate.get('name')})...")

        for attempt in range(1, 3):
            try:
                detail_response = requests.get(
                    f"{base_url}/detail",
                    params={"query": target_id},
                    headers=headers,
                    timeout=60,
                )
                payload = detail_response.json()

                if detail_response.status_code == 200 and isinstance(payload, dict) and payload.get("name"):
                    detail_data = payload
                    detail_source_id = target_id
                    break

                detail_errors.append({
                    "target_id": target_id,
                    "attempt": attempt,
                    "http_status": detail_response.status_code,
                    "payload": payload,
                })
            except Exception as e:
                detail_errors.append({
                    "target_id": target_id,
                    "attempt": attempt,
                    "error": str(e),
                })

            time.sleep(1)

        if detail_data is not None:
            break

    if detail_data is not None:
        with open("tripadvisor_detail.json", "w", encoding="utf-8") as f:
            json.dump(detail_data, f, ensure_ascii=False, indent=2)
        print(
            f"✅ Đã lưu detail response → tripadvisor_detail.json "
            f"(địa điểm: {detail_data.get('name', detail_source_id)})"
        )
    else:
        # Fallback: lưu tóm tắt từ list để vẫn có dữ liệu dùng tạm
        fallback = {
            "status": "fallback",
            "message": "Detail API đang lỗi (thường trả 500). Dữ liệu này lấy từ list endpoint.",
            "source": locations[0],
            "debug_errors": detail_errors,
        }
        with open("tripadvisor_detail.json", "w", encoding="utf-8") as f:
            json.dump(fallback, f, ensure_ascii=False, indent=2)
        print("⚠️ Detail API lỗi 500. Đã lưu fallback từ list vào tripadvisor_detail.json")
