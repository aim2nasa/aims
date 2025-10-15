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
      issue_date: ISODate("2025-08-27"),      // 발행기준일
      uploaded_at: ISODate("2025-10-15"),     // 업로드 시점
      parsed_at: ISODate("2025-10-15"),       // 파싱 완료 시점
      source_file_id: ObjectId,                // docupload.files 참조 (선택)

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
5. Python API:
   - PDF 1페이지 읽기
   - "Annual Review Report" 문구 확인
   - "보유계약 현황" 표 존재 확인
   ↓
6-A. Annual Report가 아닌 경우:
   → 종료 (기존 문서로만 처리)

6-B. Annual Report인 경우:
   ↓
7. Python API: N페이지 판단
   - "주요 보장내용 현황 (요약)" 이전까지 찾기
   - 대부분 N=2, 최대 N=4 정도
   ↓
8. Python API: 2~N페이지 추출 → AI 파싱 요청
   - OpenAI API 사용 (기존 parse_pdf_with_ai.py 활용)
   - 프롬프트: 보유계약 현황 표를 JSON으로 변환
   ↓
9. Python API: 파싱 결과를 DB 저장
   - customers 컬렉션의 annual_reports 필드에 추가
   ↓
10. 프론트엔드:
   - WebSocket 또는 폴링으로 파싱 완료 감지
   - 고객 상세 페이지 → 계약 탭 업데이트
```

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

#### 1. Annual Report 판단 API
```
POST /api/annual-report/check
Request:
{
  "file_id": "ObjectId",
  "customer_id": "ObjectId"  // 사용자가 선택한 고객
}

Response:
{
  "is_annual_report": true,
  "confidence": 0.95
}
```

#### 2. Annual Report 파싱 API
```
POST /api/annual-report/parse
Request:
{
  "file_id": "ObjectId",
  "customer_id": "ObjectId"
}

Response:
{
  "success": true,
  "data": {
    "issue_date": "2025-08-27",
    "contracts": [...],
    "total_monthly_premium": 14102137,
    "total_contracts": 10
  }
}
```

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
- `tools/annual_report/parse_pdf_with_ai.py` 참고
- OpenAI GPT-4.1 Responses API 사용

### 프롬프트 개선 방향
```python
{
  "role": "system",
  "content": """
  당신은 보험 Annual Report PDF 파서입니다.

  1. 첫 페이지에서 고객명과 발행기준일을 추출하세요.
  2. "주요 보장내용 현황 (요약)" 이전 페이지까지 찾으세요.
  3. "보유계약 현황" 표를 JSON으로 변환하세요.

  JSON Schema:
  {
    "customer_name": "안영미",
    "issue_date": "2025-08-27",
    "contracts": [
      {
        "순번": 1,
        "증권번호": "0004164025",
        "보험상품": "무배당 마스터플랜 변액유니버셜종신Ⅱ보험",
        "계약자": "김보성",
        "피보험자": "안영미",
        "계약일": "2009-06-28",
        "계약상태": "정상",
        "가입금액": 3000,
        "보험기간": "종신",
        "납입기간": "80세",
        "보험료": 81750
      }
    ]
  }

  반드시 순수 JSON만 반환하세요.
  """
}
```

---

## 📌 추가 고려사항

### 1. 고객 식별 (동명이인 처리)
- **해결책**: 업로드 시 사용자가 고객을 직접 선택
- UI에서 드롭다운 또는 검색으로 고객 선택 제공

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

- 기존 코드: `tools/annual_report/parse_pdf_with_ai.py`
- 샘플 PDF: `tools/annual_report/안영미annual report202508_p2p3.pdf`
- OpenAI Responses API 문서

---

**작성일**: 2025-10-15
**최종 수정**: 2025-10-15
