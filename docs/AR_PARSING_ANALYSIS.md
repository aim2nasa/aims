# Annual Report (AR) 문서 파싱 분석

## 개요

AIMS 시스템에서 Annual Report PDF 문서를 파싱하여 계약 정보를 추출하는 과정을 분석한 문서입니다.

---

## 1. 사용 기술

| 항목 | 값 |
|------|-----|
| AI 서비스 | **OpenAI API** |
| 기본 모델 | `gpt-4.1` |
| API 방식 | Chat Completions API (파일 입력 지원) |
| 파일 업로드 | OpenAI Files API (`purpose="assistants"`) |

---

## 2. 핵심 파일 구조

```
backend/api/annual_report_api/
├── services/
│   └── parser.py          # OpenAI API 파싱 로직 (핵심)
├── config.py              # 설정 (API 키, 모델명)
├── routes/
│   ├── parse.py           # 파싱 API 엔드포인트
│   └── background.py      # 백그라운드 파싱
└── main.py                # FastAPI 앱
```

---

## 3. 파싱 흐름

```
┌─────────────────────────────────────────────────────────────────┐
│                    AR 문서 파싱 프로세스                          │
└─────────────────────────────────────────────────────────────────┘

[1] PDF 입력
     │
     ▼
[2] 페이지 추출 (2~N페이지만)
     │  - 1페이지 제외 (토큰 절약)
     │  - PyPDF2로 추출 → 임시 파일 생성
     │
     ▼
[3] OpenAI 파일 업로드
     │  - ai_client.files.create(file, purpose="assistants")
     │  - 업로드된 file_id 획득
     │
     ▼
[4] Chat Completions API 호출
     │  - 모델: gpt-4.1 (설정에서 동적 조회)
     │  - 시스템 프롬프트: JSON 스키마 정의
     │  - 사용자 메시지: PDF 파일 첨부
     │
     ▼
[5] 응답 처리
     │  - 마크다운 코드블록 제거
     │  - JSON 파싱
     │
     ▼
[6] 결과 반환
     {
       "총_월보험료": number,
       "보유계약 현황": [...],
       "부활가능 실효계약": [...]
     }
```

---

## 4. 상세 코드 분석

### 4.1 OpenAI 클라이언트 초기화

**파일**: `services/parser.py:23-34`

```python
from openai import OpenAI

client: Optional[OpenAI] = None

def get_openai_client() -> OpenAI:
    """OpenAI 클라이언트 싱글톤"""
    global client

    if client is None:
        if not settings.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY가 설정되지 않았습니다")

        client = OpenAI(api_key=settings.OPENAI_API_KEY)

    return client
```

### 4.2 PDF 페이지 추출 (토큰 최적화)

**파일**: `services/parser.py:55-87`

```python
def extract_pdf_pages(pdf_path: str, start_page: int, end_page: int) -> str:
    """
    PDF의 start_page~end_page만 추출하여 임시 파일로 저장

    명세: 1페이지는 AI 없이 처리하므로 2~N페이지만 추출 (토큰 절약)
    """
    reader = PdfReader(pdf_path)
    writer = PdfWriter()

    # 2~N페이지 추출
    for page_num in range(start_page - 1, min(end_page, len(reader.pages))):
        writer.add_page(reader.pages[page_num])

    # 임시 파일 생성
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    with open(temp_file.name, 'wb') as output_file:
        writer.write(output_file)

    return temp_file.name
```

### 4.3 OpenAI API 호출

**파일**: `services/parser.py:219-231`

```python
response = ai_client.chat.completions.create(
    model=annual_report_model,  # gpt-4.1
    messages=[
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": user_text},
                {"type": "file", "file": {"file_id": uploaded_file.id}}
            ]
        }
    ]
)
```

### 4.4 시스템 프롬프트 (JSON 스키마)

**파일**: `services/parser.py:165-211`

```
핵심 규칙:
1. 반드시 JSON만 반환 (마크다운, 주석, 설명 금지)
2. 총_월보험료: PDF에 적힌 값 그대로 읽기 (계산 금지)
3. 보험상품: 표 셀 내부 텍스트만 (외부 텍스트 포함 금지)
4. 계약자/피보험자: 사람 이름만
5. 계약일: YYYY-MM-DD 형식
6. 보험료: 숫자만 (쉼표 제거, 정수형)
```

---

## 5. 모델 설정 관리

### 5.1 동적 모델 조회

**파일**: `config.py:20-43`

```python
def get_annual_report_model() -> str:
    """
    aims_api에서 연보 파싱 모델 설정 조회 (1분 캐싱)
    """
    # 캐시 유효 시 캐시 반환
    if _ai_model_cache["model"] and (now - _ai_model_cache["timestamp"]) < 60:
        return _ai_model_cache["model"]

    # API에서 조회
    response = requests.get(f"{AIMS_API_URL}/api/settings/ai-models")
    model = response.json()["data"]["annualReport"]["model"]

    # 캐시 업데이트
    _ai_model_cache["model"] = model
    return model
```

### 5.2 설정 엔드포인트

```
GET /api/settings/ai-models

응답:
{
  "data": {
    "annualReport": {
      "model": "gpt-4.1"
    }
  }
}
```

---

## 6. 출력 JSON 스키마

```json
{
  "총_월보험료": 150000,
  "보유계약 현황": [
    {
      "순번": 1,
      "증권번호": "123456789",
      "보험상품": "무배당 종신보험",
      "계약자": "홍길동",
      "피보험자": "홍길동",
      "계약일": "2020-01-15",
      "계약상태": "정상유지",
      "가입금액(만원)": 10000,
      "보험기간": "종신",
      "납입기간": "20년",
      "보험료(원)": 150000
    }
  ],
  "부활가능 실효계약": []
}
```

---

## 7. 에러 처리

| 상황 | 응답 |
|------|------|
| PDF 파일 없음 | `FileNotFoundError` |
| API 키 없음 | `ValueError` |
| JSON 파싱 실패 | `{"error": "JSON 파싱 실패", "raw_output": "..."}` |
| API 호출 실패 | `{"error": "파싱 실패: ...", "raw_output": ""}` |

---

## 8. 토큰 최적화 전략

| 전략 | 설명 |
|------|------|
| 1페이지 제외 | 고객명/발행일은 별도 추출, AI에 전송 안 함 |
| 페이지 추출 | 필요한 페이지만 임시 PDF로 생성 |
| 간결한 프롬프트 | JSON 스키마 명확히 정의하여 불필요한 응답 방지 |

---

## 9. 의존성

```
# requirements.txt
openai>=1.0.0
PyPDF2>=3.0.0
python-dotenv
requests
```

---

## 10. 환경 변수

```bash
# .env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1
AIMS_API_URL=http://localhost:3010
```

---

## 작성일

2025-01-16
