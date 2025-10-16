# Annual Report 구현 방법 분석 및 벤치마크 결과

**작성일**: 2025-10-16
**목적**: Annual Report 파싱 기능의 최적 백엔드 구현 방법 결정

---

## 📊 파싱 시간 측정 결과

### 실행 환경
- **서버**: tars (Linux)
- **AI 모델**: OpenAI GPT-4.1 (Responses API)
- **테스트 대상**: 2~3페이지 PDF (계약 테이블만 추출된 샘플)
- **측정 도구**: `tools/annual_report/benchmark_parser.py`

### 📈 실측 데이터

| 파일명 | 계약 건수 | 처리 시간 | 비고 |
|--------|----------|-----------|------|
| 안영미annual report202508 | 10건 | **42.63초** | 최대값 |
| 김보성보유계약현황202508 | 6건 | 22.24초 | |
| 신상철보유계약현황202508 | 4건 | 20.65초 | |
| 정부균보유계약현황202508 | 4건 | 15.83초 | 최소값 |

### 🎯 핵심 통계
- ✅ **성공률**: 4/4건 (100%)
- ⏱️ **평균 처리 시간**: **25.34초**
- ⏱️ **최소 처리 시간**: 15.83초
- ⏱️ **최대 처리 시간**: 42.63초
- 📊 **처리 시간 특징**: 계약 건수가 많을수록 시간 증가

---

## 🔍 핵심 발견 사항

### 1. 처리 시간이 예상보다 길다
- 사용자 예상: "10초 이상?"
- 실제 결과: **15~43초** (평균 25초)
- 계약 건수와 비례: 10건(43초) vs 4건(16초)

### 2. n8n은 불가능
- n8n은 짧은 HTTP 요청에 최적화 (< 5초)
- 25초 이상 작업은 타임아웃 위험
- 사용자가 25초 대기 시 UX 나쁨
- 디버깅 및 에러 처리 복잡

### 3. Node.js 단독도 비추천
- OpenAI API는 Node.js SDK 제공하지만
- 기존 Python 코드(`parse_pdf_with_ai.py`) 재작성 필요
- PDF 파싱 라이브러리 Python이 더 풍부
- 검증된 프롬프트 활용 불가

---

## 🏆 최종 추천: Python FastAPI (독립 서비스)

### 선택 이유

| 항목 | n8n | Node.js | Python FastAPI |
|------|-----|---------|----------------|
| **처리 시간** | ❌ 타임아웃 위험 | ⚠️ 가능하나 복잡 | ✅ Background Tasks |
| **비동기 처리** | ❌ 제한적 | ⚠️ 추가 구현 필요 | ✅ 내장 지원 (Celery) |
| **기존 코드 재사용** | ❌ 불가능 | ❌ 재작성 필요 | ✅ 100% 재사용 |
| **AI 연동** | ⚠️ HTTP로 우회 | ⚠️ SDK 재학습 | ✅ OpenAI SDK 직접 사용 |
| **디버깅** | ❌ UI 기반, 불편 | ✅ 가능 | ✅ 일반 Python 코드 |
| **테스트** | ❌ 어려움 | ✅ Jest | ✅ pytest |
| **확장성** | ❌ 복잡 | ⚠️ 보통 | ✅ 클래스/함수 구조 |
| **시스템 일관성** | ⚠️ 별도 | ✅ 기존 Node.js | ✅ 기존 Python 모듈 |

### 주요 장점

#### 1. 비동기 처리 완벽 지원
```python
from fastapi import BackgroundTasks

@app.post("/annual-report/parse")
async def parse_annual_report(
    file_id: str,
    customer_id: str,
    background_tasks: BackgroundTasks
):
    # 즉시 응답 반환 (< 1초)
    background_tasks.add_task(
        do_parsing_in_background,
        file_id,
        customer_id
    )
    return {"status": "parsing_started", "job_id": "..."}
```

