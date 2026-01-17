# AIMS MCP 도구 검증 보고서

> **검증일**: 2026-01-18
> **목적**: MCP 서버의 46개 도구 중 실제 동작하지 않는 도구 식별 및 필터링

---

## 1. 검증 배경

MCP 서버가 제공하는 일부 도구들이 실제 데이터 구조와 맞지 않아 의미없는 결과를 반환하는 문제가 발견됨.

### 핵심 문제
- **`contracts` 컬렉션이 존재하지 않음** (DB에 없음)
- 계약 데이터는 `customers.annual_reports[].contracts`에만 저장됨
- 일부 도구들이 존재하지 않는 `contracts` 컬렉션을 직접 조회

### MongoDB 컬렉션 현황

| 컬렉션 | 문서 수 | 비고 |
|--------|---------|------|
| `customers` | 다수 | `annual_reports` 배열 포함 |
| `files` | 38 | 문서 파일 |
| `insurance_products` | 402 | 보험 상품 |
| `customer_memos` | 20 | 고객 메모 |
| `faqs` | 17 | FAQ |
| `usage_guides` | 9 | 사용 가이드 |
| `notices` | 1 | 공지사항 |
| `customer_relationships` | 0 | 관계 (비어있음) |
| `contracts` | **존재하지 않음** | DB에 없음 |

---

## 2. 검증 전 전체 도구 목록 (46개)

### 2.1 고객 관리 (7개)
| # | 도구명 | 설명 | 데이터 소스 |
|---|--------|------|-------------|
| 1 | `search_customers` | 고객 검색 | `customers` |
| 2 | `get_customer` | 고객 상세 조회 | `customers` |
| 3 | `create_customer` | 고객 등록 | `customers` |
| 4 | `update_customer` | 고객 수정 | `customers` |
| 5 | `restore_customer` | 삭제된 고객 복구 | `customers` |
| 6 | `list_deleted_customers` | 삭제된 고객 목록 | `customers` |
| 7 | `check_customer_name` | 고객명 중복 확인 | `customers` |

### 2.2 계약 관리 (4개)
| # | 도구명 | 설명 | 데이터 소스 |
|---|--------|------|-------------|
| 8 | `list_contracts` | 계약 목록 조회 | `customers.annual_reports` |
| 9 | `get_contract_details` | 계약 상세 조회 | `customers.annual_reports` |
| 10 | `find_birthday_customers` | 생일 고객 조회 | `customers` |
| 11 | `find_expiring_contracts` | 만기 예정 계약 | `contracts` (**없음**) |

### 2.3 문서 관리 (8개)
| # | 도구명 | 설명 | 데이터 소스 |
|---|--------|------|-------------|
| 12 | `search_documents` | 문서 검색 | `files` + RAG API |
| 13 | `get_document` | 문서 상세 조회 | `files` |
| 14 | `list_customer_documents` | 고객 문서 목록 | `files` |
| 15 | `delete_document` | 단일 문서 삭제 | `files` |
| 16 | `delete_documents` | 다중 문서 삭제 | `files` |
| 17 | `link_document_to_customer` | 문서-고객 연결 | `files`, `customers` |
| 18 | `find_document_by_filename` | 파일명으로 검색 | `files` |
| 19 | `search_documents_semantic` | 시맨틱/키워드 검색 | RAG API |

### 2.4 인사이트 분석 (3개)
| # | 도구명 | 설명 | 데이터 소스 |
|---|--------|------|-------------|
| 20 | `analyze_customer_value` | 고객 가치 분석 | `contracts` (**없음**) |
| 21 | `find_coverage_gaps` | 보장 공백 분석 | `contracts` (**없음**) |
| 22 | `suggest_next_action` | 다음 액션 추천 | `contracts` (**없음**), `customers` |

### 2.5 연차보고서 (4개)
| # | 도구명 | 설명 | 데이터 소스 |
|---|--------|------|-------------|
| 23 | `get_annual_reports` | AR 목록 조회 | `customers.annual_reports` |
| 24 | `get_ar_parsing_status` | 파싱 상태 확인 | `ar_parse_queue` |
| 25 | `trigger_ar_parsing` | 파싱 요청 | `ar_parse_queue` |
| 26 | `get_ar_queue_status` | 파싱 큐 상태 | `ar_parse_queue` |

