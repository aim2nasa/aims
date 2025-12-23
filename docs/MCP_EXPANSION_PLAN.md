# AIMS MCP 확장 계획

> **문서 생성일**: 2025-12-23
> **목적**: aims-mcp 기능 확장 로드맵 및 진행 상황 추적

---

## 1. 현황 분석

### 1.1 현재 aims-mcp 도구 (22개) - Phase 1 완료

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

### Phase 2: Annual Report 연동 (고부가가치)

| 도구 | 설명 | 유스케이스 | 상태 |
|------|------|-----------|------|
| `parse_annual_report` | 연차보고서 파싱 요청 | "이 보고서 분석해줘" | ⬜ 예정 |
| `get_report_status` | 파싱 진행 상태 확인 | "파싱 완료됐어?" | ⬜ 예정 |
| `compare_contracts_with_report` | 기존 계약과 비교 | "누락된 계약 있어?" | ⬜ 예정 |

**목표**: 연차보고서 수동 입력 → 자동화

### Phase 3: 인사이트 도구 (차별화)

| 도구 | 설명 | 유스케이스 | 상태 |
|------|------|-----------|------|
| `analyze_customer_value` | 고객 가치 점수 계산 | "중요 고객이 누구야?" | ⬜ 예정 |
| `find_coverage_gaps` | 보장 공백 분석 | "이 고객 보장 부족한 부분?" | ⬜ 예정 |
| `suggest_next_action` | 다음 영업 액션 추천 | "이 고객에게 뭘 해야해?" | ⬜ 예정 |

**목표**: 단순 조회 → 영업 인사이트 제공

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

(Phase 2 시작 시 작성)

---

### Phase 3 진행 로그

(Phase 2 완료 후 작성)

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

### 4.3 MCP 도구 구현 패턴

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