**효과**:
- 사용자는 즉시 응답 받음 (1초 이내)
- 백그라운드에서 25초 동안 파싱
- WebSocket/폴링으로 완료 알림

#### 2. 기존 코드 100% 재사용
```python
# tools/annual_report/parse_pdf_with_ai.py 그대로 활용
from services.parser import parse_pdf_with_ai

def do_parsing_in_background(file_id, customer_id):
    pdf_path = get_pdf_path(file_id)

    # 검증된 코드 그대로 사용
    result = parse_pdf_with_ai(pdf_path)

    # MongoDB 저장
    save_annual_report(customer_id, result)
```

#### 3. Celery로 확장 가능
```python
@celery.task
def parse_annual_report_task(file_id, customer_id):
    # 25초 걸려도 문제없음
    # 작업 큐 관리, 재시도, 모니터링 가능
    result = parse_pdf_with_ai(pdf_path)
    save_to_mongodb(customer_id, result)
```

#### 4. 시스템 아키텍처 일관성
- 기존 `src/docmeta/core.py`가 Python으로 문서 처리
- 기존 `backend/api/doc_status_api/`가 Python FastAPI
- Annual Report도 동일한 패턴 유지

---

## 🏗️ 추천 아키텍처

### 전체 시스템 흐름

```
┌─────────────────────────────────────────────────┐
│ 1. Frontend (React)                             │
│    - 문서 업로드 UI                              │
│    - 고객 선택 드롭다운                          │
│    - "업로드" 버튼 클릭                          │
└────────────┬────────────────────────────────────┘
             │ POST /api/documents (즉시 응답 < 1초)
             ↓
┌─────────────────────────────────────────────────┐
│ 2. Node.js API (backend/api/aims_api/)          │
│    - 파일 저장 → MongoDB docupload.files        │
│    - Python API 비동기 호출                     │
│    - 사용자에게 "업로드 완료" 응답               │
└────────────┬────────────────────────────────────┘
             │ POST /annual-report/parse (비동기)
             ↓
┌─────────────────────────────────────────────────┐
│ 3. Python FastAPI (backend/api/annual_report/)  │
│    Step 1: PDF 1페이지 읽기 (1초)               │
│            → "Annual Report" 판단               │
│    Step 2: 아니면 종료, 맞으면 계속             │
│    Step 3: N페이지 동적 탐지 (1초)              │
│            → "주요 보장내용 현황" 이전까지      │
│    Step 4: OpenAI API 파싱 (25초)               │
│            → 보유계약 현황 JSON 변환            │
│    Step 5: MongoDB 저장 (1초)                   │
│            → customers.annual_reports 추가      │
│    총 소요: 약 28초                              │
└────────────┬────────────────────────────────────┘
             │ WebSocket 알림 또는 폴링
             ↓
┌─────────────────────────────────────────────────┐
│ 4. Frontend                                     │
│    - "파싱 완료" 알림                            │
│    - 고객 상세 페이지 → 계약 탭 자동 업데이트    │
└─────────────────────────────────────────────────┘
```

### 시간 분석

| 단계 | 소요 시간 | 사용자 경험 |
|------|----------|------------|
| 파일 업로드 (Node.js) | 0.5초 | 즉시 응답 ✅ |
| Annual Report 판단 | 1초 | 백그라운드 |
| N페이지 탐지 | 1초 | 백그라운드 |
| OpenAI 파싱 | 25초 | 백그라운드 |
| DB 저장 | 1초 | 백그라운드 |
| **사용자 체감 시간** | **0.5초** | "업로드 완료" |
| **실제 전체 시간** | **28.5초** | 백그라운드 처리 |

---

## 📂 프로젝트 구조 제안

