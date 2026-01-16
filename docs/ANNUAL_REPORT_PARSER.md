# Annual Report Parser 개발 기록

## 개요
MetLife Annual Review Report PDF의 "보유계약 현황" 페이지를 파싱하는 파서 개발

## 목표
- 고정된 형식의 Annual Report에서 보유계약 현황 데이터 추출
- 5개 테스트 샘플에 대해 100% 정확한 파싱 검증
- 자동화된 유닛 테스트 구축
- aims-uix3와 통합 가능한 구조

---

## Phase 1: 계획 수립

### 1.1 테스트 샘플 목록
| # | 파일명 | 위치 |
|---|--------|------|
| 1 | `AR20260113_00038235_0003823520151027000003.pdf` | `D:\MetlifeReport\AnnualReport` |
| 2 | `김보성보유계약현황202508.pdf` | `D:\MetlifeReport\AnnualReport` |
| 3 | `신상철보유계약현황2025081.pdf` | `D:\MetlifeReport\AnnualReport` |
| 4 | `안영미annual report202508.pdf` | `D:\MetlifeReport\AnnualReport` |
| 5 | `정부균보유계약현황202508.pdf` | `D:\MetlifeReport\AnnualReport` |

### 1.2 파싱 대상 데이터 (2페이지: 보유계약 현황)
```
- 피보험자명
- 보유계약 건수
- 월 보험료 총액
- 계약 목록 테이블:
  - 순번, 증권번호, 보험상품, 계약자, 피보험자
  - 계약일, 계약상태, 가입금액(만원), 보험기간, 납입기간, 보험료(원)
- 부활가능 실효계약 (동일 구조)
```

### 1.3 출력 JSON 스키마
```typescript
interface AnnualReportSummary {
  insuredName: string;           // 피보험자명
  totalContracts: number;        // 보유계약 건수
  monthlyPremiumTotal: number;   // 월 보험료 총액
  contracts: Contract[];         // 보유계약 목록
  lapsedContracts: Contract[];   // 부활가능 실효계약
}

interface Contract {
  seq: number;                   // 순번
  policyNumber: string;          // 증권번호
  productName: string;           // 보험상품
  contractor: string;            // 계약자
  insured: string;               // 피보험자
  contractDate: string;          // 계약일 (YYYY-MM-DD)
  status: string;                // 계약상태
  coverageAmount: number;        // 가입금액 (만원)
  insurancePeriod: string;       // 보험기간
  paymentPeriod: string;         // 납입기간
  premium: number;               // 보험료 (원)
}
```

### 1.4 기술 스택 결정
- **PDF 텍스트 추출**: `pdfplumber` (Python) - 테이블 추출에 강력
- **파서 구현**: TypeScript - aims-uix3 통합 용이
- **테스트**: Vitest - aims-uix3 기존 테스트 프레임워크

### 1.5 작업 단계
| Phase | 작업 | 상태 |
|-------|------|------|
| 1 | 계획 수립 및 문서화 | ✅ 완료 |
| 2 | PDF 텍스트 추출 및 분석 | ⏳ 대기 |
| 3 | 파서 구현 | ⏳ 대기 |
| 4 | 테스트 데이터 생성 (AI 파싱) | ⏳ 대기 |
| 5 | 자동화 테스트 구현 | ⏳ 대기 |
| 6 | 검증 및 완료 | ⏳ 대기 |

---

## Phase 2: PDF 텍스트 추출 및 분석

### 2.1 작업 내용
- [ ] 5개 샘플 PDF의 2페이지 텍스트 추출
- [ ] 텍스트 패턴 분석
- [ ] 파싱 전략 수립

### 2.2 추출 결과
(진행 후 기록)

---

## Phase 3: 파서 구현

### 3.1 작업 내용
- [ ] TypeScript 파서 모듈 작성
- [ ] 정규표현식 패턴 정의
- [ ] 테이블 파싱 로직 구현

### 3.2 구현 위치
```
frontend/aims-uix3/src/shared/lib/annualReportParser.ts
```

---

## Phase 4: 테스트 데이터 생성

### 4.1 작업 내용
- [ ] AI가 각 PDF를 읽어 예상 파싱 결과 생성
- [ ] JSON 형태로 저장
- [ ] 수동 검증

### 4.2 테스트 데이터 위치
```
frontend/aims-uix3/src/shared/lib/__tests__/fixtures/
```

---

## Phase 5: 자동화 테스트 구현

### 5.1 작업 내용
- [ ] Vitest 테스트 파일 작성
- [ ] 5개 샘플 전체 테스트
- [ ] 필드별 정확도 검증

### 5.2 테스트 파일 위치
```
frontend/aims-uix3/src/shared/lib/__tests__/annualReportParser.test.ts
```

---

## Phase 6: 검증 및 완료

### 6.1 검증 체크리스트
- [ ] 5개 샘플 모두 파싱 성공
- [ ] 모든 필드 정확도 100%
- [ ] 자동화 테스트 통과
- [ ] aims-uix3 빌드 성공

---

## 커밋 이력

| 커밋 | 내용 | 일시 |
|------|------|------|
| #1 | Phase 1: 계획 문서 작성 | (예정) |
| #2 | Phase 2: PDF 텍스트 추출 | (예정) |
| #3 | Phase 3: 파서 구현 | (예정) |
| #4 | Phase 4: 테스트 데이터 생성 | (예정) |
| #5 | Phase 5: 자동화 테스트 | (예정) |
| #6 | Phase 6: 최종 검증 완료 | (예정) |

---

## 참고 자료
- 샘플 PDF 위치: `D:\MetlifeReport\AnnualReport`
- 관련 문서: [MCP_AI_ASSISTANT_INTEGRATION_VERIFICATION.md](./MCP_AI_ASSISTANT_INTEGRATION_VERIFICATION.md)
