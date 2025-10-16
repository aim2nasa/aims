# Annual Report 기능 명세서

## 📋 개요

보험설계사가 관리하는 고객의 Annual Report (보유계약 현황 보고서)를 자동으로 파싱하여 DB에 저장하고 프론트엔드에서 표시하는 기능

---

## 🎯 핵심 요구사항

### 1. Annual Report 자동 인식 및 파싱
- 사용자가 "문서 등록"에 PDF 업로드
- 시스템이 자동으로 Annual Report 여부 판단 (비동기)
- Annual Report로 판단되면 자동 파싱 실행

### 2. 파싱할 데이터
- **고객명**: 첫 페이지에서 추출
- **발행기준일**: 첫 페이지에서 추출 (예: 2025년 8월 27일)
- **보유계약 현황 표**: 2~N페이지 (N은 가변적)
  - 순번, 증권번호, 보험상품, 계약자, 피보험자
  - 계약일, 계약상태, 가입금액, 보험기간, 납입기간, 보험료
- **부활가능 실효계약** (선택사항)

### 3. N페이지 판단 로직
- **"주요 보장내용 현황 (요약)"** 섹션 이전 페이지까지 = N
- 대부분 N=2이지만, 계약이 많은 고객은 N=3, 4 가능
- 동적으로 N을 찾아야 함

---

## 🗄️ DB 스키마

### customers 컬렉션 확장

```javascript
{
  _id: ObjectId,
  name: "안영미",
  // ... 기존 필드들 ...

  annual_reports: [  // 신규 필드 (배열로 이력 관리)
    {
      // 1페이지 메타데이터 (AI 불사용, 토큰 절약)
      customer_name: "안영미",                // 1페이지에서 추출
      report_title: "Annual Review Report",  // 1페이지에서 추출
      issue_date: ISODate("2025-08-27"),      // 발행기준일 (1페이지)
      fsr_name: "홍길동",                     // FSR 이름 (1페이지)

      uploaded_at: ISODate("2025-10-15"),     // 업로드 시점
      parsed_at: ISODate("2025-10-15"),       // 파싱 완료 시점
      source_file_id: ObjectId,                // docupload.files 참조 (선택)

      // 2~N페이지 계약 데이터 (AI 사용)
      contracts: [
        {
          순번: 1,
          증권번호: "0004164025",
          보험상품: "무배당 마스터플랜 변액유니버셜종신Ⅱ보험",
          계약자: "김보성",
          피보험자: "안영미",
          계약일: ISODate("2009-06-28"),
          계약상태: "정상",
          가입금액: 3000,               // 만원 단위
          보험기간: "종신",
          납입기간: "80세",
          보험료: 81750                  // 원 단위
        },
        // ... 추가 계약들
      ],

      // 요약 정보
      total_monthly_premium: 14102137,  // 월 보험료 합계
      total_contracts: 10,               // 보유 계약 건수

      // 부활가능 실효계약 (선택)
      lapsed_contracts: []
    }
  ]
}
```

**이유**: Annual Report는 특정 고객에만 해당하는 정보이므로 customers 컬렉션 내부에 포함

---

## 🔄 처리 흐름

### 전체 시나리오

