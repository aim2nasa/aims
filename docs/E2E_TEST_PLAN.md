# AIMS E2E 자동화 테스트 계획

> **상태**: 계획 수립 중
> **최종 수정**: 2026-02-07
> **목표**: AIMS의 모든 UI 기능을 완전 자동화 테스트하여, 수동 검증 없이 기능 무결성을 보장

---

## 1. 개요

### 1.1 동기
AIMS 코드 리팩토링/배포 후 기능 깨짐을 자동으로 감지하고 싶다. 현재는 수동으로 UI를 조작하여 확인하는데, 이를 완전 자동화하여 사람의 개입을 제거한다.

### 1.2 범위
- 테스트 사용자/고객 생성
- AR/CRS 포함 테스트 문서 생성 및 업로드
- AIMS의 **모든 기능** 테스트 (조회, 등록, 수정, 삭제, 검색 등)
- 테스트 데이터 완전 정리 (DB에서 완전 삭제)

### 1.3 도구 선택

| 도구 | 용도 | 이유 |
|------|------|------|
| **Playwright** | 브라우저 자동화 | Headless 지원, 크로스 브라우저, 파일 업로드 지원 |
| **ar_generator (Node.js)** | AR PDF 생성 | 기존 도구 활용 (CLI + 프로그래매틱 API) |
| **ar_generator_py (Python)** | AR PDF 생성 (GUI) | PDF 파싱/미리보기 포함, exe 패키징 가능 |

---

## 2. 기존 AR/CRS 생성기 도구 분석

### 2.1 ar_generator (Node.js) - `tools/ar_generator/`

**아키텍처**: TypeScript + pdf-lib + Commander CLI

| 파일 | 역할 |
|------|------|
| `src/index.ts` | CLI 진입점 (generate, batch, test, list, interactive) |
| `src/generator.ts` | PDF 생성 핵심 로직 (pdf-lib 기반) |
| `src/templates.ts` | 프리셋/샘플 데이터/랜덤 생성 |
| `src/test-runner.ts` | AR Check API 자동 테스트 |
| `src/types.ts` | TypeScript 타입 정의 |

**프리셋 종류**:
| 프리셋 | 설명 | 계약 수 |
|--------|------|---------|
| `basic` | 기본 | 3-5개 |
| `single` | 단일 계약 | 1개 |
| `many` | 다수 계약 | 10-15개 |
| `with_lapsed` | 실효 포함 | 정상 3 + 실효 2 |
| `all_lapsed` | 모두 실효 | 4개 |
| `mixed_status` | 상태 혼합 | 정상 2 + 만기 1 + 실효 1 + 해지 1 |
| `empty` | 계약 없음 | 0개 |

**CLI 사용법**:
```bash
cd tools/ar_generator

# 단일 생성
npm run generate -- --preset basic --customer "홍길동"
npm run generate -- --hong  # 홍길동 고객 템플릿

# 배치 생성
npm run batch -- --count 10 --scenario mixed

# AR 파싱 API 테스트
npm run test:ar -- --api-url http://100.110.215.65:8004
```

**프로그래매틱 사용 (E2E 테스트에서 활용)**:
```typescript
import { generateARPdf, saveARPdf } from './src/generator.js';
import { generateFromPreset } from './src/templates.js';

const options = generateFromPreset('basic', { customerName: '테스트고객' });
const pdfBytes = await generateARPdf(options);
// → Playwright에서 파일 업로드에 사용
```

**AR 감지 키워드 삽입 방식**:
- 표지 우측 상단에 `"Annual Review Report"` 텍스트를 6pt 연한 회색으로 배치
- 이 키워드가 PDF 텍스트 추출 시 감지되어 AR로 인식됨

### 2.2 ar_generator_py (Python) - `tools/ar_generator_py/`

**아키텍처**: Python + reportlab + tkinter GUI + PyMuPDF

| 파일 | 역할 |
|------|------|
| `ar_generator.py` | 메인 (GUI + PDF 생성 + PDF 파싱) |
| `build.bat` | exe 패키징 (pyinstaller) |

**주요 기능**:
- **GUI 앱**: tkinter 기반, 계약 편집/추가/삭제, PDF 미리보기
- **PDF 불러오기**: 실제 메트라이프 AR PDF를 파싱하여 계약 데이터 추출
- **PDF 생성**: reportlab으로 MetLife 형식 PDF 생성
- **프리셋**: basic, single, many, hong(홍길동), empty

