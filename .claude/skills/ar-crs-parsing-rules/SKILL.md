---
name: ar-crs-parsing-rules
description: AR/CRS 문서 판단 규칙 (절대 금지). pdfParser, Annual Report, Customer Review, 문서 감지 작업 시 자동 사용. 파일명으로 AR/CRS 판단 절대 금지!
---

# AR/CRS PDF 문서 판단 규칙 (SUPREME RULE)

> **자동 트리거**: AR, CRS, Annual Report, Customer Review, pdfParser, 문서 감지, document detection, 파일 타입 판단
> **적용**: AR/CRS 관련 코드 수정, 문서 분류 로직 작업 시 자동 적용

---

## 🔴🔴🔴 절대 불변의 법칙 (NEVER EVER VIOLATE) 🔴🔴🔴

### AR/CRS 문서 유형 판단은 **반드시 PDF 텍스트 파싱**으로만!

| 절대 금지 ❌ | 반드시 준수 ✅ |
|-------------|---------------|
| 파일명 패턴으로 판단 | PDF 텍스트 추출 후 키워드 파싱 |
| `file.name.match()` 로 AR/CRS 판단 | `checkAnnualReportFromPDF()` 결과 사용 |
| 파일명에서 고객명 추출 | PDF 내용에서 고객명 파싱 |
| `_AR_`, `_CRS_` 패턴 매칭 | `is_annual_report`, `is_customer_review` 플래그 |

---

## 왜 파일명 판단이 **절대 금지**인가?

1. **파일명은 사용자가 임의로 변경 가능** - 신뢰할 수 없는 데이터
2. **OS 자동 변환** - 중복 파일 시 `(2)`, `(3)` 추가 → 패턴 매칭 실패
3. **원본 파일명 형식 다양** - MetLife: `AR20260121_00038235_...` (패턴 불일치)
4. **내용과 파일명 불일치 가능** - AR 파일을 `test.pdf`로 저장할 수 있음

---

## 올바른 AR/CRS 감지 로직

### 프론트엔드 (PDF.js)
```typescript
// ✅ 올바른 방법: PDF 텍스트 파싱
const result = await checkAnnualReportFromPDF(file)
if (result.is_annual_report) {
  // AR로 처리 (customer_name이 없어도 AR은 AR!)
}

// ❌ 금지된 방법: 파일명 패턴 매칭
const fnMatch = file.name.match(/^(.+?)_AR_/)  // 절대 금지!
```

### 백엔드 (Python)
```python
# ✅ 올바른 방법: PDF 텍스트 파싱
from detector import detect_annual_report
result = detect_annual_report(pdf_text)

# ❌ 금지된 방법
if "_AR_" in filename:  # 절대 금지!
```

---

## 주요 파일 위치

| 용도 | 경로 |
|------|------|
| 프론트 AR/CRS 감지 | `frontend/aims-uix3/src/features/customer/utils/pdfParser.ts` |
| 백엔드 AR 감지 | `backend/api/annual_report_api/services/detector.py` |
| 파이프라인 AR 처리 | `backend/api/document_pipeline/routers/doc_prep_main.py` |

---

## 코드 리뷰 체크리스트

AR/CRS 관련 코드 수정 시 반드시 확인:

- [ ] `file.name`, `filename` 변수로 문서 타입을 판단하는 코드 없음
- [ ] `.match()`, `.includes()` 로 `_AR_`, `_CRS_` 패턴 검사 안함
- [ ] 문서 타입은 오직 `is_annual_report`, `is_customer_review` 플래그로 판단
- [ ] 고객명 추출도 PDF 파싱 결과 사용 (파일명에서 추출 X)

---

## 과거 버그 사례 (2026-02-05)

### 버그 원인
```typescript
// pdfParser.ts - 삭제된 코드
const fnMatch = file.name.match(/^(.+?)_AR_(\d{4}-\d{2}-\d{2})\.pdf$/i);
if (fnMatch) {
  metadata.customer_name = fnMatch[1];  // ← 파일명으로 고객명 덮어씀!
}
```

### 결과
- MetLife 원본 파일명 (`AR20260121_00038235_...`) 패턴 불일치
- 6개 AR 파일 중 0개 등록됨
- PDF 파싱으로 정상 감지된 AR이 파일명 검증에서 탈락

### 교훈
**PDF 파싱 결과가 유일한 진실의 원천(Source of Truth)**

---

## 위반 시 결과

**⚔️ 이 규칙 위반 시 참수형에 처한다.**

파일명으로 AR/CRS를 판단하는 코드를 작성하면:
1. 특정 파일명 형식에서만 동작 → 범용성 상실
2. 원본 파일명(MetLife 등)에서 버그 발생
3. 사용자 파일 등록 실패 → UX 최악

---

## 참조

- CLAUDE.md 규칙 0-2: "AR/CRS 문서 인식 원칙 (파일명 판단 절대 금지)"
- Git 커밋: `e15407a3` (버그 도입) → 수정 커밋: (2026-02-05)