```
backend/api/annual_report_api/
├── main.py                 # FastAPI 애플리케이션 엔트리포인트
├── routes/
│   ├── __init__.py
│   ├── check.py            # POST /check - Annual Report 판단
│   ├── parse.py            # POST /parse - 파싱 + DB 저장
│   └── query.py            # GET /customers/:id/annual-reports
├── services/
│   ├── __init__.py
│   ├── detector.py         # Annual Report 판단 로직
│   ├── parser.py           # OpenAI API 파싱 (기존 코드 활용)
│   ├── page_finder.py      # N페이지 동적 탐지
│   └── db_writer.py        # MongoDB 저장 로직
├── models/
│   ├── __init__.py
│   ├── request.py          # API Request 모델 (Pydantic)
│   └── response.py         # API Response 모델 (Pydantic)
├── utils/
│   ├── __init__.py
│   ├── pdf_utils.py        # PDF 텍스트 추출, 페이지 카운트
│   └── openai_client.py    # OpenAI API 클라이언트 싱글톤
├── config.py               # 설정 (MongoDB URI, OpenAI API Key 등)
├── requirements.txt        # Python 패키지 의존성
└── README.md               # API 문서
```

---

## 🔧 핵심 로직 구현 예시

### 1. Annual Report 판단 (`services/detector.py`)

```python
from utils.pdf_utils import extract_text_from_page

def is_annual_report(pdf_path: str) -> dict:
    """
    PDF 1페이지를 읽고 Annual Report 여부 판단

    Returns:
        {
            "is_annual_report": bool,
            "confidence": float,
            "reason": str
        }
    """
    try:
        # 1페이지만 읽기 (빠름)
        first_page_text = extract_text_from_page(pdf_path, page=0)

        # 필수 키워드 체크
        required_keywords = [
            "Annual Review Report",
            "보유계약 현황",
            "메트라이프생명"
        ]

        matched = [kw for kw in required_keywords if kw in first_page_text]
        confidence = len(matched) / len(required_keywords)

        if confidence >= 0.8:
            return {
                "is_annual_report": True,
                "confidence": confidence,
                "reason": f"키워드 매칭: {matched}"
            }
        else:
            return {
                "is_annual_report": False,
                "confidence": confidence,
                "reason": f"키워드 부족: {len(matched)}/{len(required_keywords)}"
            }

    except Exception as e:
        return {
            "is_annual_report": False,
            "confidence": 0.0,
            "reason": f"에러: {str(e)}"
        }
```

### 2. N페이지 동적 탐지 (`services/page_finder.py`)

```python
from utils.pdf_utils import get_page_count, extract_text_from_page

def find_contract_table_end_page(pdf_path: str) -> int:
    """
    '주요 보장내용 현황 (요약)' 섹션 이전 페이지 찾기

    Returns:
        int: 계약 테이블 마지막 페이지 번호 (0-indexed)
    """
    total_pages = get_page_count(pdf_path)

    # 2페이지부터 검색 (1페이지는 커버)
    for page_num in range(2, min(total_pages, 10)):  # 최대 10페이지까지만
        text = extract_text_from_page(pdf_path, page_num)

        # 종료 조건: "주요 보장내용 현황" 발견
        if "주요 보장내용 현황" in text or "주요보장내용현황" in text:
            return page_num - 1  # 이전 페이지까지가 계약 테이블

    # 기본값: 대부분 2페이지
    return 2
```

### 3. OpenAI API 파싱 (`services/parser.py`)

