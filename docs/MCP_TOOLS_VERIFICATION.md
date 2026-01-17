# AIMS MCP 도구 검증 보고서

> **검증일**: 2026-01-18
> **최종 업데이트**: 2026-01-18 (도구 정리 및 수정 완료)
> **목적**: MCP 서버의 46개 도구 중 실제 동작하지 않는 도구 식별 및 정리

---

## 1. 검증 배경

MCP 서버가 제공하는 일부 도구들이 실제 데이터 구조와 맞지 않아 의미없는 결과를 반환하는 문제가 발견됨.

### 핵심 문제
1. **`contracts` 컬렉션이 존재하지 않음** (DB에 없음)
   - 계약 데이터는 `customers.annual_reports[].contracts`에만 저장됨
   - 일부 도구들이 존재하지 않는 `contracts` 컬렉션을 직접 조회

2. **`insurance_products` 필드명 불일치**
   - 코드: `product_name`, `insurer_name`, `survey_date` (snake_case)
   - DB: `productName`, `insurer_id`, `surveyDate` (camelCase)

---

## 2. 조치 결과

### 2.1 삭제된 도구 (6개) 🗑️

| 도구명 | 삭제 이유 | 파일 |
|--------|-----------|------|
| `find_expiring_contracts` | `contracts` 컬렉션 미존재 | `expiring.ts` 삭제 |
| `analyze_customer_value` | `contracts` 컬렉션 미존재, 불필요 | `insights.ts` 삭제 |
| `find_coverage_gaps` | `contracts` 컬렉션 미존재, 불필요 | `insights.ts` 삭제 |
| `suggest_next_action` | `contracts` 컬렉션 미존재, 불필요 | `insights.ts` 삭제 |
| `get_statistics` | `contracts` 컬렉션 미존재, 불필요 | `statistics.ts` 삭제 |
| `get_product_details` | 상세 정보 없음, 불필요 | `products.ts`에서 제거 |

### 2.2 수정된 도구 (2개) 🔧

| 도구명 | 수정 내용 | 파일 |
|--------|----------|------|
| `unified_search` | `searchContracts()` → `customers.annual_reports` 기반으로 변경 | `unified_search.ts` |
| `search_products` | 필드명 camelCase로 수정 + `insurers` 컬렉션 JOIN | `products.ts` |

### 2.3 정상 동작 도구 (39개) ✅

#### 고객 관리 (7개)
- `search_customers`, `get_customer`, `create_customer`, `update_customer`
- `restore_customer`, `list_deleted_customers`, `check_customer_name`

#### 계약 관리 (3개)
- `list_contracts` - `customers.annual_reports`에서 조회
- `get_contract_details` - `customers.annual_reports`에서 조회
- `find_birthday_customers` - `customers` 컬렉션에서 조회

#### 문서 관리 (8개)
- `search_documents`, `get_document`, `list_customer_documents`
- `delete_document`, `delete_documents`, `link_document_to_customer`
- `find_document_by_filename`, `search_documents_semantic`

#### 연차보고서 (4개)
- `get_annual_reports`, `get_ar_parsing_status`
- `trigger_ar_parsing`, `get_ar_queue_status`

#### Customer Review (1개)
- `get_customer_reviews`

#### 관계 네트워크 (4개)
- `create_relationship`, `delete_relationship`
- `list_relationships`, `get_customer_network`

#### 상품 정보 (1개)
- `search_products` ✅ 수정 완료 (insurers JOIN 추가)

#### 메모 관리 (3개)
- `add_customer_memo`, `list_customer_memos`, `delete_customer_memo`

#### 시스템/유틸리티 (5개)
- `get_storage_info`, `list_notices`, `list_faqs`
- `list_usage_guides`, `search_address`

#### 통합 검색 (1개)
- `unified_search` ✅ 수정 완료 (annual_reports 기반)

#### 검색 분석 (3개)
- `get_search_analytics`, `get_failed_queries`, `submit_search_feedback`

---

## 3. 최종 도구 현황

| 분류 | 개수 | 비고 |
|------|------|------|
| 삭제 | 6개 | 불필요하거나 동작 불가 |
| 수정 | 2개 | `unified_search`, `search_products` |
| 정상 | 37개 | 기존 정상 동작 |
| **총계** | **39개** | 46개 → 39개 (7개 감소) |

---

## 4. 변경된 파일 목록

### 삭제된 파일
- `backend/api/aims_mcp/src/tools/expiring.ts`
- `backend/api/aims_mcp/src/tools/insights.ts`
- `backend/api/aims_mcp/src/tools/statistics.ts`

### 수정된 파일
- `backend/api/aims_mcp/src/tools/index.ts` - import/handler 정리
- `backend/api/aims_mcp/src/tools/products.ts` - `search_products` 수정, `get_product_details` 제거
- `backend/api/aims_mcp/src/tools/unified_search.ts` - `searchContracts()` 수정

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-01-18 | 초기 검증 보고서 작성 |
| 2026-01-18 | `find_expiring_contracts` 도구 삭제 |
| 2026-01-18 | 실제 API 시뮬레이션 테스트 - 7개 추가 문제 도구 발견 |
| 2026-01-18 | 최종 정리: 6개 도구 삭제, 2개 도구 수정 완료 |
