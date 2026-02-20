# -*- coding: utf-8 -*-
"""
MetDO 고객정보 OCR 파싱 도구

MetDO(MetLife Digital Office) 고객정보 페이지 스크린샷을
Upstage Enhanced API로 OCR 파싱하여 고객 정보를 추출합니다.

Usage:
    python read_customer.py <이미지파일> [--json] [--debug]

Examples:
    python read_customer.py D:\\tmp\\sample\\개인-강보경.png
    python read_customer.py D:\\tmp\\sample\\법인-캐치업코리아.png --json
    python read_customer.py D:\\tmp\\sample\\개인-강보경.png --debug
"""
import os
import sys
import json
import time
import re
import argparse
from pathlib import Path

import httpx

# Windows 콘솔 인코딩 문제 방지
if sys.stdout and hasattr(sys.stdout, 'fileno'):
    try:
        sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)
    except Exception:
        pass

# ──────────────────────────────────────────────────────────
# Upstage API 설정
# ──────────────────────────────────────────────────────────
API_URL = "https://api.upstage.ai/v1/document-digitization"
API_KEY = os.environ.get("UPSTAGE_API_KEY")

MAX_RETRIES = 3
RETRY_DELAYS = [5, 10, 20]
RETRIABLE_STATUS_CODES = {500, 502, 503, 504, 429}


def call_upstage_enhanced(image_path: str) -> dict:
    """Upstage Document Digitization API 호출 (Enhanced 모드) - 재시도 로직 포함"""
    with open(image_path, "rb") as f:
        file_content = f.read()

    filename = Path(image_path).name
    file_size_kb = len(file_content) / 1024
    print(f"  OCR API 호출 중... ({filename}, {file_size_kb:.1f} KB)")

    last_error = None

    for attempt in range(MAX_RETRIES + 1):
        try:
            start = time.time()

            if attempt > 0:
                delay = RETRY_DELAYS[min(attempt - 1, len(RETRY_DELAYS) - 1)]
                print(f"  재시도 {attempt}/{MAX_RETRIES} - {delay}초 대기...")
                time.sleep(delay)

            with httpx.Client(timeout=180.0) as client:
                response = client.post(
                    API_URL,
                    headers={"Authorization": f"Bearer {API_KEY}"},
                    files={"document": (filename, file_content)},
                    data={
                        "model": "document-parse-nightly",
                        "mode": "enhanced",
                        "output_formats": '["html", "text"]',
                    },
                )

            elapsed = time.time() - start

            if response.status_code == 200:
                print(f"  OCR 완료 ({elapsed:.1f}초)")
                return response.json()

            if response.status_code in RETRIABLE_STATUS_CODES:
                print(f"  HTTP {response.status_code} 에러 ({elapsed:.1f}초)")
                last_error = f"HTTP {response.status_code}"
                if attempt < MAX_RETRIES:
                    continue
            else:
                print(f"  HTTP {response.status_code} 에러 (재시도 불가)")
                return {"error": True, "status_code": response.status_code}

        except httpx.TimeoutException:
            elapsed = time.time() - start
            print(f"  타임아웃 ({elapsed:.1f}초)")
            last_error = "Timeout"
            if attempt < MAX_RETRIES:
                continue

        except httpx.ConnectError as e:
            print(f"  연결 에러: {e}")
            last_error = str(e)
            if attempt < MAX_RETRIES:
                continue

        except Exception as e:
            print(f"  에러: {type(e).__name__}: {e}")
            last_error = str(e)
            if attempt < MAX_RETRIES:
                continue

    print(f"  최종 실패: {last_error}")
    return {"error": True, "last_error": last_error}


# ──────────────────────────────────────────────────────────
# 유틸리티 함수
# ──────────────────────────────────────────────────────────