```python
from openai import OpenAI
import json
import re
import os

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def parse_annual_report(pdf_path: str) -> dict:
    """
    기존 parse_pdf_with_ai.py 로직 활용

    Returns:
        {
            "고객명": str,
            "발행기준일": "YYYY-MM-DD",
            "보유계약 현황": [
                {
                    "순번": int,
                    "증권번호": str,
                    "보험상품": str,
                    ...
                }
            ],
            "부활가능 실효계약": [...]
        }
    """
    # 1. PDF 업로드
    file = client.files.create(
        file=open(pdf_path, "rb"),
        purpose="assistants"
    )

    # 2. Responses API 호출 (검증된 프롬프트)
    response = client.responses.create(
        model="gpt-4.1",
        input=[
            {
                "role": "system",
                "content": """
                You are a strict document parsing assistant.
                Extract '보유계약 현황' and '부활가능 실효계약' tables from the PDF.

                Rules:
                1. 반드시 JSON만 반환. (마크다운, 주석, 설명 절대 금지)
                2. JSON Schema:
                   {
                     "고객명": string,
                     "발행기준일": "YYYY-MM-DD",
                     "보유계약 현황": [
                       {
                         "순번": number,
                         "증권번호": string,
                         "보험상품": string,
                         "계약자": string,
                         "피보험자": string,
                         "계약일": "YYYY-MM-DD",
                         "계약상태": string,
                         "가입금액(만원)": number,
                         "보험기간": string,
                         "납입기간": string,
                         "보험료(원)": number
                       }
                     ],
                     "부활가능 실효계약": [ ... ]
                   }
                3. 보험상품:
                   - 반드시 PDF 표 셀 내부의 텍스트만 기록
                   - 표 외부 텍스트(머리말, 각주, 회사명, 마케팅 문구 등)는 절대 포함하지 말 것
                   - 상품명은 "보험", "종신", "연금", "플랜", "Plus" 등 보험 관련 키워드로 끝나야 함
                   - 줄바꿈으로 나뉜 경우 합쳐서 하나의 문자열로 작성
                4. 계약자/피보험자:
                   - 반드시 사람 이름만 기록
                """
            },
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": "Parse the attached PDF into JSON."},
                    {"type": "input_file", "file_id": file.id}
                ]
            }
        ]
    )

    # 3. 출력 텍스트 정리
    output_text = response.output[0].content[0].text.strip()

    # 4. 마크다운 코드블록 제거
    output_text = re.sub(r"^```json\s*", "", output_text)
    output_text = re.sub(r"^```", "", output_text)
    output_text = re.sub(r"```$", "", output_text)

    try:
        parsed_json = json.loads(output_text)
        return parsed_json
    except Exception as e:
        return {
            "error": "JSON 파싱 실패",
            "raw_output": output_text,
            "exception": str(e)
        }
```

### 4. MongoDB 저장 (`services/db_writer.py`)

```python
from pymongo import MongoClient
from bson import ObjectId
from datetime import datetime

client = MongoClient("mongodb://tars:27017/")
db = client["docupload"]
customers_collection = db["customers"]

def save_annual_report(customer_id: str, report_data: dict) -> bool:
    """
    customers 컬렉션에 annual_reports 추가

    Args:
        customer_id: 고객 ObjectId
        report_data: parse_annual_report() 결과

    Returns:
        bool: 저장 성공 여부
    """
    try:
        # 요약 정보 계산
        contracts = report_data.get("보유계약 현황", [])
        total_monthly_premium = sum(
            c.get("보험료(원)", 0) for c in contracts
        )

        # annual_reports 문서 생성
        annual_report = {
            "issue_date": report_data.get("발행기준일"),
            "uploaded_at": datetime.now(),
            "parsed_at": datetime.now(),
            "contracts": contracts,
            "lapsed_contracts": report_data.get("부활가능 실효계약", []),
            "total_monthly_premium": total_monthly_premium,
            "total_contracts": len(contracts)
        }

        # customers 컬렉션 업데이트
        result = customers_collection.update_one(
            {"_id": ObjectId(customer_id)},
            {"$push": {"annual_reports": annual_report}}
        )

        return result.modified_count > 0

    except Exception as e:
        print(f"❌ DB 저장 실패: {e}")
        return False
```

### 5. FastAPI 엔드포인트 (`routes/parse.py`)

```python
from fastapi import APIRouter, BackgroundTasks
from models.request import ParseRequest
from models.response import ParseResponse
from services.detector import is_annual_report
from services.page_finder import find_contract_table_end_page
from services.parser import parse_annual_report
from services.db_writer import save_annual_report

router = APIRouter()