**PDF 파싱 기능** (`parse_pdf` 메서드):
- 1페이지: 고객명, 발행일, FSR 이름 추출 (정규식)
- 2페이지+: 테이블에서 계약 데이터 추출 (PyMuPDF `find_tables()`)
- 총 월보험료 텍스트 패턴 매칭

### 2.3 E2E 테스트에서의 활용 계획

E2E 테스트에서는 **ar_generator (Node.js)**를 사용한다:
- Playwright와 동일 Node.js 생태계
- 프로그래매틱 API로 테스트 코드에서 직접 PDF 생성
- CLI 없이 `generateARPdf()` 함수 직접 호출

---

## 3. AR/CRS 문서 감지 키워드 분석

### 3.1 AR (Annual Report) 감지

**감지 위치**: `backend/api/document_pipeline/routers/doc_prep_main.py` → `_detect_and_process_annual_report()`

| 구분 | 키워드 | 필수 여부 |
|------|--------|-----------|
| 필수 | `"Annual Review Report"` | 필수 (이 키워드가 있어야 AR로 인식) |
| 보조 | `"보유계약 현황"` | 선택 (신뢰도 향상) |
| 보조 | `"MetLife"` / `"메트라이프"` / `"메트라이프생명"` | 선택 |

**감지 흐름**:
```
1. PDF 업로드 → doc_prep_main.py
2. PDF 텍스트 추출 (PyPDF2/pdfplumber)
3. "Annual Review Report" 키워드 검색
4. 발견 → ar_parsing_status: "pending" 설정
5. annual_report_api 스캐너가 "pending" 문서 발견
6. pdfplumber로 테이블 파싱 → 계약 정보 추출
7. customers.annual_reports에 저장
8. ar_parsing_status: "completed"
```

### 3.2 CRS (Customer Review Service) 감지

| 구분 | 키워드 | 필수 여부 |
|------|--------|-----------|
| 필수 | `"Customer Review Service"` | 필수 |
| 보조 | `"변액"` / `"적립금"` / `"투자수익률"` / `"펀드"` | 선택 |

### 3.3 테스트 PDF 생성 시 필수 조건
- `"Annual Review Report"` 문자열이 PDF 텍스트 추출 시 반드시 포함되어야 함
- 단순 이미지가 아닌, **텍스트 레이어**로 삽입 필수
- ar_generator는 이미 이 조건을 충족함 (6pt 연한 회색 텍스트로 삽입)

---

## 4. AIMS 전체 기능 인벤토리

### 4.1 고객 관리

| # | 기능 | API 엔드포인트 | 테스트 시나리오 |
|---|------|---------------|----------------|
| 1 | 고객 목록 조회 | `GET /api/customers` | 페이지네이션, 정렬, 필터 |
| 2 | 고객 상세 조회 | `GET /api/customers/:id` | 개인/법인 고객 |
| 3 | 고객 등록 (개인) | `POST /api/customers` | 이름, 유형, 생년월일, 연락처 |
| 4 | 고객 등록 (법인) | `POST /api/customers` | 법인명, 사업자번호 |
| 5 | 고객 수정 | `PATCH /api/customers/:id` | 이름 변경, 연락처 변경 |
| 6 | 고객 삭제 (개발자 모드) | `DELETE /api/customers/:id` | Hard Delete 확인 |
| 7 | 고객 휴면 설정/해제 | `PATCH /api/customers/:id` | status: active ↔ inactive |
| 8 | 고객 검색 | `GET /api/customers?search=` | 이름 검색, 초성 검색 |
| 9 | 고객명 중복 검사 | `GET /api/customers/check-name` | 동일 설계사 내 중복 |
| 10 | 고객 타입 필터 | `GET /api/customers?type=` | 개인/법인/전체 |

### 4.2 계약 관리

| # | 기능 | API 엔드포인트 | 테스트 시나리오 |
|---|------|---------------|----------------|
| 11 | 계약 목록 조회 | `GET /api/contracts` | 고객별 계약 |
| 12 | 계약 등록 | `POST /api/contracts` | 증권번호, 상품명, 상태 |
| 13 | 계약 수정 | `PATCH /api/contracts/:id` | 상태 변경, 보험료 수정 |
| 14 | 계약 삭제 | `DELETE /api/contracts/:id` | Cascading: 고객 역참조 정리 |
| 15 | 계약 벌크 삭제 | `DELETE /api/contracts` | 여러 계약 동시 삭제 |
| 16 | 보험상품 조회 | `GET /api/products` | 상품 목록, 보험사별 |