def find_between(text: str, start_label: str, end_labels: list, max_chars: int = 300) -> str:
    """start_label 뒤부터 가장 가까운 end_label 전까지의 텍스트 추출"""
    idx = text.find(start_label)
    if idx < 0:
        return ""

    value_start = idx + len(start_label)
    nearest_end = min(value_start + max_chars, len(text))

    for label in end_labels:
        pos = text.find(label, value_start)
        if 0 <= pos < nearest_end:
            nearest_end = pos

    return text[value_start:nearest_end].strip()


def normalize_phone(raw: str) -> str:
    """전화번호 정규화: 010 4786 6654 → 010-4786-6654"""
    digits = "".join(re.findall(r'\d', raw))
    if len(digits) == 11 and digits.startswith("01"):
        return f"{digits[:3]}-{digits[3:7]}-{digits[7:]}"
    if len(digits) == 10:
        if digits.startswith("02"):
            return f"{digits[:2]}-{digits[2:6]}-{digits[6:]}"
        return f"{digits[:3]}-{digits[3:6]}-{digits[6:]}"
    return None


def extract_phone(text: str, label: str) -> str:
    """텍스트에서 특정 라벨 뒤의 전화번호 추출"""
    idx = text.find(label)
    if idx < 0:
        return None
    after = text[idx + len(label):idx + len(label) + 60]
    # OCR이 드롭다운 아이콘을 ▼/▽로 읽을 수 있으므로 제거
    after = after.replace("\u25bc", " ").replace("\u25bd", " ")
    # 휴대폰 패턴 (다중 공백 허용: OCR이 ▼ 제거 후 여백 남음)
    match = re.search(r'(01[016789][\s\-]*\d{3,4}[\s\-]*\d{4})', after)
    if match:
        return normalize_phone(match.group(1))
    # 일반 전화번호 (지역번호)
    match = re.search(r'(0\d{1,2}[\s\-]*\d{3,4}[\s\-]*\d{4})', after)
    if match:
        return normalize_phone(match.group(1))
    return None


def normalize_email(raw: str) -> str:
    """이메일 정규화: bkkangS23 @ naver.com → bkkangS23@naver.com → 소문자 변환"""
    # 1차: 이미 @ 포함된 경우
    cleaned = raw.replace(" ", "")
    match = re.search(r'[\w.%+\-]+@[\w.\-]+\.\w{2,}', cleaned)
    if match:
        return match.group().lower()

    # 2차: OCR이 @ 기호를 누락한 경우 (예: "bkkang523 naver.com")
    # "로컬파트 도메인.tld" 패턴을 찾아서 @ 삽입
    match = re.search(r'([\w.%+\-]+)\s+([\w.\-]+\.\w{2,})', raw.strip())
    if match:
        local_part = match.group(1)
        domain = match.group(2)
        return f"{local_part}@{domain}".lower()

    return None


def parse_birth_date(text_fragment: str) -> str:
    """주민번호 텍스트에서 생년월일 추출: 780523-2****** → 1978.05.23"""
    match = re.search(r'(\d{6})\s*[-·]\s*(\d)', text_fragment)
    if not match:
        return None

    front6 = match.group(1)
    seventh = int(match.group(2))

    yy = int(front6[:2])
    mm = front6[2:4]
    dd = front6[4:6]

    if seventh in (1, 2, 5, 6):
        year = 1900 + yy
    elif seventh in (3, 4, 7, 8):
        year = 2000 + yy
    else:
        year = 1900 + yy if yy >= 30 else 2000 + yy

    return f"{year}.{mm}.{dd}"


def parse_gender(text_fragment: str) -> str:
    """주민번호 7번째 자리에서 성별 추출"""
    match = re.search(r'\d{6}\s*[-·]\s*(\d)', text_fragment)
    if match:
        d = int(match.group(1))
        if d in (1, 3):
            return "남자"
        if d in (2, 4):
            return "여자"
    return None


def is_empty(value) -> bool:
    """빈 값 체크 (선택, 빈 문자열 등)"""
    if value is None:
        return True
    s = str(value).strip()
    # ▼/▽ 제거 후 체크
    s = s.replace("\u25bc", "").replace("\u25bd", "").strip()
    return s in ("", "선택", "직접입력", "직접 입력", "도메인 선택", "도메인선택", "-", "없음", "Q")