```
1. 사용자: "문서 등록"에 PDF 업로드
   ↓
2. 프론트엔드 → 백엔드: 파일 업로드 API 호출
   ↓
3. 백엔드 (Node.js): 기존 문서 업로드 처리
   ↓
4. 백엔드 (Node.js) → Python API: Annual Report 판단 요청 (비동기)
   ↓
5. Python API - 1페이지 처리 (AI 불필요, 토큰 절약):
   - PDF 1페이지만 텍스트 추출
   - "Annual Review Report" 문구 확인
   - 고객명, Annual Report 제목, 발행(기준)일, FSR이름 추출
   - 추출된 메타데이터 DB 저장 (임시)
   ↓
6-A. Annual Report가 아닌 경우:
   → 종료 (기존 문서로만 처리)

6-B. Annual Report인 경우:
   ↓
7. Python API → 프론트엔드: 1페이지 메타데이터 반환
   - 고객명, 발행기준일, FSR이름 등
   ↓
8. 프론트엔드: 고객 식별 로직
   - DB에서 고객명으로 검색
   - 고객 1명: 자동 선택
   - 동명이인: 사용자에게 선택 모달
   - 고객 없음: 신규 생성 모달
   - customer_id 결정
   ↓
9. 프론트엔드 → Python API: 파싱 요청 (customer_id 포함)
   ↓
10. Python API - 2~N페이지 처리 (AI 사용):
   - N페이지 동적 탐지 ("주요 보장내용 현황" 이전까지)
   - 2~N페이지만 추출 (1페이지 제외로 토큰 절약)
   - OpenAI API로 보유계약 현황 표 파싱
   ↓
11. Python API: 파싱 결과 DB 저장
   - 프론트엔드가 전달한 customer_id의 annual_reports에 추가
   - 1페이지 메타데이터 + 2~N페이지 계약 데이터 결합
   ↓
12. 프론트엔드:
   - 파싱 완료 알림
   - 고객 상세 페이지 → 계약 탭 업데이트
```

### 주요 최적화 포인트

**토큰 절약 전략:**
1. **1페이지 처리**: AI 사용 안 함 (단순 텍스트 추출)
   - 고객명, 제목, 발행일, FSR이름은 정형화되어 있어 AI 불필요
2. **2~N페이지 처리**: AI 사용 (1페이지 제외)
   - OpenAI API에 2~N페이지만 전송
   - 평균 50% 토큰 절약

---

## 🖥️ 프론트엔드 UI

### 표시 위치
- **고객 상세 페이지 → 계약 탭 내부**
- Annual Report 섹션으로 구분

### UI 구성 (예시)
```
┌─────────────────────────────────────┐
│ 계약 탭                              │
├─────────────────────────────────────┤
│                                     │
│ 📊 Annual Report (2025-08-27 기준)  │
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 총 보유 계약: 10건                ││
│ │ 월 보험료 합계: 14,102,137원      ││
│ └─────────────────────────────────┘│
│                                     │
│ ┌─────────────────────────────────┐│
│ │ 순번 │ 증권번호 │ 보험상품 │ ... ││
│ ├─────────────────────────────────┤│
│ │  1  │ 00041... │ 무배당... │ ... ││
│ │  2  │ 00125... │ 무배당... │ ... ││
│ │ ...                             ││
│ └─────────────────────────────────┘│
│                                     │
│ [이전 Annual Report 보기] (이력 관리)│
└─────────────────────────────────────┘
```

---

## 🛠️ 백엔드 구현

### 기술 스택
- **Python FastAPI** (또는 별도 Python API)
  - AI 파싱에 유리
  - 기존 `tools/annual_report/parse_pdf_with_ai.py` 활용

### API 엔드포인트 (예시)

#### 1. Annual Report 판단 및 1페이지 메타데이터 추출 API
```
POST /api/annual-report/check
Request:
{
  "file_path": "/data/uploads/xxx.pdf"  // 또는 file upload
}

Response:
{
  "is_annual_report": true,
  "confidence": 0.95,
  "metadata": {  // 1페이지에서 추출 (AI 불사용)
    "customer_name": "안영미",
    "report_title": "Annual Review Report",
    "issue_date": "2025-08-27",
    "fsr_name": "홍길동"
  }
}
```

**설명:**
- 1페이지만 읽어서 Annual Report 판단 + 메타데이터 추출
- AI 사용 안 함 (토큰 절약)
- 프론트엔드는 이 정보로 고객 식별 로직 실행

#### 2. Annual Report 파싱 API (2~N페이지)
```
POST /api/annual-report/parse
Request:
{
  "file_path": "/data/uploads/xxx.pdf",
  "customer_id": "ObjectId",  // 프론트엔드가 결정한 고객 ID
  "end_page": 3  // 선택사항 (자동 탐지 가능)
}

Response:
{
  "success": true,
  "message": "파싱 시작됨. 약 25초 후 완료됩니다.",
  "job_id": "temp_xxx"
}
```

