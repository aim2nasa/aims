# AIMS MCP 확장 계획

> **문서 생성일**: 2025-12-23
> **목적**: aims-mcp 기능 확장 로드맵 및 진행 상황 추적

---

## 1. 현황 분석

### 1.1 현재 aims-mcp 도구 (38개) - Phase 5 완료

| 카테고리 | 도구 | 상태 |
|---------|------|------|
| 고객 관리 | `search_customers` | ✅ 구현 완료 |
| | `get_customer` | ✅ 구현 완료 |
| | `create_customer` | ✅ 구현 완료 |
| | `update_customer` | ✅ 구현 완료 |
| | `restore_customer` | ✅ Phase 1 추가 |
| | `list_deleted_customers` | ✅ Phase 1 추가 |
| 계약 관리 | `list_contracts` | ✅ 구현 완료 |
| | `get_contract_details` | ✅ 구현 완료 |
| 시간 기반 | `find_birthday_customers` | ✅ 구현 완료 |
| | `find_expiring_contracts` | ✅ 구현 완료 |
| 분석 | `get_statistics` | ✅ 구현 완료 |
| | `get_customer_network` | ✅ 구현 완료 |
| 문서 관리 | `search_documents` | ✅ 구현 완료 |
| | `get_document` | ✅ 구현 완료 |
| | `list_customer_documents` | ✅ 구현 완료 |
| | `delete_document` | ✅ Phase 1 추가 |
| | `delete_documents` | ✅ Phase 1 추가 |
| 메모 | `add_customer_memo` | ✅ 구현 완료 |
| | `list_customer_memos` | ✅ 구현 완료 |
| 상품 | `search_products` | ✅ 구현 완료 |
| | `get_product_details` | ✅ 구현 완료 |
| 관계 관리 | `create_relationship` | ✅ Phase 1 추가 |
| | `delete_relationship` | ✅ Phase 1 추가 |
| | `list_relationships` | ✅ Phase 1 추가 |
| Annual Report | `get_annual_reports` | ✅ Phase 2 추가 |
| | `get_ar_parsing_status` | ✅ Phase 2 추가 |
| | `trigger_ar_parsing` | ✅ Phase 2 추가 |
| | `get_ar_queue_status` | ✅ Phase 2 추가 |
| 인사이트 | `analyze_customer_value` | ✅ Phase 3 추가 |
| | `find_coverage_gaps` | ✅ Phase 3 추가 |
| | `suggest_next_action` | ✅ Phase 3 추가 |
| 유틸리티 | `get_storage_info` | ✅ Phase 4 추가 |
| | `check_customer_name` | ✅ Phase 4 추가 |
| | `list_notices` | ✅ Phase 4 추가 |
| | `list_faqs` | ✅ Phase 4 추가 |
| | `list_usage_guides` | ✅ Phase 4 추가 |
| RAG 검색 | `search_documents_semantic` | ✅ Phase 5 추가 |
| | `get_search_analytics` | ✅ Phase 5 추가 |
| | `get_failed_queries` | ✅ Phase 5 추가 |
| | `submit_search_feedback` | ✅ Phase 5 추가 |

### 1.2 문제점

1. **액션 부재**: "~해줘" 요청 처리 불가 (조회만 가능)
2. **인사이트 부재**: "~분석해줘" 요청 처리 제한적
3. **Annual Report 미연동**: 별도 API 존재하나 MCP 미노출

### 1.3 확장 방향 결정

**결정: aims-mcp 단일 서비스 확장** (새 서비스 분리 X)

이유:
- 새 MCP 서비스 분리 = 배포/관리 복잡성 증가
- 현재 15개 → 25개 수준은 단일 서비스로 충분
- aims_api에 구현된 API 래핑으로 빠른 구현 가능

---

## 2. 확장 로드맵

### Phase 1: 액션 도구 추가 (관계 관리 + 문서/고객 관리) ✅ 완료

| 도구 | 설명 | 유스케이스 | 상태 |
|------|------|-----------|------|
| `create_relationship` | 고객 간 관계 생성 | "홍길동 배우자 김영미 추가해줘" | ✅ 완료 |
| `delete_relationship` | 고객 간 관계 삭제 | "이 관계 삭제해줘" | ✅ 완료 |
| `list_relationships` | 고객 관계 목록 조회 | "이 고객의 관계 보여줘" | ✅ 완료 |
| `delete_document` | 문서 삭제 | "오래된 문서 삭제해줘" | ✅ 완료 |
| `delete_documents` | 복수 문서 삭제 | "이 문서들 삭제해줘" | ✅ 완료 |
| `restore_customer` | 삭제된 고객 복구 | "삭제한 고객 복구해줘" | ✅ 완료 |
| `list_deleted_customers` | 삭제된 고객 목록 | "복구 가능한 고객 보여줘" | ✅ 완료 |