def clean_address_section(raw: str) -> str:
    """주소 섹션에서 끼어든 폼 라벨/UI 요소를 제거하고 주소만 추출"""
    if not raw:
        return None
    s = raw
    # OCR 마크다운/HTML 태그 오염 제거 — 태그 시작 지점에서 잘라내기
    # (Upstage OCR이 이미지 설명을 마크다운으로 포함시킴)
    for marker in ['![', '<figure', '<figcaption', '<img', '<p ', '<div']:
        cut = s.find(marker)
        if cut >= 0:
            s = s[:cut]
    # ▼/▽ 제거
    s = s.replace("\u25bc", "").replace("\u25bd", "")
    # 끼어든 폼 라벨+값 패턴 제거 (자택전화/직장전화/팩스번호 + 선택/번호)
    # 주의: 전화번호 패턴을 정확히 매칭해야 함 — 탐욕적 매칭 금지!
    # 이전 버그: 0\d[\d\s\-]* 가 "02 3285 7889 32" 전부 매칭 → 주소 번지 "32" 소실
    for label in ["자택전화", "직장전화", "팩스번호"]:
        s = re.sub(label + r'\s*(선택[\s]*|0\d{1,2}[\s\-]*\d{3,4}[\s\-]*\d{4})', '', s)
        # 라벨만 남은 경우도 제거
        s = s.replace(label, '')
    # Q (검색 아이콘) 제거 — 단독 Q만 (주소에 포함된 Q는 보존)
    s = re.sub(r'(?<!\w)Q(?!\w)', '', s)
    # 독립 하이픈 제거 (폼 UI 구분자)
    s = re.sub(r'\s+-\s+', ' ', s)
    # 다중 공백/하이픈 정리
    s = re.sub(r'\s+', ' ', s).strip()
    s = s.strip("—–- ")
    if is_empty(s):
        return None
    return s


# ──────────────────────────────────────────────────────────
# 고객 유형 감지
# ──────────────────────────────────────────────────────────

def detect_customer_type(text: str) -> str:
    """개인/법인 감지"""
    if "법인명" in text or "사업자번호" in text:
        return "법인"
    return "개인"


# ──────────────────────────────────────────────────────────
# 개인 고객 파싱
# ──────────────────────────────────────────────────────────

def parse_personal(text: str) -> dict:
    """개인 고객 정보 파싱"""
    result = {
        "customer_type": "개인",
        "name": None,
        "birth_date": None,
        "gender": None,
        "mobile_phone": None,
        "home_phone": None,
        "work_phone": None,
        "email": None,
        "home_address": None,
        "work_address": None,
    }

    # ── 고객명 ──
    idx = text.find("고객명")
    if idx >= 0:
        after = text[idx + 3:].lstrip("*").lstrip()
        end = len(after)
        for marker in ["조회", "(영문)", "영문", "가입설계", "\n"]:
            pos = after.find(marker)
            if 0 <= pos < end:
                end = pos
        name = after[:end].strip()
        if name and not is_empty(name):
            result["name"] = name

    # ── 주민번호 → 생년월일 + 성별 ──
    rn_section = find_between(text, "주민번호", ["고객구분", "고객유형", "직업코드", "연락처"])
    if rn_section:
        result["birth_date"] = parse_birth_date(rn_section)
        result["gender"] = parse_gender(rn_section)

    # ── 성별 보완 (주민번호에서 못 구한 경우) ──
    if not result["gender"]:
        idx = text.find("성별")
        if idx >= 0:
            after = text[idx + 2:idx + 20]
            if "여" in after:
                result["gender"] = "여자"
            elif "남" in after:
                result["gender"] = "남자"

    # ── 휴대전화 ──
    result["mobile_phone"] = extract_phone(text, "휴대전화") or extract_phone(text, "휴대폰")

    # ── 이메일 ──
    idx = text.find("이메일")
    if idx >= 0:
        email_raw = find_between(text, "이메일", [
            "직접입력", "직접 입력", "도메인", "자택주소", "자택전화",
        ], max_chars=120)
        email = normalize_email(email_raw)
        if email:
            result["email"] = email

    # ── 자택전화 ──
    result["home_phone"] = extract_phone(text, "자택전화")

    # ── 직장전화 ──
    result["work_phone"] = extract_phone(text, "직장전화")

    # ── 자택주소 ──
    idx = text.find("자택주소")
    if idx >= 0:
        section = find_between(text, "자택주소", [
            "직장주소", "직장명", "세부정보"
        ], max_chars=400)
        addr = clean_address_section(section)
        if addr:
            result["home_address"] = addr

    # ── 직장주소 ──
    idx = text.find("직장주소")
    if idx >= 0:
        section = find_between(text, "직장주소", [
            "직장명", "세부정보"
        ], max_chars=400)
        addr = clean_address_section(section)
        if addr:
            result["work_address"] = addr

    return result