def do_parsing_in_background(file_path: str, customer_id: str):
    """백그라운드 작업: 25초 소요"""
    # 1. Annual Report 판단
    check_result = is_annual_report(file_path)
    if not check_result["is_annual_report"]:
        print(f"⚠️  Annual Report 아님: {check_result['reason']}")
        return

    # 2. N페이지 탐지
    end_page = find_contract_table_end_page(file_path)
    print(f"📄 계약 테이블 범위: 2 ~ {end_page}페이지")

    # 3. OpenAI 파싱 (25초)
    print(f"🤖 OpenAI 파싱 시작...")
    result = parse_annual_report(file_path)

    if "error" in result:
        print(f"❌ 파싱 실패: {result['error']}")
        return

    # 4. MongoDB 저장
    success = save_annual_report(customer_id, result)
    if success:
        print(f"✅ 파싱 완료: {result.get('고객명')}")
    else:
        print(f"❌ DB 저장 실패")

@router.post("/parse", response_model=ParseResponse)
async def parse_annual_report_endpoint(
    request: ParseRequest,
    background_tasks: BackgroundTasks
):
    """
    Annual Report 파싱 API (비동기)

    즉시 응답 후 백그라운드에서 25초 동안 처리
    """
    # 파일 경로 확인
    file_path = get_pdf_path(request.file_id)

    # 백그라운드 작업 등록
    background_tasks.add_task(
        do_parsing_in_background,
        file_path,
        request.customer_id
    )

    # 즉시 응답 (< 1초)
    return ParseResponse(
        success=True,
        message="파싱 시작됨. 약 25초 후 완료됩니다.",
        job_id=request.file_id
    )
