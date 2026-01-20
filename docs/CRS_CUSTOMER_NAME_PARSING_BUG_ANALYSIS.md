# CRS 고객명 파싱 버그 분석

**작성일**: 2026-01-21
**상태**: 해결됨 (코드 수정 완료)

---

## 문제 현상

CRS(Customer Review Service) PDF 파싱 시 **법인명이 잘리는 버그** 발생

| PDF 원본 | 파싱 결과 | 예상 결과 |
|----------|----------|----------|
| 참씨큐리티 | 참씨큐리 | 참씨큐리티 |

---

## 근본 원인

### 정규식 글자 수 제한 (`{2,4}`)

**백엔드** - `backend/api/annual_report_api/services/cr_detector.py:199`
```python
# 기존 코드 (버그)
contractor_pattern = r"계약자\s*[:\s]+([가-힣]{2,4})"
#                                        ^^^^^^
#                                        2~4글자만 매칭
```

**프론트엔드** - `frontend/aims-uix3/src/features/customer/utils/pdfParser.ts:214`
```typescript
// 기존 코드 (버그)
const contractorPattern = /계약자\s*[:\s]+([가-힣]{2,4})/;
```

### 왜 4글자 제한이었나?

- 개인 이름 기준으로 설계 (한국인 이름 대부분 2~4글자)
- **법인명**(회사명)을 고려하지 않음
- 예: "참씨큐리티" = 5글자 → 4글자까지만 캡처 → "참씨큐리"

---

## 해결 방법

### PDF 첫 페이지 구조 분석

```
참씨큐리티 고객님을 위한
Customer Review Service

계약자 : 참씨큐리티
피보험자 : 은형석
```

**"XXX 고객님을 위한"** 패턴에서 고객명 추출이 더 정확함

### 수정된 코드

**백엔드** - `cr_detector.py`
```python
# 우선 패턴: "참씨큐리티 고객님을 위한" (글자 수 제한 없음)
customer_name_pattern = r"([가-힣]+)\s*고객님을\s*위한"
customer_name_match = re.search(customer_name_pattern, first_page_text)
if customer_name_match:
    result["contractor_name"] = customer_name_match.group(1).strip()
else:
    # fallback: "계약자 : XXX" 패턴 (글자 수 제한 없음)
    contractor_pattern = r"계약자\s*[:\s]+([가-힣]+)"
    contractor_match = re.search(contractor_pattern, first_page_text)
    if contractor_match:
        result["contractor_name"] = contractor_match.group(1).strip()
```

**프론트엔드** - `pdfParser.ts`
```typescript
// 우선 패턴: "참씨큐리티 고객님을 위한" (글자 수 제한 없음)
const customerNamePattern = /([가-힣]+)\s*고객님을\s*위한/;
const customerNameMatch = text.match(customerNamePattern);
if (customerNameMatch) {
  metadata.contractor_name = customerNameMatch[1].trim();
} else {
  // fallback: "계약자 : XXX" 패턴 (글자 수 제한 없음)
  const contractorPattern = /계약자\s*[:\s]+([가-힣]+)/;
  const contractorMatch = text.match(contractorPattern);
  if (contractorMatch) {
    metadata.contractor_name = contractorMatch[1].trim();
  }
}
```

---

## 검증 결과

### 테스트 데이터
- **AR**: 31건 - 100% 정상
- **CRS**: 24건 - 2건 불일치

### CRS 불일치 상세

| 고객명 (DB) | contractor_name | 원인 |
|-------------|-----------------|------|
| 참씨큐리티 | 참씨큐리 | 파싱 버그 (수정 전 업로드) |
| 김현지 | 변수현 | 잘못된 고객 매핑 (테스트 데이터) |

---

## 커밋 정보

```
1d2c1fec fix(cr_detector): CRS 고객명 파싱 시 글자 수 제한 제거

- 기존: 정규식 {2,4}로 최대 4글자까지만 추출 → 법인명 잘림 버그
- 수정: "XXX 고객님을 위한" 패턴 우선 사용 (글자 수 제한 없음)
- fallback으로 "계약자 :" 패턴도 글자 수 제한 제거
- 예: "참씨큐리티"(5글자) 정상 추출 가능
```

**수정 파일**:
- `backend/api/annual_report_api/services/cr_detector.py`
- `frontend/aims-uix3/src/features/customer/utils/pdfParser.ts`

---

## 재발 방지

### 교훈

1. **하드코딩 금지**: 글자 수 제한 같은 arbitrary limit 피할 것
2. **법인명 고려**: 개인명(2~4자)뿐 아니라 법인명(다양한 길이) 고려
3. **더 정확한 패턴 사용**: "고객님을 위한" 앞 텍스트가 가장 신뢰할 수 있는 고객명

### 유사 코드 점검 필요

| 파일 | 라인 | 패턴 | 상태 |
|------|------|------|------|
| `cr_detector.py` | 212 | 피보험자 `{2,4}` | 검토 필요 |
| `detector.py` | 156, 162 | 고객명 `{2,4}` | 검토 필요 |
| `pdfParser.ts` | 229 | 피보험자 `{2,4}` | 검토 필요 |

---

## 후속 조치

- [ ] 기존 DB 데이터 수정 (`참씨큐리` → `참씨큐리티`)
- [ ] 유사한 글자 수 제한 패턴 전체 점검 및 수정
- [ ] 브라우저 캐시 문제로 인한 미반영 케이스 대응 방안 마련