# ──────────────────────────────────────────────────────────
# 법인 고객 파싱
# ──────────────────────────────────────────────────────────

def parse_corporate(text: str) -> dict:
    """법인 고객 정보 파싱"""
    result = {
        "customer_type": "법인",
        "name": None,
        "business_number": None,
        "mobile_phone": None,
        "work_phone": None,
        "email": None,
        "business_address": None,
        "hq_address": None,
    }

    # ── 법인명 ──
    idx = text.find("법인명")
    if idx >= 0:
        after = text[idx + 3:].lstrip("*").lstrip()
        end = len(after)
        for marker in ["조회", "(영문)", "영문", "가입설계", "고객번호", "\n"]:
            pos = after.find(marker)
            if 0 <= pos < end:
                end = pos
        name = after[:end].strip()
        if name and not is_empty(name):
            result["name"] = name

    # ── 사업자번호 (OCR이 "사업번호"로 읽을 수도 있음) ──
    for bn_label in ["사업자번호", "사업번호"]:
        idx = text.find(bn_label)
        if idx >= 0:
            after = text[idx + len(bn_label):].lstrip("*").lstrip()
            match = re.search(r'[\d\*]{3}[\s\-]*[\d\*]{2}[\s\-]*[\d\*]{5}', after)
            if match:
                result["business_number"] = match.group().strip()
            break

    # ── 휴대전화 ──
    result["mobile_phone"] = extract_phone(text, "휴대전화") or extract_phone(text, "휴대폰")

    # ── 이메일 ──
    idx = text.find("이메일")
    if idx >= 0:
        email_raw = find_between(text, "이메일", [
            "직접입력", "직접 입력", "도메인", "사업장소재지",
            "자택전화",
        ], max_chars=120)
        email = normalize_email(email_raw)
        if email:
            result["email"] = email

    # ── 직장전화 ──
    result["work_phone"] = extract_phone(text, "직장전화")

    # ── 사업장소재지 ──
    idx = text.find("사업장소재지")
    if idx >= 0:
        section = find_between(text, "사업장소재지", [
            "본점소재지", "직장명", "세부정보"
        ], max_chars=400)
        addr = clean_address_section(section)
        if addr:
            result["business_address"] = addr

    # ── 본점소재지 ──
    idx = text.find("본점소재지")
    if idx >= 0:
        section = find_between(text, "본점소재지", [
            "직장명", "세부정보"
        ], max_chars=400)
        addr = clean_address_section(section)
        if addr:
            result["hq_address"] = addr

    return result


# ──────────────────────────────────────────────────────────
# 메인 파싱 진입점
# ──────────────────────────────────────────────────────────

def parse_customer_info(ocr_result: dict) -> dict:
    """OCR 결과에서 고객 정보 파싱"""
    text = ""
    content = ocr_result.get("content", {})
    if isinstance(content, dict):
        text = content.get("text", "")
    if not text:
        text = ocr_result.get("text", "")

    if not text:
        return {"error": "OCR 텍스트 없음"}

    customer_type = detect_customer_type(text)

    if customer_type == "법인":
        return parse_corporate(text)
    else:
        return parse_personal(text)


