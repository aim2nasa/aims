# Annual Report 통합 테스트 시나리오

Annual Report 기능의 전체 플로우를 검증하기 위한 테스트 시나리오입니다.

---

## 📋 목차

- [테스트 환경 준비](#테스트-환경-준비)
- [시나리오 1: 수동 API 호출 테스트](#시나리오-1-수동-api-호출-테스트)
- [시나리오 2: 자동 파싱 테스트](#시나리오-2-자동-파싱-테스트)
- [시나리오 3: 프론트엔드 UI 테스트](#시나리오-3-프론트엔드-ui-테스트)
- [시나리오 4: 에러 처리 테스트](#시나리오-4-에러-처리-테스트)
- [시나리오 5: 성능 테스트](#시나리오-5-성능-테스트)

---

## 🔧 테스트 환경 준비

### 필수 서비스 실행

```bash
# 1. MongoDB (포트 27017)
systemctl status mongod

# 2. Python FastAPI (포트 8004)
cd backend/api/annual_report_api
python main.py

# 3. Node.js API (포트 3010)
cd backend/api/aims_api
npm start

# 4. 프론트엔드 (포트 3005)
cd frontend/aims-uix3
npm run dev
```

### 테스트 데이터 준비

1. **샘플 PDF 파일**: `samples/pdf/annual_report_sample.pdf`
2. **테스트 고객**: MongoDB에 테스트 고객 생성

```javascript
// MongoDB 쿼리
db.customers.insertOne({
  "personal_info": {
    "name": "테스트고객",
    "birth_date": "1980-01-01"
  },
  "insurance_info": {
    "customer_type": "개인"
  },
  "annual_reports": []
});
```

---

## 시나리오 1: 수동 API 호출 테스트

### 목적
Python FastAPI와 Node.js 프록시가 정상 동작하는지 확인

### 전제조건
- Python FastAPI 서버 실행 중 (포트 8004)
- Node.js API 서버 실행 중 (포트 3010)
- MongoDB 실행 중
- OPENAI_API_KEY 환경 변수 설정됨

### 테스트 단계

#### Step 1: Python FastAPI 직접 호출

```bash
# 1-1. Health Check
curl http://localhost:8004/health

# 예상 결과:
{
  "status": "healthy",
  "mongodb": "connected",
  "openai": "configured"
}
```

#### Step 2: 파일 업로드 (MongoDB에 직접 추가)

```bash
# 실제 AIMS 프론트엔드에서 파일 업로드하거나
# 테스트를 위해 MongoDB에 직접 추가

# 샘플 데이터
db.files.insertOne({
  "filename": "annual_report_test.pdf",
  "contentType": "application/pdf",
  "length": 1024000,
  "uploadDate": new Date(),
  "upload": {
    "destPath": "/data/uploads/annual_report_test.pdf",
    "originalName": "annual_report_test.pdf"
  },
  "payload": {
    "customer_id": "ObjectId('...')"
  }
});
```

#### Step 3: Node.js 프록시로 파싱 요청

```bash
# 파싱 요청
curl -X POST http://tars.giize.com:3010/api/annual-report/parse \
  -H "Content-Type: application/json" \
  -d '{
    "file_path": "/data/uploads/annual_report_test.pdf",
    "file_id": "507f1f77bcf86cd799439011",
    "customer_id": "507f191e810c19729de860ea"
  }'

# 예상 결과 (즉시 응답):
{
  "message": "Annual Report 파싱을 시작했습니다.",
  "file_id": "507f1f77bcf86cd799439011",
  "status_url": "/api/annual-report/status/507f1f77bcf86cd799439011"
}
```

#### Step 4: 상태 확인 (25초 후)

```bash
# 상태 조회
curl http://tars.giize.com:3010/api/annual-report/status/507f1f77bcf86cd799439011

# 예상 결과:
{
  "status": "completed",
  "file_id": "507f1f77bcf86cd799439011",
  "result": {
    "issue_date": "2024-12-01",
    "customer_name": "홍길동",
    "total_monthly_premium": 150000,
    "total_coverage": 500000000,
    "contract_count": 3,
    "contracts": [ /* ... */ ]
  }
}
```

#### Step 5: Annual Report 조회

```bash
# 최신 Annual Report 조회
curl http://tars.giize.com:3010/api/customers/507f191e810c19729de860ea/annual-reports/latest

# 예상 결과:
{
  "success": true,
  "customer_id": "507f191e810c19729de860ea",
  "report": {
    "report_id": "...",
    "issue_date": "2024-12-01",
    "customer_name": "홍길동",
    "total_monthly_premium": 150000,
    "total_coverage": 500000000,
    "contract_count": 3,
    "contracts": [ /* ... */ ]
  }
}
```

### 검증 포인트

- ✅ 파싱 요청이 즉시 응답 반환 (< 1초)
- ✅ 백그라운드 파싱 완료 (15~45초)
- ✅ MongoDB에 annual_reports 배열 추가됨
- ✅ 계약 정보가 정확히 파싱됨
- ✅ 금액이 올바른 형식으로 저장됨

---

## 시나리오 2: 자동 파싱 테스트

### 목적
자동 파싱 스크립트가 신규 파일을 감지하고 처리하는지 확인

### 전제조건
- Python 자동 파싱 스크립트 실행 중
- MongoDB 실행 중
- 샘플 PDF 파일 준비됨

### 테스트 단계

#### Step 1: 자동 파싱 스크립트 실행

```bash
cd backend/api/annual_report_api

# Watch 모드로 실행 (30초마다 체크)
python auto_parse_annual_reports.py --watch

# 또는 한 번 실행
python auto_parse_annual_reports.py --hours 1
```

#### Step 2: 신규 파일 추가

```bash
# AIMS 프론트엔드에서 PDF 업로드
# 또는 MongoDB에 직접 추가 (위 Step 2 참고)
```

#### Step 3: 자동 처리 확인

```bash
# 스크립트 로그 확인
tail -f logs/auto_parse.log

# 예상 로그:
================================================================================
📄 처리 시작: annual_report_test.pdf (ID: 507f1f77bcf86cd799439011)
================================================================================
✓ 파일 경로: /data/uploads/annual_report_test.pdf
✓ 고객 ID: 507f191e810c19729de860ea

🔍 Step 1: Annual Report 판단 중...
✅ Annual Report 확인!
   신뢰도: 1.00
   발견된 키워드: ['Annual Review Report', '보유계약 현황', '메트라이프생명']

🔍 Step 2: 계약 테이블 종료 페이지 탐지 중...
✅ 계약 테이블 종료: 5페이지

🤖 Step 3: OpenAI로 파싱 중...
   (약 25초 소요 예상...)
✅ 파싱 완료! 3개 계약 추출됨

💾 Step 4: MongoDB 저장 중...
✅ 저장 완료!

✅ 처리 완료: annual_report_test.pdf
```

#### Step 4: MongoDB 확인

```javascript
// 처리 이력 확인
db.annual_report_processing.find({
  file_id: "507f1f77bcf86cd799439011"
});

// 예상 결과:
{
  "file_id": "507f1f77bcf86cd799439011",
  "status": "completed",
  "started_at": ISODate("2025-01-15T10:30:00Z"),
  "completed_at": ISODate("2025-01-15T10:30:25Z"),
  "result": { /* 파싱 결과 */ }
}

// 고객 데이터 확인
db.customers.findOne(
  { _id: ObjectId("507f191e810c19729de860ea") },
  { annual_reports: 1 }
);

// 예상 결과:
{
  "_id": ObjectId("507f191e810c19729de860ea"),
  "annual_reports": [
    {
      "report_id": ObjectId("..."),
      "issue_date": "2024-12-01",
      "customer_name": "홍길동",
      "total_monthly_premium": 150000,
      "total_coverage": 500000000,
      "contract_count": 3,
      "contracts": [ /* ... */ ]
    }
  ]
}
```

### 검증 포인트

- ✅ 스크립트가 신규 파일을 자동 감지
- ✅ Annual Report 여부 정확히 판단
- ✅ Annual Report가 아닌 파일은 건너뜀
- ✅ 중복 처리 방지 (이미 처리된 파일은 건너뜀)
- ✅ MongoDB에 정상 저장

---

## 시나리오 3: 프론트엔드 UI 테스트

### 목적
사용자가 프론트엔드에서 Annual Report를 조회할 수 있는지 확인

### 전제조건
- 프론트엔드 실행 중 (포트 3005)
- 테스트 고객에 Annual Report 데이터 존재

### 테스트 단계

#### Step 1: 고객 목록 페이지

1. 브라우저에서 `http://localhost:3005` 접속
2. **고객 관리** 탭 클릭
3. 테스트 고객 선택

**예상 결과:**
- 고객 목록이 정상 표시됨
- 고객 카드를 클릭하면 상세 페이지로 이동

#### Step 2: 고객 상세 페이지

1. 고객 상세 페이지 열림
2. 탭 목록 확인
   - 기본정보
   - 문서
   - 관계
   - 상담이력
   - **Annual Report** ← 새 탭

**예상 결과:**
- **Annual Report** 탭이 표시됨
- 탭 아이콘이 문서 모양

#### Step 3: Annual Report 탭

1. **Annual Report** 탭 클릭
2. 로딩 상태 확인 (스피너 표시)
3. 데이터 로드 후 Summary 표시

**예상 결과:**
```
최신 Annual Report

발행일         2024년 12월 01일

┌─────────────────────────────────────────────┐
│ 총 월 보험료      총 보장금액      계약 건수  │
│ 150,000원       500,000,000원     3건        │
└─────────────────────────────────────────────┘

[📊 상세 보기] [🔄 새로고침]

계약 미리보기
┌─────────────────────────────────────────────┐
│ 메트라이프생명                      [유지]    │
│ 슈퍼리치연금보험                              │
│ 월 50,000원 · 보장 200,000,000원             │
└─────────────────────────────────────────────┘
(외 2건 더...)
```

#### Step 4: Annual Report 모달

1. **상세 보기** 버튼 클릭
2. 모달 열림
3. 전체 계약 목록 표시

**예상 결과:**
```
┌──────────────────────────────────────────────────────┐
│ 📊 테스트고객님의 Annual Report              [✕]     │
├──────────────────────────────────────────────────────┤
│                                                       │
│ 발행일: 2024년 12월 01일                              │
│ 총 월 보험료: 150,000원                               │
│ 총 보장금액: 500,000,000원                            │
│ 계약 건수: 3건                                        │
│                                                       │
│ 보험 계약 목록 (3건)                                  │
│                                                       │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 메트라이프생명                          [유지]   │ │
│ │ 슈퍼리치연금보험                                  │ │
│ │ 계약번호: 1234567890                              │ │
│ │                                                   │ │
│ │ 월 보험료        보장금액                         │ │
│ │ 50,000원        200,000,000원                     │ │
│ │                                                   │ │
│ │ 계약일: 2020년 03월 15일                          │ │
│ │ 만기일: 2045년 03월 15일                          │ │
│ └─────────────────────────────────────────────────┘ │
│ (추가 계약 2건...)                                    │
│                                                       │
│ 생성일: 2025-01-15 10:30:00                           │
└──────────────────────────────────────────────────────┘
```

#### Step 5: 빈 상태 테스트

1. Annual Report가 없는 고객 선택
2. **Annual Report** 탭 클릭

**예상 결과:**
```
┌─────────────────────────────────────┐
│          📄                          │
│                                      │
│  Annual Report가 없습니다            │
│                                      │
│  Annual Report PDF를 업로드하면      │
│  자동으로 파싱되어 여기에 표시됩니다 │
│                                      │
│  💡 Annual Report는 보험 계약        │
│     현황을 요약한 문서입니다          │
└─────────────────────────────────────┘
```

### 검증 포인트

- ✅ Annual Report 탭이 정상 표시됨
- ✅ 최신 Annual Report가 자동 로드됨
- ✅ Summary 정보가 정확히 표시됨
- ✅ 금액이 한글 포맷으로 표시됨 (예: "150,000원")
- ✅ 날짜가 한글 포맷으로 표시됨 (예: "2024년 12월 01일")
- ✅ 상세 보기 모달이 정상 동작
- ✅ 빈 상태가 적절히 표시됨
- ✅ 애플 디자인 시스템 준수 (subtle, progressive disclosure)

---

## 시나리오 4: 에러 처리 테스트

### 목적
다양한 에러 상황에서 시스템이 안정적으로 동작하는지 확인

### 테스트 케이스

#### Case 1: Annual Report가 아닌 파일

```bash
# 일반 PDF 파일로 테스트
curl -X POST http://tars.giize.com:3010/api/annual-report/parse \
  -H "Content-Type: application/json" \
  -d '{
    "file_path": "/data/uploads/normal_document.pdf",
    "file_id": "507f1f77bcf86cd799439012"
  }'

# 예상 결과:
{
  "message": "Annual Report 파싱을 시작했습니다.",
  ...
}

# 상태 조회 (25초 후):
{
  "status": "not_annual_report",
  "message": "Annual Report가 아닙니다."
}
```

**검증**:
- ✅ 에러 없이 처리됨
- ✅ `not_annual_report` 상태로 기록됨
- ✅ MongoDB에 저장되지 않음

#### Case 2: 파일 경로 오류

```bash
curl -X POST http://tars.giize.com:3010/api/annual-report/parse \
  -H "Content-Type: application/json" \
  -d '{
    "file_path": "/invalid/path/file.pdf",
    "file_id": "507f1f77bcf86cd799439013"
  }'

# 예상 결과:
{
  "status": "failed",
  "error": "파일이 존재하지 않습니다: /invalid/path/file.pdf"
}
```

**검증**:
- ✅ 명확한 에러 메시지 반환
- ✅ 서버가 크래시하지 않음

#### Case 3: OpenAI API 키 없음

```bash
# OPENAI_API_KEY 환경 변수 제거 후
unset OPENAI_API_KEY
python main.py

# Health Check
curl http://localhost:8004/health

# 예상 결과:
{
  "status": "healthy",
  "mongodb": "connected",
  "openai": "not_configured"
}
```

**검증**:
- ✅ Health Check에서 경고 표시
- ✅ 파싱 요청 시 명확한 에러 메시지

#### Case 4: MongoDB 연결 끊김

```bash
# MongoDB 중지
sudo systemctl stop mongod

# 파싱 요청
curl -X POST http://tars.giize.com:3010/api/annual-report/parse ...

# 예상 결과:
{
  "success": false,
  "error": "MongoDB 연결 실패"
}
```

**검증**:
- ✅ 적절한 에러 메시지
- ✅ 서버가 크래시하지 않음

#### Case 5: Python FastAPI 서버 다운

```bash
# Python FastAPI 서버 중지
# (Ctrl+C)

# Node.js 프록시로 요청
curl -X POST http://tars.giize.com:3010/api/annual-report/parse ...

# 예상 결과:
{
  "success": false,
  "message": "Annual Report API 서버에 연결할 수 없습니다.",
  "error": "Python FastAPI 서버가 실행 중이 아닙니다. (포트 8004)",
  "hint": "cd backend/api/annual_report_api && python main.py"
}
```

**검증**:
- ✅ 명확한 에러 메시지와 해결 방법 제공
- ✅ Node.js 서버가 크래시하지 않음

---

## 시나리오 5: 성능 테스트

### 목적
시스템이 성능 요구사항을 충족하는지 확인

### 테스트 케이스

#### Case 1: 파싱 시간 측정

```bash
# 10개 파일을 순차적으로 파싱하여 시간 측정
cd tools/annual_report
python benchmark_parser.py

# 예상 결과:
================================
Annual Report 파싱 성능 테스트
================================
샘플 파일: 4개
OpenAI 모델: gpt-4.1

처리 중...
[1/4] 파일 1: 15.83초 ✓
[2/4] 파일 2: 22.45초 ✓
[3/4] 파일 3: 25.91초 ✓
[4/4] 파일 4: 42.63초 ✓

================================
결과 요약
================================
평균 시간: 25.34초
최소 시간: 15.83초
최대 시간: 42.63초
성공률: 100% (4/4)
```

**검증**:
- ✅ 평균 파싱 시간 < 30초
- ✅ 최대 파싱 시간 < 60초
- ✅ 성공률 100%

#### Case 2: 동시 요청 처리

```bash
# 5개 파일을 동시에 파싱 요청
for i in {1..5}; do
  curl -X POST http://tars.giize.com:3010/api/annual-report/parse \
    -H "Content-Type: application/json" \
    -d "{
      \"file_path\": \"/data/uploads/file_$i.pdf\",
      \"file_id\": \"file_$i\"
    }" &
done
wait
```

**검증**:
- ✅ 모든 요청이 즉시 응답 받음 (< 1초)
- ✅ 백그라운드에서 순차적으로 처리됨
- ✅ 메모리 누수 없음
- ✅ 서버 안정성 유지

#### Case 3: 자동 파싱 스크립트 안정성

```bash
# Watch 모드로 24시간 실행
python auto_parse_annual_reports.py --watch

# 1시간마다 테스트 파일 추가
```

**검증**:
- ✅ 24시간 동안 안정적으로 실행
- ✅ 메모리 누수 없음
- ✅ 모든 파일 정상 처리
- ✅ 로그 파일 크기 < 100MB

---

## ✅ 테스트 체크리스트

### 기능 테스트
- [ ] API 엔드포인트 모두 정상 동작
- [ ] 파싱 결과가 정확함
- [ ] MongoDB에 올바르게 저장됨
- [ ] 프론트엔드 UI가 정상 표시됨
- [ ] 모달이 정상 동작함

### 에러 처리
- [ ] Annual Report가 아닌 파일 처리
- [ ] 파일 경로 오류 처리
- [ ] API 키 누락 처리
- [ ] MongoDB 연결 오류 처리
- [ ] Python 서버 다운 처리

### 성능
- [ ] 평균 파싱 시간 < 30초
- [ ] 최대 파싱 시간 < 60초
- [ ] 동시 요청 처리 가능
- [ ] 24시간 안정성

### 보안
- [ ] API 키가 로그에 노출되지 않음
- [ ] 파일 경로 검증
- [ ] SQL Injection 방어
- [ ] XSS 방어 (프론트엔드)

---

**작성일**: 2025-10-16
**버전**: 1.0.0
**작성자**: Claude Code + rossi
