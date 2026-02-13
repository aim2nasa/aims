# MetDO Customer Reader - 구현 계획

## Context
MetDO(MetLife Digital Office) 고객정보 페이지 스크린샷을 Upstage Enhanced API로 OCR 파싱하여 고객 정보를 추출하는 도구.
콘솔 도구를 먼저 만들고, 이후 GUI 애플리케이션으로 확장.

## 파일 구조
```
tools/metdo_reader/
    read_customer.py     # Step 1: 콘솔 도구 (메인 파싱 로직)
    gui.py               # Step 2: GUI 애플리케이션
```

---

## Step 1: 콘솔 도구 (`read_customer.py`)

### 사용법
```bash
python tools/metdo_reader/read_customer.py <이미지파일> [--json] [--debug]
python tools/metdo_reader/read_customer.py D:\tmp\sample\개인-강보경.png
python tools/metdo_reader/read_customer.py D:\tmp\sample\법인-캐치업코리아.png --json
```

### Upstage API 호출 (기존 패턴 재사용)
- **참조**: `tools/auto_clicker_v2/ocr/upstage_ocr_api.py`의 `call_upstage_enhanced()` 함수
- Endpoint: `https://api.upstage.ai/v1/document-digitization`
- Model: `document-parse-nightly`, mode: `enhanced`
- Output formats: `["html", "text"]`
- Auth: `Bearer {UPSTAGE_API_KEY}` (환경변수)
- Retry: 3회, 지수 백오프 (5s, 10s, 20s)
- Timeout: 180초
- Library: `httpx`

### 파싱 로직

#### 1. 고객 유형 감지
- 텍스트에 "법인명" 있으면 → `법인`
- "사업자번호" 있으면 → `법인`
- 그 외 → `개인`

#### 2. 추출 필드 매핑

| 출력 필드 | 개인 소스 | 법인 소스 |
|-----------|-----------|-----------|
| 유형 | 개인/법인 감지 | 개인/법인 감지 |
| 고객명 | "고객명" 라벨 뒤 값 | "법인명" 라벨 뒤 값 |
| 생년월일 | 주민번호 앞6자리 → YYYY.MM.DD | N/A |
| 성별 | "성별" 필드 or 주민번호 7번째 자리 | N/A |
| 휴대폰 | "휴대전화" 뒤 3세그먼트 | 동일 |
| 집전화 | "자택전화" 뒤 값 | N/A |
| 회사전화 | "직장전화" 뒤 값 | "직장전화" 뒤 값 |
| 이메일 | "이메일" 뒤 local @ domain 결합 | 동일 |
| 자택주소 | "자택주소" 뒤 우편번호+주소 | N/A |
| 직장주소 | "직장주소" 뒤 값 | N/A |
| 사업장주소 | N/A | "사업장소재지" 뒤 값 |
| 본점주소 | N/A | "본점소재지" 뒤 값 |

#### 3. 파싱 전략
- Upstage API의 `text` 출력을 사용 (폼 라벨+값이 읽기순서로 나옴)
- **라벨 앵커링**: 알려진 라벨 키워드를 찾고, 다음 라벨까지의 텍스트를 값으로 추출
- `indexOf`/`find` 기반 문자열 추출 (정규식 최소화)
- 전화번호: `010 XXXX XXXX` → `010-XXXX-XXXX` 정규화
- 이메일: `local @ domain` → `local@domain` 결합
- 주소: 우편번호(5자리) + 주소1 + 상세주소 멀티라인 처리
- 빈 필드: "선택" 텍스트이거나 비어있으면 `None`

#### 4. 출력 형식

**기본 (pretty-print):**
```
══════════════════════════════════
  MetDO 고객정보 파싱 결과
══════════════════════════════════
파일: 개인-강보경.png

유형:     개인
고객명:   강보경
생년월일: 1978.05.23
성별:     여자
휴대전화: 010-4786-6654
자택전화: -
직장전화: -
이메일:   bkkangS23@naver.com
자택주소: 18466 경기 화성시 동탄순환대로26길
          55, 동탄역반도유보라아이비파크2.0 409동1201호 (영천동)
직장주소: -
══════════════════════════════════
```

**`--json` 옵션:**
```json
{
  "customer_type": "개인",
  "name": "강보경",
  "birth_date": "1978.05.23",
  "gender": "여자",
  "mobile_phone": "010-4786-6654",
  "home_phone": null,
  "work_phone": null,
  "email": "bkkangS23@naver.com",
  "home_address": "18466 경기 화성시 동탄순환대로26길 55, ...",
  "work_address": null
}
```

**`--debug` 옵션:**
OCR API 원본 응답을 `<파일명>.ocr_response.json`으로 저장 (디버깅용)

---

## Step 2: GUI 애플리케이션 (`gui.py`)

### 기술 스택
- **CustomTkinter** (AutoClicker v2와 동일 — `tools/auto_clicker_v2/gui_main.py` 참조)

### GUI 구성
- 파일 선택 버튼 (파일 탐색기 대화상자)
- 드래그&드롭 지원 (가능하면)
- "파싱 시작" 버튼
- 결과 표시 영역 (텍스트 또는 테이블 형태)
- 진행 상태 표시 (API 호출 중 로딩)

### 내부 구조
- `read_customer.py`의 파싱 함수들을 import하여 사용
- GUI는 순수 프레젠테이션 레이어

---

## 구현 순서

| 순서 | 작업 | 파일 |
|------|------|------|
| 1 | 콘솔 도구 생성 (API 호출 + 파싱 + 출력) | `read_customer.py` |
| 2 | 샘플 2개로 테스트 (개인-강보경, 법인-캐치업코리아) | - |
| 3 | 파싱 결과 검증 및 조정 | `read_customer.py` |
| 4 | GUI 앱 생성 | `gui.py` |

## 검증 방법
```bash
# 콘솔 테스트
python tools/metdo_reader/read_customer.py "D:\tmp\sample\개인-강보경.png" --debug
python tools/metdo_reader/read_customer.py "D:\tmp\sample\법인-캐치업코리아.png" --debug

# 파싱 결과를 샘플 이미지와 비교하여 정확도 확인
# --debug로 저장된 OCR 원본 응답을 통해 파싱 로직 디버깅
```

## 핵심 참조 파일
- `tools/auto_clicker_v2/ocr/upstage_ocr_api.py` — Upstage API 호출 패턴 (lines 61-183)
- `tools/auto_clicker_v2/gui_main.py` — CustomTkinter GUI 패턴
- `D:\tmp\sample\개인-강보경.png` — 개인 고객 테스트 이미지
- `D:\tmp\sample\법인-캐치업코리아.png` — 법인 고객 테스트 이미지