### 4.3 문서 관리

| # | 기능 | API 엔드포인트 | 테스트 시나리오 |
|---|------|---------------|----------------|
| 17 | 문서 업로드 | `POST /upload` (document_pipeline:8100) | PDF, 이미지 |
| 18 | 문서 목록 조회 | `GET /api/customers/:id/documents` | 고객별 문서 |
| 19 | 문서 상세 조회 | `GET /api/documents/:id` | 상태, 메타데이터 |
| 20 | 문서 삭제 | `DELETE /api/documents/:id` | 파일 + DB 정리 |
| 21 | 문서 다운로드 | `GET /api/documents/:id/download` | 원본 파일 |
| 22 | 문서-고객 연결 | `PATCH /api/documents/:id` | customer_id 설정 |
| 23 | 문서 진행률 | SSE | 업로드 → 처리 → 임베딩 |
| 24 | AR 문서 업로드 | `POST /upload` | AR 자동 감지 + 파싱 |
| 25 | CRS 문서 업로드 | `POST /upload` | CRS 자동 감지 + 파싱 |

### 4.4 AR/CRS 파싱

| # | 기능 | 테스트 시나리오 |
|---|------|----------------|
| 26 | AR 자동 감지 | PDF 업로드 → ar_parsing_status: "pending" |
| 27 | AR 테이블 파싱 | 계약 정보 추출 → customers.annual_reports 저장 |
| 28 | AR 탭 표시 | 고객 상세 → AR 탭에 파싱된 계약 표시 |
| 29 | CRS 자동 감지 | CRS PDF → customer_reviews 저장 |
| 30 | AR 자가복구 | completed 상태인데 결과 없으면 → pending 복구 |

### 4.5 고객 관계

| # | 기능 | API 엔드포인트 | 테스트 시나리오 |
|---|------|---------------|----------------|
| 31 | 관계 등록 | `POST /api/relationships` | 배우자, 자녀, 부모 |
| 32 | 관계 조회 | `GET /api/relationships?customer_id=` | 양방향 조회 |
| 33 | 관계 삭제 | `DELETE /api/relationships/:id` | 양방향 삭제 |

### 4.6 엑셀 일괄 등록

| # | 기능 | 테스트 시나리오 |
|---|------|----------------|
| 34 | 엑셀 업로드 | 고객/계약 일괄 등록 |
| 35 | 유효성 검사 | 필수 필드, 중복 체크 |
| 36 | 결과 확인 | 성공/실패 건수, 오류 메시지 |

### 4.7 AI 어시스턴트 (MCP)

| # | 기능 | 테스트 시나리오 |
|---|------|----------------|
| 37 | 채팅 기본 | 메시지 전송 및 응답 |
| 38 | 고객 조회 도구 | "홍길동 고객 정보 알려줘" |
| 39 | 고객 등록 도구 | "김테스트 고객 등록해줘" |
| 40 | 문서 검색 도구 | "최근 업로드된 문서" |
| 41 | 데이터 변경 후 새로고침 | AI가 데이터 변경 → 화면 갱신 |

### 4.8 검색

| # | 기능 | 테스트 시나리오 |
|---|------|----------------|
| 42 | 통합 검색 | 고객명, 계약번호 |
| 43 | 초성 검색 | "ㅎㄱㄷ" → "홍길동" |
| 44 | RAG 문서 검색 | 임베딩 기반 의미 검색 |

### 4.9 관리자 기능 (aims-admin)

| # | 기능 | 테스트 시나리오 |
|---|------|----------------|
| 45 | 실시간 모니터링 | CPU/메모리/디스크 |
| 46 | 에러 로그 조회 | SSE 스트림 |
| 47 | 크레딧 관리 | 잔여 크레딧 조회 |
| 48 | 사용자 관리 | 사용자 목록, 권한 |

### 4.10 인증/보안

| # | 기능 | 테스트 시나리오 |
|---|------|----------------|
| 49 | 로그인 | ID/PW 인증 |
| 50 | 로그아웃 | 세션 종료 |
| 51 | 인증 만료 | 토큰 만료 시 재로그인 유도 |
| 52 | 개발자 모드 | DevMode 토글 → 삭제 버튼 표시 |