### 2.6 Customer Review (1개)
| # | 도구명 | 설명 | 데이터 소스 |
|---|--------|------|-------------|
| 27 | `get_customer_reviews` | 메트라이프 고객리뷰 조회 | `customers.customer_reviews` |

### 2.7 관계 네트워크 (4개)
| # | 도구명 | 설명 | 데이터 소스 |
|---|--------|------|-------------|
| 28 | `create_relationship` | 관계 생성 | `customer_relationships` |
| 29 | `delete_relationship` | 관계 삭제 | `customer_relationships` |
| 30 | `list_relationships` | 관계 목록 | `customer_relationships` |
| 31 | `get_customer_network` | 관계 시각화 | `customer_relationships` |

### 2.8 상품 정보 (2개)
| # | 도구명 | 설명 | 데이터 소스 |
|---|--------|------|-------------|
| 32 | `search_products` | 상품 검색 | `insurance_products` |
| 33 | `get_product_details` | 상품 상세 | `insurance_products` |

### 2.9 메모 관리 (3개)
| # | 도구명 | 설명 | 데이터 소스 |
|---|--------|------|-------------|
| 34 | `add_customer_memo` | 메모 추가 | `customers.memo` |
| 35 | `list_customer_memos` | 메모 조회 | `customers.memo` |
| 36 | `delete_customer_memo` | 메모 삭제 | `customers.memo` |

### 2.10 시스템/유틸리티 (5개)
| # | 도구명 | 설명 | 데이터 소스 |
|---|--------|------|-------------|
| 37 | `get_storage_info` | 저장소 용량 조회 | `files`, `users` |
| 38 | `list_notices` | 공지사항 | `notices` |
| 39 | `list_faqs` | FAQ | `faqs` |
| 40 | `list_usage_guides` | 사용 가이드 | `usage_guides` |
| 41 | `search_address` | 주소 검색 | 외부 API (행안부) |

### 2.11 통합 검색 (1개)
| # | 도구명 | 설명 | 데이터 소스 |
|---|--------|------|-------------|
| 42 | `unified_search` | 문서+고객+계약 통합 검색 | 복합 |

### 2.12 검색 분석 (3개)
| # | 도구명 | 설명 | 데이터 소스 |
|---|--------|------|-------------|
| 43 | `get_search_analytics` | 검색 품질 통계 | RAG API |
| 44 | `get_failed_queries` | 실패 쿼리 조회 | RAG API |
| 45 | `submit_search_feedback` | 검색 피드백 제출 | RAG API |

### 2.13 통계 (1개)
| # | 도구명 | 설명 | 데이터 소스 |
|---|--------|------|-------------|
| 46 | `get_statistics` | 고객/계약 통계 | `customers`, `contracts` (**없음**) |

---

## 3. 검증 결과: 문제가 있는 도구

### 3.1 완전히 동작하지 않는 도구 (삭제 대상)

| 도구명 | 문제점 | 삭제 이유 |
|--------|--------|-----------|
| `find_expiring_contracts` | `contracts` 컬렉션 조회 | **DB에 `contracts` 컬렉션이 존재하지 않음.** `expiring.ts`가 `COLLECTIONS.CONTRACTS`를 직접 쿼리하지만 해당 컬렉션이 없어 항상 빈 결과 반환. 만기일 계산을 위한 `contract_date`, `payment_period` 필드도 없음. |

### 3.2 부분적으로 동작하지 않는 도구 (수정 또는 삭제 대상)

| 도구명 | 문제점 | 상세 |
|--------|--------|------|
| `analyze_customer_value` | 계약 기반 점수 계산 불가 | `contracts` 컬렉션에서 계약 수, 보험료를 조회하여 가치 점수를 계산하지만, 컬렉션이 없어 **계약 관련 점수가 항상 0**. 관계망, 고객기간 점수만 계산됨. |
| `find_coverage_gaps` | 현재 보장 분석 불가 | `contracts` 컬렉션에서 활성 계약을 조회하여 보장 유형을 분석하지만, 컬렉션이 없어 **현재 보장이 항상 없음으로 분석**됨. 모든 카테고리가 "공백"으로 표시. |
| `suggest_next_action` | 계약 만기 액션 불가 | 계약 만기 임박 체크를 위해 `contracts` 컬렉션 조회. 컬렉션이 없어 **"계약갱신" 액션이 항상 0건**. 생일, 미접촉 고객 추천은 정상 동작. |
| `get_statistics` | 계약 통계 불가 | `summary`, `contract_count` 유형에서 `contracts` 컬렉션 조회. **계약 관련 통계가 항상 0**. 고객 통계는 정상 동작. |