# ──────────────────────────────────────────────────────────
# 출력 형식
# ──────────────────────────────────────────────────────────

def format_address(addr: str, indent: str) -> str:
    """긴 주소를 여러 줄로 포맷팅"""
    if not addr:
        return "-"
    max_width = 40
    if len(addr) <= max_width:
        return addr
    lines = []
    remaining = addr
    while remaining:
        lines.append(remaining[:max_width])
        remaining = remaining[max_width:]
    return ("\n" + indent).join(lines)


def pretty_print(result: dict, filename: str):
    """결과를 보기 좋게 출력"""
    ct = result.get("customer_type", "")

    print()
    print("══════════════════════════════════════════")
    print("  MetDO 고객정보 파싱 결과")
    print("══════════════════════════════════════════")
    print(f"파일: {filename}")
    print()

    print(f"유형:       {ct}")
    print(f"고객명:     {result.get('name') or '-'}")

    if ct == "개인":
        print(f"생년월일:   {result.get('birth_date') or '-'}")
        print(f"성별:       {result.get('gender') or '-'}")
    elif ct == "법인":
        print(f"사업자번호: {result.get('business_number') or '-'}")

    print(f"휴대전화:   {result.get('mobile_phone') or '-'}")

    if ct == "개인":
        print(f"자택전화:   {result.get('home_phone') or '-'}")

    print(f"직장전화:   {result.get('work_phone') or '-'}")
    print(f"이메일:     {result.get('email') or '-'}")

    if ct == "개인":
        indent = "            "  # "자택주소:   " 길이만큼
        addr = result.get("home_address")
        print(f"자택주소:   {format_address(addr, indent)}")

        addr = result.get("work_address")
        print(f"직장주소:   {format_address(addr, indent)}")

    elif ct == "법인":
        indent = "            "
        addr = result.get("business_address")
        print(f"사업장주소: {format_address(addr, indent)}")

        addr = result.get("hq_address")
        print(f"본점주소:   {format_address(addr, indent)}")

    print("══════════════════════════════════════════")


# ──────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────

def main():
    argp = argparse.ArgumentParser(
        description="MetDO 고객정보 OCR 파싱 도구",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python read_customer.py "D:\\tmp\\sample\\개인-강보경.png"
  python read_customer.py "D:\\tmp\\sample\\법인-캐치업코리아.png" --json
  python read_customer.py "D:\\tmp\\sample\\개인-강보경.png" --debug
        """,
    )
    argp.add_argument("image", help="이미지 파일 경로")
    argp.add_argument("--json", action="store_true", help="JSON 형식으로 출력")
    argp.add_argument("--debug", action="store_true", help="OCR 원본 응답을 파일로 저장")
    args = argp.parse_args()

    if not API_KEY:
        print("ERROR: UPSTAGE_API_KEY 환경변수를 설정해주세요.")
        sys.exit(1)

    image_path = args.image
    if not os.path.exists(image_path):
        print(f"ERROR: 파일을 찾을 수 없습니다: {image_path}")
        sys.exit(1)

    # OCR API 호출
    ocr_result = call_upstage_enhanced(image_path)

    if ocr_result.get("error"):
        print("ERROR: OCR API 호출 실패")
        sys.exit(1)

    # 디버그: OCR 원본 응답 저장
    if args.debug:
        debug_path = str(Path(image_path).with_suffix("")) + ".ocr_response.json"
        with open(debug_path, "w", encoding="utf-8") as f:
            json.dump(ocr_result, f, ensure_ascii=False, indent=2)
        print(f"  디버그 저장: {debug_path}")

    # 파싱
    result = parse_customer_info(ocr_result)

    # 출력
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        pretty_print(result, Path(image_path).name)


if __name__ == "__main__":
    main()
