# CR (Customer Review Service) 파서 구현 보고서

## 개요

메트라이프 변액보험 Customer Review Service PDF를 pdfplumber 테이블 기반으로 파싱하는 일반화된 파서 구현.

- **구현일**: 2025-01-17
- **목표**: 하드코딩 없이 100% 정확도 달성
- **결과**: 5개 샘플 전체 통과 ✅

---

## 기존 문제점 (cr_parser.py)

| 문제 | 위치 | 내용 |
|------|------|------|
| 펀드명 하드코딩 | 26-34행 | `FUND_GROUPS`에 31개 펀드명 고정 |
| 열 위치 고정 | 274-275행 | `basic_col = 2 + (fund_offset * 2)` |
| 구성비율 오류 | 258-259행 | "적립금 구성비율" vs "현재투입비율 구성비율" 미구분 |

**결과 예시:**
- 채권형 구성비율: 원본 24.6% → 파서 **100.0%** ❌
- 미국주식형 구성비율: 원본 70.9% → 파서 **100.0%** ❌

---

## 새 파서 아키텍처

### 파일 구조

```
backend/api/annual_report_api/
├── cr_table_extractor.py          # [신규] 일반화된 펀드 테이블 추출
├── test_cr_table_extractor.py     # [신규] 검증 테스트
└── services/
    ├── cr_parser.py               # [기존] 계약정보/납입원금 추출 (유지)
    └── cr_parser_table.py         # [신규] 통합 파서
```

### 핵심 함수

#### 1. `build_fund_column_map(header_row, prev_row)`
펀드명과 열 인덱스를 동적으로 매핑 (하드코딩 제거)

```python
# 입력: 헤더 행 (기본납입/추가납입)
['', '', '기본납입', '추가납입', '기본납입', '추가납입', ...]

# 출력: {펀드명: {"basic": col_idx, "additional": col_idx}}
{
    "가치주식형": {"basic": 2, "additional": 3},
    "성장주식형": {"basic": 4, "additional": 5},
    ...
}
```

#### 2. `identify_row_type(row)`
행 유형 판별 - 핵심 개선점

```python
# 테이블 행 예시
['적립금', '금액', ...]                    → 'amount'
['', '구성비율', ...]                      → 'accumulated_ratio' ✅
['', '수익률', ...]                        → 'return'
['기본납입\n현재투입비율', '추가납입\n구성비율', ...] → 'current_ratio' (무시) ✅
['투입원금', '금액', ...]                   → 'principal'
```

#### 3. `is_fund_header_row(row)`
펀드 헤더 행 판별 - 오탐지 방지

```python
# 실제 헤더 (감지해야 함)
['', '', '기본납입', '추가납입', '기본납입', '추가납입', ...]
# → 열 인덱스 2 이상에서 '기본납입' 2개 이상

# 오탐지 대상 (무시해야 함)
['기본납입\n현재투입비율', '추가납입\n구성비율', '0.0', ...]
# → '현재투입비율' 포함 시 False 반환
```

---

## 추출 데이터 형식

### contract_info (계약정보) - 10개 필드

| 필드명 | 설명 | 타입 |
|--------|------|------|
| `policy_number` | 증권번호 | string |
| `contract_date` | 계약일자 (YYYY-MM-DD) | string |
| `insured_amount` | 보험가입금액 | int |
| `accumulated_amount` | 적립금 | int |
| `investment_return_rate` | 투자수익률 (%) | float |
| `surrender_value` | 해지환급금 | int |
| `surrender_rate` | 해지환급율 (%) | float |
| `accumulation_rate` | 적립금비율 (%) | float |
| `initial_premium` | 초회납입보험료 | int |
| `monthly_premium` | 월납보험료 | int |

### premium_info (납입원금) - 6개 필드