**설명:**
- 2~N페이지만 OpenAI API로 파싱 (1페이지 제외)
- 비동기 처리 (백그라운드 작업)
- customer_id의 annual_reports에 저장

#### 3. Annual Report 조회 API
```
GET /api/customers/:customer_id/annual-reports

Response:
{
  "success": true,
  "data": [
    {
      "issue_date": "2025-08-27",
      "contracts": [...],
      "total_monthly_premium": 14102137,
      "total_contracts": 10
    }
  ]
}
```

---

## 🤖 AI 파싱 로직

### 기존 코드 활용
- **참고 파일**: `tools/annual_report/parse_pdf_with_ai.py`
- **OpenAI API**: GPT-4.1 Responses API 사용
- **테스트 샘플 PDF**: `tools/annual_report/` 폴더 내 4개 파일
  - `안영미annual report202508_p2p3.pdf`
  - `김보성보유계약현황202508_p2p3.pdf`
  - `신상철보유계약현황2025081_p2p3.pdf`
  - `정부균보유계약현황202508_p2p3.pdf`

### 기존 프롬프트 (검증된 버전)

`tools/annual_report/parse_pdf_with_ai.py`에서 사용 중인 프롬프트:

```python
{
  "role": "system",
  "content": """
  You are a strict document parsing assistant.
  Extract '보유계약 현황' and '부활가능 실효계약' tables from the PDF.

  Rules:
  1. 반드시 JSON만 반환. (마크다운, 주석, 설명 절대 금지)
  2. JSON Schema:
     {
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
     - 의미 없는 단어, 문구, 회사명은 절대 포함하지 않는다
  4. 계약자/피보험자:
     - 반드시 사람 이름만 기록
     - 불필요한 텍스트는 제거
  """
}
```

### 파싱 코드 구조

```python
from openai import OpenAI
import json
import re

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def parse_pdf_with_ai(pdf_path):
    # 1. PDF 업로드
    file = client.files.create(
        file=open(pdf_path, "rb"),
        purpose="assistants"
    )

    # 2. Responses API 호출 (위의 프롬프트 사용)
    response = client.responses.create(
        model="gpt-4.1",
        input=[...]
    )

    # 3. 출력 텍스트 추출
    output_text = response.output[0].content[0].text.strip()

    # 4. 마크다운 코드블록 제거 (```json ... ``` 형식)
    output_text = re.sub(r"^```json\s*", "", output_text)
    output_text = re.sub(r"^```", "", output_text)
    output_text = re.sub(r"```$", "", output_text)

    # 5. JSON 파싱
    try:
        return json.loads(output_text)
    except Exception:
        return {"raw_output": output_text}