---

## 5. 테스트 아키텍처 설계

### 5.1 디렉토리 구조 (안)

```
tests/
├── e2e/
│   ├── playwright.config.ts      # Playwright 설정
│   ├── global-setup.ts           # 전역 설정 (테스트 사용자 생성)
│   ├── global-teardown.ts        # 전역 정리 (테스트 데이터 삭제)
│   ├── fixtures/
│   │   ├── test-data.ts          # 테스트 데이터 팩토리
│   │   ├── ar-generator.ts       # AR PDF 생성 헬퍼
│   │   └── auth.ts               # 인증 헬퍼
│   ├── pages/                    # Page Object Model
│   │   ├── login.page.ts
│   │   ├── customers.page.ts
│   │   ├── customer-detail.page.ts
│   │   ├── documents.page.ts
│   │   ├── contracts.page.ts
│   │   ├── chat.page.ts
│   │   └── admin.page.ts
│   ├── specs/                    # 테스트 스펙
│   │   ├── 01-auth.spec.ts
│   │   ├── 02-customer-crud.spec.ts
│   │   ├── 03-contract-crud.spec.ts
│   │   ├── 04-document-upload.spec.ts
│   │   ├── 05-ar-crs-parsing.spec.ts
│   │   ├── 06-relationships.spec.ts
│   │   ├── 07-excel-import.spec.ts
│   │   ├── 08-search.spec.ts
│   │   ├── 09-ai-assistant.spec.ts
│   │   ├── 10-admin.spec.ts
│   │   └── 99-cleanup.spec.ts
│   └── utils/
│       ├── api-client.ts         # API 직접 호출 유틸
│       ├── db-helper.ts          # MongoDB 직접 접근 (정리용)
│       └── wait-helpers.ts       # 비동기 대기 유틸
```

### 5.2 테스트 실행 흐름

```
Phase 0: Setup
├── 테스트 전용 사용자 생성 (API 직접 호출)
├── AR/CRS 테스트 PDF 생성 (ar_generator)
└── 일반 테스트 PDF 생성

Phase 1: 인증 (01-auth)
├── 로그인
├── 세션 유지 확인
└── 개발자 모드 활성화

Phase 2: 고객 CRUD (02-customer-crud)
├── 개인 고객 3명 등록
├── 법인 고객 1명 등록
├── 고객명 중복 검사
├── 고객 수정
├── 고객 검색 (이름, 초성)
├── 고객 휴면 설정/해제
└── 고객 타입 필터

Phase 3: 계약 CRUD (03-contract-crud)
├── 계약 등록 (각 고객에 2-3개)
├── 계약 수정
├── 계약 삭제 → 고객 역참조 정리 확인
└── 계약 벌크 삭제

Phase 4: 문서 업로드 (04-document-upload)
├── 일반 PDF 업로드
├── 이미지 파일 업로드
├── 업로드 진행률 확인 (SSE)
├── 문서-고객 연결
├── 문서 다운로드
└── 문서 삭제

Phase 5: AR/CRS 파싱 (05-ar-crs-parsing)
├── AR PDF 업로드 (ar_generator로 생성)
├── AR 자동 감지 확인 (ar_parsing_status: "pending")
├── AR 파싱 완료 대기 (polling)
├── AR 탭에 계약 정보 표시 확인
├── CRS PDF 업로드
└── CRS 파싱 결과 확인

Phase 6: 고객 관계 (06-relationships)
├── 관계 등록 (배우자, 자녀)
├── 양방향 관계 표시 확인
└── 관계 삭제

Phase 7: 엑셀 일괄 등록 (07-excel-import)
├── 엑셀 파일 업로드
├── 유효성 검사 결과 확인
└── 등록 결과 확인

Phase 8: 검색 (08-search)
├── 고객명 검색
├── 초성 검색
└── RAG 문서 검색

Phase 9: AI 어시스턴트 (09-ai-assistant)
├── 채팅 메시지 전송
├── 도구 호출 결과 확인
└── 데이터 변경 후 새로고침 확인

Phase 10: 관리자 (10-admin)
├── 실시간 모니터링 확인
├── 에러 로그 스트림
└── 크레딧 조회

Phase 99: Cleanup
├── 테스트 고객 전체 삭제 (Cascading)
├── 테스트 문서 삭제
├── 테스트 사용자 삭제
└── DB 고아 데이터 정리
```