| 필드명 | 설명 | 타입 |
|--------|------|------|
| `basic_premium` | 기본보험료(A) | int |
| `additional_premium` | 수시추가납(B) | int |
| `regular_additional` | 정기추가납(C) | int |
| `withdrawal` | 중도출금(D) | int |
| `net_premium` | 계(A+B+C-D) | int |
| `policy_loan` | 약관대출 | int |

### fund_allocations (펀드 구성) - 펀드당 9개 필드

| 필드명 | 설명 | 타입 |
|--------|------|------|
| `fund_name` | 펀드명 | string |
| `basic_accumulated` | 기본적립금 | int |
| `additional_accumulated` | 추가적립금 | int |
| `allocation_ratio` | 구성비율 (%) | float |
| `additional_allocation_ratio` | 추가구성비율 (%) | float |
| `return_rate` | 수익률 (%) | float |
| `additional_return_rate` | 추가수익률 (%) | float |
| `invested_principal` | 투입원금 | int |
| `additional_invested_principal` | 추가투입원금 | int |

---

## 검증 결과

### 테스트 샘플

| 고객명 | 증권번호 | 펀드 수 | 총적립금 |
|--------|----------|--------|---------|
| 고영자 | 0011423761 | 2개 | 19,336,631원 |
| 변수현 | 0011348919 | 3개 | 23,302,427원 |
| 정지호 | 0011375656 | 3개 | 38,405,005원 |
| 한진구 | 0011409925 | 1개 | 62,246,158원 |
| 한진구 | 0011409939 | 1개 | 55,025,572원 |

### 구성비율 정확도 (핵심 개선)

| 파일 | 펀드 | 기존 파서 | 새 파서 |
|------|------|----------|--------|
| 고영자CRS | 채권형 | 100.0% ❌ | **24.6%** ✅ |
| 고영자CRS | 성장주식형 | 100.0% ❌ | **75.4%** ✅ |
| 변수현CRS | 미국주식형 | 100.0% ❌ | **70.9%** ✅ |
| 변수현CRS | 글로벌주식형 | 100.0% ❌ | **8.4%** ✅ |
| 변수현CRS | 배당주식형 | 100.0% ❌ | **20.6%** ✅ |

### 구성비율 합계 검증

모든 샘플에서 펀드 구성비율 합계 = **100%**

```
고영자: 75.4% + 24.6% = 100.0% ✅
변수현: 70.9% + 8.4% + 20.6% = 99.9% ✅ (반올림)
정지호: 69.2% + 10.6% + 20.2% = 100.0% ✅
한진구 (0925): 100.0% ✅ (단일 펀드)
한진구 (0939): 100.0% ✅ (단일 펀드)
```

---

## 사용 방법

### API 호출

```python
from services.cr_parser_table import parse_customer_review_table

result = parse_customer_review_table("/path/to/customer_review.pdf")
```

### 테스트 실행

```bash
cd ~/aims/backend/api/annual_report_api
source venv/bin/activate
python test_cr_table_extractor.py
```

예상 출력:
```
============================================================
CR Table Extractor 검증 테스트
============================================================
✅ 고영자CRS_0011423761_202509.pdf
✅ 변수현CRS_0011348919_202509.pdf
✅ 정지호CRS_0011375656_202509.pdf
✅ 한진구CRS_0011409925_202509.pdf
✅ 한진구CRS_0011409939_202509.pdf

총 테스트: 5개
통과: 5개 (100.0%)
🎉 모든 테스트 통과!
```

---

## 성공 기준 달성

| 기준 | 상태 |
|------|------|
| 하드코딩 제거 (`FUND_GROUPS` 미사용) | ✅ |
| 동적 헤더 매핑 (펀드명 자동 추출) | ✅ |
| 구성비율 정확도 (적립금 구성비율 값 사용) | ✅ |
| 5개 샘플 100% 정확도 | ✅ |

---

## 참조

- AR 일반화 파서: `table_extractor.py`
- AR 파서 문서: `docs/ANNUAL_REPORT_PARSER.md`
- 샘플 위치: `samples/MetlifeReport/CustomerReviewService/`
