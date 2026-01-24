# -*- coding: utf-8 -*-
"""
Naver Clova OCR 테스트 - 고객목록 이미지
전체 이미지에서 한번에 표 추출
"""
import os
import sys
import json
import uuid
import time
import base64
from pathlib import Path

# UTF-8 출력 설정
sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

import httpx

# 환경변수에서 API 키 로드
API_URL = os.environ.get("CLOVA_OCR_API_URL")
SECRET_KEY = os.environ.get("CLOVA_OCR_SECRET_KEY")

if not API_URL or not SECRET_KEY:
    print("[ERROR] 환경변수 필요:")
    print("  CLOVA_OCR_API_URL")
    print("  CLOVA_OCR_SECRET_KEY")
    sys.exit(1)


def call_clova_ocr(image_path: str) -> dict:
    """Clova OCR API 호출"""
    with open(image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode("utf-8")

    suffix = Path(image_path).suffix.lower()
    image_format = {"png": "png", ".jpg": "jpg", ".jpeg": "jpg"}.get(suffix, "png")

    request_json = {
        "images": [{
            "format": image_format,
            "name": Path(image_path).stem,
            "data": image_data,
        }],
        "requestId": str(uuid.uuid4()),
        "version": "V2",
        "timestamp": int(time.time() * 1000),
    }

    print(f"[INFO] Clova OCR API 호출 중...")
    start = time.time()

    with httpx.Client(timeout=60.0) as client:
        response = client.post(
            API_URL,
            headers={
                "X-OCR-SECRET": SECRET_KEY,
                "Content-Type": "application/json",
            },
            json=request_json,
        )

    elapsed = time.time() - start
    print(f"[INFO] 응답 시간: {elapsed:.2f}초")

    if response.status_code != 200:
        print(f"[ERROR] HTTP {response.status_code}")
        return {"error": True}

    return response.json()


def extract_customer_names(ocr_data: dict) -> list:
    """OCR 결과에서 고객명 추출"""
    names = []

    images = ocr_data.get("images", [])
    if not images:
        return names

    image_result = images[0]

    # 테이블 결과가 있는 경우
    tables = image_result.get("tables", [])
    if tables:
        print(f"[INFO] 테이블 {len(tables)}개 감지")
        for table in tables:
            cells = table.get("cells", [])
            print(f"[INFO] 셀 {len(cells)}개")

            # 첫 번째 컬럼 (고객명) 추출
            for cell in cells:
                col_idx = cell.get("columnIndex", 0)
                row_idx = cell.get("rowIndex", 0)

                if col_idx == 0 and row_idx > 0:  # 첫 컬럼, 헤더 제외
                    text_lines = cell.get("cellTextLines", [])
                    cell_text = ""
                    for line in text_lines:
                        for word in line.get("cellWords", []):
                            cell_text += word.get("inferText", "")
                    if cell_text:
                        names.append({"row": row_idx, "text": cell_text.strip()})

    # 테이블이 없으면 필드에서 추출
    if not names:
        fields = image_result.get("fields", [])
        print(f"[INFO] 필드 {len(fields)}개 (테이블 미감지)")

        # 필드를 Y좌표로 정렬
        sorted_fields = sorted(
            fields,
            key=lambda f: f.get("boundingPoly", {}).get("vertices", [{}])[0].get("y", 0)
        )

        # 첫 번째 컬럼 영역의 필드만 추출 (X < 150)
        for field in sorted_fields:
            vertices = field.get("boundingPoly", {}).get("vertices", [{}])
            x = vertices[0].get("x", 0) if vertices else 0
            text = field.get("inferText", "").strip()

            # X 좌표가 첫 번째 컬럼 범위이고, 한글 이름 패턴인 경우
            if x < 150 and text and len(text) >= 2:
                # 헤더 제외
                if text not in ["고객명", "구분", "생년월일"]:
                    names.append({"x": x, "text": text})

    return names


def main():
    print("=" * 50)
    print("Naver Clova OCR 테스트 - 고객목록")
    print("=" * 50)

    image_path = r"D:\captures\customerList.png"

    if not os.path.exists(image_path):
        print(f"[ERROR] 이미지 없음: {image_path}")
        sys.exit(1)

    print(f"\n이미지: {image_path}")

    # OCR 호출
    ocr_result = call_clova_ocr(image_path)

    if ocr_result.get("error"):
        print("[ERROR] OCR 실패")
        return

    # 디버깅: 원본 응답 저장
    with open("clova_response.json", "w", encoding="utf-8") as f:
        json.dump(ocr_result, f, ensure_ascii=False, indent=2)
    print("[INFO] 원본 응답 저장: clova_response.json")

    # 고객명 추출
    names = extract_customer_names(ocr_result)

    print(f"\n[Clova OCR 결과]")
    for item in names:
        print(f"  [{item.get('text', '')}]")

    # 예상 이름과 비교
    expected = [
        "강보경", "강새봄", "강선옥", "강설아", "강세황", "강숙경",
        "강숙경", "강승현", "강연우", "강연주", "강윤분", "강윤태",
        "강일", "강점자", "강정모", "강지선"
    ]

    detected_texts = [item.get("text", "") for item in names]

    print(f"\n[정확도 분석]")
    correct = 0
    for i, exp in enumerate(expected):
        if exp in detected_texts:
            correct += 1
            print(f"  {i+1:2d}. {exp} - O")
        else:
            # 유사 텍스트 찾기
            similar = [t for t in detected_texts if exp in t or t in exp]
            if similar:
                print(f"  {i+1:2d}. {exp} - X (유사: {similar[0]})")
            else:
                print(f"  {i+1:2d}. {exp} - X")

    print(f"\n정확 일치율: {correct}/{len(expected)} ({correct/len(expected)*100:.1f}%)")


if __name__ == "__main__":
    main()