```

---

## 🚀 구현 단계

### Phase 1: Python FastAPI 기본 틀 (2일)
1. ✅ `backend/api/annual_report_api/` 디렉토리 생성
2. ✅ FastAPI 앱 설정 (`main.py`)
3. ✅ MongoDB 연결 설정
4. ✅ 헬스체크 엔드포인트 (`GET /health`)
5. ✅ 환경 변수 설정 (`config.py`)

### Phase 2: 파싱 로직 구현 (3일)
1. ✅ `tools/annual_report/parse_pdf_with_ai.py` → `services/parser.py` 이동
2. ✅ N페이지 동적 탐지 로직 추가 (`services/page_finder.py`)
3. ✅ 고객명/발행기준일 추출 프롬프트 확장
4. ✅ 4개 샘플 PDF로 테스트 및 검증
5. ✅ 에러 핸들링 강화

### Phase 3: API 엔드포인트 (2일)
1. ✅ `POST /annual-report/check` - Annual Report 판단
2. ✅ `POST /annual-report/parse` - 파싱 + DB 저장 (비동기)
3. ✅ `GET /customers/:id/annual-reports` - 조회
4. ✅ API 문서 작성 (FastAPI 자동 생성)

### Phase 4: Node.js 연동 (2일)
1. ✅ `backend/api/aims_api/server.js`에 Python API 호출 추가
2. ✅ 파일 업로드 후 비동기 파싱 트리거
3. ✅ 파싱 상태를 MongoDB에 기록
4. ✅ WebSocket 또는 폴링으로 프론트엔드 알림

### Phase 5: 프론트엔드 UI (3일)
1. ✅ 문서 업로드 시 고객 선택 UI
2. ✅ "파싱 중..." 인디케이터
3. ✅ 고객 상세 페이지 → 계약 탭 내 Annual Report 섹션
4. ✅ 계약 테이블 표시 (정렬, 필터링)
5. ✅ 이력 조회 기능 (여러 Annual Report)

### Phase 6: 통합 테스트 (2일)
1. ✅ 엔드투엔드 테스트 (업로드 → 파싱 → 표시)
2. ✅ 에러 케이스 테스트 (파싱 실패, 타임아웃 등)
3. ✅ 성능 테스트 (동시 업로드)
4. ✅ 사용자 시나리오 테스트

**총 예상 기간**: 14일 (약 2주)

---

## 📊 예상 성능

### 처리 시간
- **사용자 체감**: 0.5초 (업로드 완료 응답)
- **백그라운드 전체**: 28초
  - Annual Report 판단: 1초
  - N페이지 탐지: 1초
  - OpenAI 파싱: 25초 (실측)
  - DB 저장: 1초

### 동시 처리
- FastAPI BackgroundTasks: 수십 개 동시 처리 가능
- Celery 도입 시: 수백 개 동시 처리 가능 (작업 큐)

### 확장성
- 다른 보험사 포맷 추가 시: 새 `detector` 클래스 추가
- 프롬프트 개선: `parser.py`의 프롬프트만 수정
- 성능 향상: Celery + Redis 도입

---

## ⚠️ 주의사항 및 제약

### 1. OpenAI API 비용
- GPT-4.1 Responses API 사용
- PDF 파일 크기 및 페이지 수에 따라 비용 증가
- 예상 비용: 파일당 $0.05 ~ $0.20

### 2. API 응답 시간 변동
- OpenAI API 서버 상태에 따라 15~43초로 변동
- 피크 타임에는 더 느릴 수 있음
- 타임아웃 설정 권장: 60초

### 3. 파싱 정확도
- AI 기반이므로 100% 정확도 보장 불가
- 현재 4개 샘플에서 100% 성공
- 다양한 포맷 테스트 필요

### 4. 보안
- OPENAI_API_KEY 환경 변수 관리 필수
- PDF 파일에 민감 정보 포함
- HTTPS 필수, 파일 암호화 권장

---

## 🔐 보안 체크리스트

- [ ] OPENAI_API_KEY 환경 변수로 관리 (코드에 하드코딩 금지)
- [ ] PDF 파일 업로드 시 바이러스 스캔
- [ ] 파일 크기 제한 (예: 최대 10MB)
- [ ] API 인증 토큰 검증
- [ ] MongoDB 접근 권한 제어
- [ ] 업로드된 PDF 파일 암호화 저장
- [ ] 파싱 완료 후 임시 파일 삭제
- [ ] Rate Limiting (사용자당 분당 5회)

---

## 📚 참고 자료

### 기존 코드
- **파싱 스크립트**: `tools/annual_report/parse_pdf_with_ai.py`
- **벤치마크 스크립트**: `tools/annual_report/benchmark_parser.py`
- **테스트 샘플**: `tools/annual_report/*.pdf` (4개)

### 외부 문서
- [OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses)
- [FastAPI Background Tasks](https://fastapi.tiangolo.com/tutorial/background-tasks/)
- [Celery 공식 문서](https://docs.celeryq.dev/)

### 프로젝트 명세
- `docs/ANNUAL_REPORT_FEATURE_SPEC.md` - 기능 요구사항
- `backend/api/aims_api/server.js` - Node.js API 서버
- `src/docmeta/core.py` - 기존 문서 메타데이터 추출

---

## 🎯 결론

1. **Python FastAPI가 최적의 선택**
   - 25초 평균 처리 시간 → 비동기 필수
   - 기존 검증된 코드 100% 재사용
   - 확장성 및 유지보수성 우수

2. **n8n/Node.js 단독은 비추천**
   - n8n: 타임아웃 위험, 복잡한 로직 처리 불리
   - Node.js: 기존 Python 코드 재작성 비용 높음

3. **구현 기간: 약 2주**
   - 백엔드 API: 1주
   - 프론트엔드 + 통합: 1주

4. **사용자 경험**
   - 업로드 즉시 완료 (0.5초)
   - 백그라운드 파싱 (28초)
   - 완료 시 자동 알림

---

**다음 단계**: Python FastAPI 프로젝트 생성 및 기본 구조 구현

**작성자**: Claude
**검토**: 벤치마크 실측 데이터 기반