**결과**: 7개 도구 추가, "~해줘" 요청 처리 가능

### Phase 2: Annual Report 연동 (고부가가치) ✅ 완료

| 도구 | 설명 | 유스케이스 | 상태 |
|------|------|-----------|------|
| `get_annual_reports` | 고객의 AR 목록 조회 | "이 고객의 연차보고서 보여줘" | ✅ 완료 |
| `get_ar_parsing_status` | AR 파싱 상태 조회 | "파싱 완료됐어?" | ✅ 완료 |
| `trigger_ar_parsing` | AR 파싱 트리거 | "이 보고서 파싱해줘" | ✅ 완료 |
| `get_ar_queue_status` | AR 파싱 큐 상태 | "대기 중인 파싱 작업은?" | ✅ 완료 |

**결과**: 4개 도구 추가, Annual Report 관리 가능

### Phase 3: 인사이트 도구 (차별화) ✅ 완료

| 도구 | 설명 | 유스케이스 | 상태 |
|------|------|-----------|------|
| `analyze_customer_value` | 고객 가치 점수 계산 | "중요 고객이 누구야?" | ✅ 완료 |
| `find_coverage_gaps` | 보장 공백 분석 | "이 고객 보장 부족한 부분?" | ✅ 완료 |
| `suggest_next_action` | 다음 영업 액션 추천 | "이 고객에게 뭘 해야해?" | ✅ 완료 |

**결과**: 3개 도구 추가, 영업 인사이트 제공 가능

### Phase 4: 유틸리티 도구 (사용자 편의) ✅ 완료

| 도구 | 설명 | 유스케이스 | 상태 |
|------|------|-----------|------|
| `get_storage_info` | 저장소 사용량 조회 | "내 저장소 사용량은?" | ✅ 완료 |
| `check_customer_name` | 고객명 중복 검사 | "이 이름 등록 가능해?" | ✅ 완료 |
| `list_notices` | 공지사항 조회 | "최신 공지 보여줘" | ✅ 완료 |
| `list_faqs` | FAQ 조회 | "관련 FAQ 찾아줘" | ✅ 완료 |
| `list_usage_guides` | 사용 가이드 조회 | "사용법 알려줘" | ✅ 완료 |

**결과**: 5개 도구 추가, 시스템 정보 및 도움말 접근 가능

### Phase 5: RAG 검색 강화 (고급 검색) ✅ 완료

| 도구 | 설명 | 유스케이스 | 상태 |
|------|------|-----------|------|
| `search_documents_semantic` | 시맨틱 문서 검색 | "보험금 청구 관련 문서 찾아줘" | ✅ 완료 |
| `get_search_analytics` | 검색 품질 통계 | "검색 성능 어때?" | ✅ 완료 |
| `get_failed_queries` | 실패한 검색 분석 | "검색 실패한 것들 뭐야?" | ✅ 완료 |
| `submit_search_feedback` | 검색 피드백 제출 | "이 결과 별로야" | ✅ 완료 |

**결과**: 4개 도구 추가, 하이브리드 검색 엔진(메타데이터+벡터) 활용 가능

---

## 3. 진행 상황

### Phase 1 진행 로그

#### 2025-12-23: 계획 수립
- [x] 현황 분석 완료
- [x] 확장 방향 결정 (단일 서비스 확장)
- [x] 로드맵 문서화

#### 2025-12-23: Phase 1 구현 완료
- [x] `relationships.ts` 신규 생성
  - `create_relationship`: 고객 간 관계 생성 (양방향 관계 자동 처리)
  - `delete_relationship`: 관계 삭제 (역방향도 함께 삭제)
  - `list_relationships`: 관계 목록 조회 (카테고리별 그룹화)
- [x] `documents.ts` 확장
  - `delete_document`: 단일 문서 삭제
  - `delete_documents`: 복수 문서 일괄 삭제
- [x] `customers.ts` 확장
  - `restore_customer`: 삭제된 고객 복구 (이름 중복 검증 포함)
  - `list_deleted_customers`: 삭제된 고객 목록 조회
- [x] `index.ts` 도구 등록 완료
- [x] TypeScript 타입 체크 통과
- [x] Phase 1 커밋

**추가된 도구**: 7개
**총 도구 수**: 22개

---

### Phase 2 진행 로그

#### 2025-12-23: Phase 2 구현 완료
- [x] `annual_reports.ts` 신규 생성
  - `get_annual_reports`: 고객의 AR 목록 조회 (계약 정보 포함)
  - `get_ar_parsing_status`: AR 파싱 상태 조회 (파일/고객 기준)
  - `trigger_ar_parsing`: AR 파싱 트리거 (큐에 작업 추가)
  - `get_ar_queue_status`: 전체 파싱 큐 상태 조회
- [x] `index.ts` 도구 등록 완료
- [x] TypeScript 타입 체크 통과
- [x] Phase 2 커밋