---

## 4. 검증 후 유효한 도구 목록

### 4.1 삭제된 도구 (1개)

| 도구명 | 삭제 이유 |
|--------|-----------|
| `find_expiring_contracts` | `contracts` 컬렉션이 존재하지 않아 100% 무의미한 결과 반환 |

### 4.2 수정이 필요한 도구 (4개)

| 도구명 | 현재 상태 | 권장 조치 |
|--------|-----------|-----------|
| `analyze_customer_value` | 계약 점수 0 | `customers.annual_reports`에서 계약 정보 조회하도록 수정 |
| `find_coverage_gaps` | 모든 보장 공백 | `customers.annual_reports`에서 계약 정보 조회하도록 수정 |
| `suggest_next_action` | 계약갱신 0건 | `customers.annual_reports`에서 만기 정보 조회하도록 수정, 또는 해당 기능 제거 |
| `get_statistics` | 계약통계 0 | `customers.annual_reports`에서 계약 통계 집계하도록 수정 |

### 4.3 정상 동작 도구 (41개)

#### 고객 관리 (7개) - 모두 정상
- `search_customers`, `get_customer`, `create_customer`, `update_customer`
- `restore_customer`, `list_deleted_customers`, `check_customer_name`

#### 계약 관리 (3개) - 정상
- `list_contracts` - `customers.annual_reports`에서 조회 (올바르게 구현됨)
- `get_contract_details` - `customers.annual_reports`에서 조회 (올바르게 구현됨)
- `find_birthday_customers` - `customers` 컬렉션에서 조회

#### 문서 관리 (8개) - 모두 정상
- `search_documents`, `get_document`, `list_customer_documents`
- `delete_document`, `delete_documents`, `link_document_to_customer`
- `find_document_by_filename`, `search_documents_semantic`

#### 연차보고서 (4개) - 모두 정상
- `get_annual_reports`, `get_ar_parsing_status`
- `trigger_ar_parsing`, `get_ar_queue_status`

#### Customer Review (1개) - 정상
- `get_customer_reviews`

#### 관계 네트워크 (4개) - 정상 (데이터 없어도 동작)
- `create_relationship`, `delete_relationship`
- `list_relationships`, `get_customer_network`

#### 상품 정보 (2개) - 모두 정상
- `search_products`, `get_product_details`

#### 메모 관리 (3개) - 모두 정상
- `add_customer_memo`, `list_customer_memos`, `delete_customer_memo`

#### 시스템/유틸리티 (5개) - 모두 정상
- `get_storage_info`, `list_notices`, `list_faqs`
- `list_usage_guides`, `search_address`

#### 통합 검색 (1개) - 정상
- `unified_search`

#### 검색 분석 (3개) - 모두 정상
- `get_search_analytics`, `get_failed_queries`, `submit_search_feedback`

---

## 5. 권장 조치

### 즉시 조치
1. **`find_expiring_contracts` 도구 비활성화 또는 삭제**
   - 현재 상태로는 사용자에게 혼란만 줌

### 중기 조치 (수정 필요)
2. **인사이트 도구들 데이터 소스 변경**
   - `analyze_customer_value`, `find_coverage_gaps`, `suggest_next_action`
   - `contracts` 컬렉션 대신 `customers.annual_reports[].contracts` 사용하도록 수정

3. **통계 도구 데이터 소스 변경**
   - `get_statistics`의 계약 관련 통계를 `customers.annual_reports`에서 집계

### 장기 고려사항
4. **데이터 구조 정규화 검토**
   - 별도 `contracts` 컬렉션 생성 여부 검토
   - 또는 모든 도구를 `customers.annual_reports` 기반으로 통일

---

## 6. 최종 유효 도구 수

| 분류 | 변경 전 | 변경 후 | 비고 |
|------|---------|---------|------|
| 완전 삭제 | - | 1개 | `find_expiring_contracts` |
| 수정 필요 | - | 4개 | 인사이트 3개 + 통계 1개 |
| 정상 동작 | 46개 | **41개** | |
| **총계** | **46개** | **45개** (수정 후 정상화 시) | |

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-01-18 | 초기 검증 보고서 작성 |