### 5.3 테스트 데이터 전략

```typescript
// 테스트 데이터 접두사 (테스트 데이터 식별용)
const TEST_PREFIX = '__E2E_TEST__';

// 테스트 고객
const testCustomers = [
  { name: `${TEST_PREFIX}개인_홍길동`, type: 'personal' },
  { name: `${TEST_PREFIX}개인_김철수`, type: 'personal' },
  { name: `${TEST_PREFIX}개인_이영희`, type: 'personal' },
  { name: `${TEST_PREFIX}법인_테스트`, type: 'corporate' },
];

// Cleanup: TEST_PREFIX로 시작하는 모든 데이터 삭제
// MongoDB 쿼리: { 'personal_info.name': { $regex: /^__E2E_TEST__/ } }
```

### 5.4 AR PDF 생성 통합

```typescript
// E2E 테스트에서 AR PDF 생성
import { generateARPdf } from '../../tools/ar_generator/src/generator.js';
import { generateFromPreset, generateCustomAR } from '../../tools/ar_generator/src/templates.js';

async function createTestARPdf(customerName: string): Promise<Buffer> {
  const options = generateCustomAR(customerName, [
    { 증권번호: '0013017050', 보험상품: '무배당 종신보험', 계약상태: '정상', '보험료(원)': 150000 },
    { 증권번호: '0013107410', 보험상품: '무배당 달러종신보험', 계약상태: '정상', '보험료(원)': 590050 },
  ]);
  const pdfBytes = await generateARPdf(options);
  return Buffer.from(pdfBytes);
}
```

---

## 6. CRS 생성기 (미구현 - 필요)

현재 `ar_generator`는 AR만 생성 가능하다. CRS 테스트를 위해 CRS PDF 생성기가 필요하다.

### 6.1 CRS PDF 필수 요소
- `"Customer Review Service"` 키워드 (텍스트 레이어)
- 변액보험 관련 테이블 (펀드 현황, 수익률 등)
- 고객명, 발행일

### 6.2 구현 계획
- `ar_generator`에 CRS 생성 기능 추가
- 별도 preset: `crs_basic`, `crs_multi_fund` 등
- `generateCRSPdf()` 함수 추가

---

## 7. 기술적 고려사항

### 7.1 비동기 처리 대기
AIMS 문서 처리는 비동기:
- 업로드 → 처리 큐 → 임베딩 (full_pipeline.py, 1분 크론)
- AR 감지 → AR 파싱 (annual_report_api 스캐너, 30초 간격)

**대기 전략**:
```typescript
// Polling with timeout
async function waitForDocumentStatus(docId: string, status: string, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const doc = await api.getDocument(docId);
    if (doc.overallStatus === status) return doc;
    await page.waitForTimeout(5000);  // 5초 간격 polling
  }
  throw new Error(`Timeout waiting for document ${docId} to reach status ${status}`);
}
```

### 7.2 테스트 격리
- 테스트 데이터에 `__E2E_TEST__` 접두사 사용
- 각 테스트 실행마다 고유 타임스탬프 추가
- Cleanup은 접두사 기반 bulk 삭제

### 7.3 CI/CD 통합 (향후)
- GitHub Actions에서 자동 실행
- Tailscale VPN 연결 필요 (백엔드 접근)
- 실패 시 스크린샷 + 비디오 저장

---

## 8. 우선순위 및 구현 로드맵

| 단계 | 내용 | 우선순위 |
|------|------|----------|
| **Phase 1** | Playwright 설정 + 로그인 + 고객 CRUD | 높음 |
| **Phase 2** | 문서 업로드 + AR 파싱 테스트 | 높음 |
| **Phase 3** | 계약 CRUD + Cascading Delete | 중간 |
| **Phase 4** | 검색 + 관계 + 엑셀 | 중간 |
| **Phase 5** | AI 어시스턴트 + 관리자 | 낮음 |
| **Phase 6** | CRS 생성기 + CRS 테스트 | 낮음 |
| **Phase 7** | CI/CD 통합 | 향후 |

---

## 9. 진행 기록

### 2026-02-07
- E2E 테스트 계획 문서 초안 작성
- AR 생성기 도구 분석 완료 (Node.js + Python)
- AIMS 전체 기능 인벤토리 작성 (52개 기능)
- AR/CRS 감지 키워드 분석 완료
- 테스트 아키텍처 설계 (Phase 0~99)
