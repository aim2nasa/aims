import os
import json
import mimetypes
import time
import requests
from requests_toolbelt.multipart.encoder import MultipartEncoder

# n8n Webhook URL
URL = "https://n8nd.giize.com/webhook/dococr"
BASE_DIR = "/home/rossi/aims/samples"

# 샘플 파일과 기대 결과 (True=정상, False=30p 초과 예상)
samples = {
    "캐치업코리아-낙하리_현대해상.pdf": True,
    "삼성생명약관.pdf": False,
    "08하 7454 자동차등록증.jpeg": True,
    "캐치업자동차견적.jpg": True,
    "캐치업통장.png": True
}

def send_exact_curl(file_path):
    """curl과 동일한 boundary/헤더 방식으로 multipart 전송"""
    boundary = "------------------------curlBoundary123456"
    filename = os.path.basename(file_path)

    # MIME 타입 지정
    ext = os.path.splitext(filename)[1].lower()
    if ext in [".jpg", ".jpeg"]:
        mime_type = "image/jpeg"
    elif ext == ".png":
        mime_type = "image/png"
    elif ext == ".pdf":
        mime_type = "application/pdf"
    else:
        mime_type = mimetypes.guess_type(file_path)[0] or "application/octet-stream"

    with open(file_path, "rb") as f:
        multipart_data = MultipartEncoder(
            fields={"file": (filename, f, mime_type)},
            boundary=boundary  # ✅ curl 스타일 boundary 강제
        )
        headers = {
            "Content-Type": f"multipart/form-data; boundary={boundary}"
        }
        res = requests.post(URL, data=multipart_data, headers=headers, timeout=30)
    return res

def check_webhook_alive():
    """작은 샘플 파일로 POST → HTTP 200이면 webhook이 살아있다고 판단"""
    sample_file = f"{BASE_DIR}/image/png/캐치업통장.png"
    print(f"▶ Checking webhook by small POST: {URL}")
    res = send_exact_curl(sample_file)
    if res.status_code == 200:
        print("✅ Webhook is responding (UP)\n")
        return True
    else:
        print(f"❌ Webhook DOWN (HTTP {res.status_code}) → {res.text}")
        return False

def run_test(file_path, expect_success=True):
    filename = os.path.basename(file_path)
    print(f"\n▶ Testing: {filename}")

    res = send_exact_curl(file_path)

    if res.status_code != 200:
        print(f"❌ FAIL: HTTP {res.status_code} → {res.text}")
        return

    try:
        data = res.json()
    except json.JSONDecodeError:
        print(f"❌ FAIL: Invalid JSON → {res.text}")
        return

    print(f"  Response: {json.dumps(data, ensure_ascii=False)}")

    if expect_success:
        if "output" in data and "confidence" in data["output"] and "summary" in data["output"]:
            print(f"✅ PASS: {filename}")
        else:
            print(f"❌ FAIL: confidence/summary missing → {filename}")
    else:
        if data.get("error") is True and data.get("status") == 413:
            print(f"✅ PASS (Expected Error): {filename}")
        else:
            print(f"❌ FAIL: Expected 413 error but got → {data}")

def main():
    # 1. webhook 헬스체크
    if not check_webhook_alive():
        print("❌ Stopping tests due to webhook DOWN.")
        return

    # 2. samples dict 기준으로만 테스트 실행 (각 요청 후 3초 딜레이)
    for fname, expect in samples.items():
        found_path = None
        for folder in ["application/pdf", "image/jpeg", "image/png"]:
            file_path = os.path.join(BASE_DIR, folder, fname)
            if os.path.exists(file_path):
                found_path = file_path
                break

        if not found_path:
            print(f"⚠️ File not found: {fname}")
            continue

        run_test(found_path, expect)

        # ✅ API rate limit 방지 딜레이
        time.sleep(3)

if __name__ == "__main__":
    main()