```

### 구현 시 확장 방향

기존 코드는 **2~3페이지만 추출된 PDF**를 대상으로 작동합니다. 실제 구현 시에는:

1. **전체 PDF 업로드**
   - 1페이지: 고객명, 발행기준일 추출
   - 2~N페이지: "주요 보장내용 현황" 이전까지 동적 탐지

2. **프롬프트 확장**
   ```python
   content = """
   1단계: 1페이지에서 고객명과 발행기준일 추출
   2단계: "주요 보장내용 현황 (요약)" 섹션 찾기
   3단계: 해당 섹션 이전 페이지까지를 보유계약 현황으로 인식
   4단계: 기존 프롬프트 규칙에 따라 JSON 변환
   """
   ```

3. **에러 핸들링**
   - JSON 파싱 실패 → `raw_output` 필드에 원본 텍스트 저장
   - AI가 마크다운 코드블록으로 감싼 경우 자동 제거

---

## 📌 추가 고려사항

### 1. 고객 식별 (동명이인 처리)

**프론트엔드 고객 식별 로직:**

1. **PDF 첫 페이지에서 고객명 추출**
   - Annual Report 업로드 시 자동으로 첫 페이지에서 이름 파싱

2. **DB에서 해당 이름으로 고객 검색**

3. **시나리오별 처리:**
   - **고객 1명 발견**: 자동으로 해당 고객의 annual_reports에 등록
   - **동명이인 (2명 이상)**: 모달 띄워서 사용자에게 선택 요청
     ```
     "안영미" 고객이 2명 있습니다.
     어느 고객의 Annual Report입니까?
     [ ] 안영미 (010-1234-5678)
     [ ] 안영미 (010-9876-5432)
     [선택] [취소]
     ```
   - **고객 없음 (0명)**: 신규 고객 생성 모달 표시
     ```
     "안영미" 고객이 등록되지 않았습니다.
     새로운 고객으로 등록하시겠습니까?

     고객명: 안영미 (자동 입력)
     전화번호: [          ]
     [등록 후 Annual Report 저장] [취소]
     ```

4. **백엔드 API 호출**
   - 프론트엔드가 결정한 `customer_id`와 함께 파싱 요청
   - 백엔드는 받은 `customer_id`의 annual_reports에 저장

**중요:** 고객 식별 로직은 **프론트엔드 책임**. 백엔드는 전달받은 customer_id를 신뢰하고 저장만 수행.

### 2. 이력 관리
- `customers.annual_reports` 배열로 여러 시점의 리포트 저장
- 최신순 정렬로 표시

### 3. 에러 처리
- AI 파싱 실패 시:
  - 사용자에게 알림
  - 원본 PDF는 기존 문서로 유지
  - 재파싱 버튼 제공

### 4. 성능 최적화
- 비동기 처리로 업로드 속도 보장
- 파싱 결과를 WebSocket 또는 폴링으로 실시간 반영

### 5. 다중 보험사 지원 (향후)
- 현재: 메트라이프 포맷
- 향후: 다른 보험사 PDF 포맷도 지원 가능하도록 확장성 고려

---

## 🔐 보안 고려사항

- Annual Report는 민감한 개인정보 포함
- 기존 AIMS 보안 정책 준수
- 파일 업로드 시 바이러스 검사
- DB 접근 권한 제어

---

## 📅 구현 단계 (예상)

### Phase 1: 백엔드 파싱 로직
1. Python API 엔드포인트 생성
2. Annual Report 판단 로직 구현
3. N페이지 동적 탐지 로직
4. AI 파싱 로직 (기존 코드 활용)
5. DB 저장 로직

### Phase 2: 프론트엔드 UI
1. 고객 선택 UI (업로드 시)
2. 계약 탭 내 Annual Report 섹션 추가
3. 파싱 결과 테이블 표시
4. 이력 조회 기능

### Phase 3: 통합 및 테스트
1. 비동기 처리 통합
2. 엔드투엔드 테스트
3. 에러 핸들링 검증
4. 성능 테스트

---

## 📎 참고 자료

### 기존 구현 코드
- **파싱 스크립트**: `tools/annual_report/parse_pdf_with_ai.py`
  - OpenAI GPT-4.1 Responses API 사용
  - 검증된 프롬프트 포함
  - JSON 파싱 및 에러 핸들링 로직
- **실행 스크립트**: `tools/annual_report/run.sh`
  - 샘플 PDF 일괄 테스트용

### 테스트 샘플 PDF (2~3페이지만 추출됨)
- `tools/annual_report/안영미annual report202508_p2p3.pdf`
- `tools/annual_report/김보성보유계약현황202508_p2p3.pdf`
- `tools/annual_report/신상철보유계약현황2025081_p2p3.pdf`
- `tools/annual_report/정부균보유계약현황202508_p2p3.pdf`

### 외부 문서
- OpenAI Responses API: https://platform.openai.com/docs/api-reference/responses
- OpenAI Files API: https://platform.openai.com/docs/api-reference/files

---

**작성일**: 2025-10-15
**최종 수정**: 2025-10-15