**추가된 도구**: 4개
**총 도구 수**: 26개

---

### Phase 3 진행 로그

#### 2025-12-23: Phase 3 구현 완료
- [x] `insights.ts` 신규 생성
  - `analyze_customer_value`: 고객 가치 점수 계산 (계약 수, 보험료, 관계망, 고객 기간 기반)
  - `find_coverage_gaps`: 보장 공백 분석 (현재 보장 카테고리 분석, 부족 영역 식별)
  - `suggest_next_action`: 다음 영업 액션 추천 (계약 만기, 생일, 미접촉, 정보 미완성 기준)
- [x] `index.ts` 도구 등록 완료
- [x] TypeScript 타입 체크 통과
- [x] Phase 3 커밋

**추가된 도구**: 3개
**총 도구 수**: 29개

---

### Phase 4 진행 로그

#### 2025-12-23: Phase 4 구현 완료
- [x] `utilities.ts` 신규 생성
  - `get_storage_info`: 저장소 사용량 조회 (티어별 할당량, 사용량, 잔여량)
  - `check_customer_name`: 고객명 중복 검사 (등록 전 검증용)
  - `list_notices`: 공지사항 조회 (카테고리별 필터링)
  - `list_faqs`: FAQ 조회 (카테고리별, 검색 지원)
  - `list_usage_guides`: 사용 가이드 조회 (카테고리별, 검색 지원)
- [x] `index.ts` 도구 등록 완료
- [x] TypeScript 타입 체크 통과
- [x] Phase 4 커밋

**추가된 도구**: 5개
**총 도구 수**: 34개

---

### Phase 5 진행 로그

#### 2025-12-23: Phase 5 구현 완료
- [x] `rag.ts` 신규 생성
  - `search_documents_semantic`: 시맨틱 문서 검색 (하이브리드 엔진 활용)
  - `get_search_analytics`: 검색 품질 통계 조회 (성공률, 응답 시간, 쿼리 유형 분포)
  - `get_failed_queries`: 실패한 검색 쿼리 분석
  - `submit_search_feedback`: 검색 결과 피드백 제출
- [x] aims_rag_api HTTP 연동 구현
- [x] `index.ts` 도구 등록 완료
- [x] TypeScript 타입 체크 통과
- [x] Phase 5 커밋

**추가된 도구**: 4개
**총 도구 수**: 38개

---

## 4. 기술 참고

### 4.1 aims_api 관련 엔드포인트

| 기능 | API | 메서드 |
|------|-----|--------|
| 관계 생성 | `/api/customers/:id/relationships` | POST |
| 관계 삭제 | `/api/customers/:id/relationships/:relId` | DELETE |
| 문서 삭제 | `/api/documents/:id` | DELETE |
| 고객 복구 | `/api/customers/:id/restore` | POST |

### 4.2 annual_report_api 관련 엔드포인트

| 기능 | API | 메서드 |
|------|-----|--------|
| 파싱 요청 | `/parse` | POST |
| 상태 조회 | `/status/:file_id` | GET |
| 보고서 조회 | `/customers/:id/annual-reports` | GET |

### 4.3 aims_rag_api 관련 엔드포인트

| 기능 | API | 메서드 |
|------|-----|--------|
| 시맨틱 검색 | `/search` | POST |
| 검색 통계 | `/analytics/overall` | GET |
| 실패 쿼리 | `/analytics/failed_queries` | GET |
| 피드백 제출 | `/feedback` | POST |

### 4.4 MCP 도구 구현 패턴

```typescript
// tools/example.ts
import { z } from 'zod';
import { McpServer } from '@anthropic-ai/mcp';

export function registerExampleTools(server: McpServer, db: Db) {
  server.tool(
    'tool_name',
    '도구 설명',
    {
      param1: z.string().describe('파라미터 설명'),
      param2: z.number().optional().describe('선택 파라미터'),
    },
    async ({ param1, param2 }, { userId }) => {
      // 구현
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );
}
```

---

## 5. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2025-12-23 | 문서 생성, 확장 계획 수립 |
| 2025-12-23 | Phase 1 완료 - 7개 도구 추가 (관계 관리 3개, 문서 삭제 2개, 고객 복구 2개) |
| 2025-12-23 | Phase 2 완료 - 4개 도구 추가 (Annual Report 관련) |
| 2025-12-23 | Phase 3 완료 - 3개 도구 추가 (인사이트: 고객 가치 분석, 보장 공백 분석, 액션 추천) |
| 2025-12-23 | Phase 4 완료 - 5개 도구 추가 (유틸리티: 저장소, 고객명 검사, 공지, FAQ, 가이드) |
| 2025-12-23 | Phase 5 완료 - 4개 도구 추가 (RAG 검색: 시맨틱 검색, 검색 통계, 실패 쿼리, 피드백) |
