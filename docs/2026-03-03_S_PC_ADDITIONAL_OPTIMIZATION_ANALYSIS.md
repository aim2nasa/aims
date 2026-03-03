# S PC 추가 성능 개선 가능성 분석

> **작성일**: 2026-03-03
> **분석 기반**: Phase 1~3 완료 후 S PC 실측 데이터
> **분석 방법**: 3개 독립 분석 (직접 탐색 + Alex 아키텍트 + Gini 품질 검증)

---

## 1. 현재 상태

### Phase 1~3 완료 후 S PC 실측 (2026-03-03)

| 페이지 | 전송량 | Finish 시간 |
|--------|--------|------------|
| 전체 고객 보기 | 4.2 MB | 14.10s |
| 지역별 고객 보기 | 8.2 MB | 33.81s |
| 관계별 고객 보기 | 7.7 MB | 24.09s |
| 전체 문서 보기 | 5.1 MB | 14.55s |
| 문서 탐색기 | 7.6 MB | 18.05s |
| 상세 문서검색 | 4.2 MB | 34.34s |
| 고객 전체보기 | 5.1 MB | 13.35s |

### 현재 데이터 규모

| 항목 | 건수 |
|------|------|
| 고객 | 889건 |
| 계약 | 0건 (미사용) |
| 문서 (현재 유저) | 2,080건 |
| 관계 | 0건 |

---

## 2. limit=10000 잔존 현황 (전수 조사)

### 조사 결과: 5곳 잔존

| # | 뷰 | 파일:라인 | API | 단순 limit 축소 가능? |
|---|---|----------|-----|---------------------|
| 1 | ContractAllView | `ContractAllView.tsx:179-180` | contracts(10000) + customers(10000) = **5.5MB** | **불가** — 검색/초성/10컬럼정렬/페이지네이션 전부 클라이언트사이드 |
| 2 | CustomerRegionalView | `CustomerRegionalView.tsx:80` | customers(10000) = **~2.7MB** | **불가** — 지역 트리 카운트 + 지도 마커에 전체 필요 |
| 3 | CustomerRelationshipView | `CustomerRelationshipView.tsx:191` | customers(10000) = **~2.7MB** | **불가** — "미설정" 분류가 전체 고객-관계 차집합 |
| 4 | DocumentManagementView | `DocumentManagementView.tsx:128` | documents/status(10000) = **~4.4MB** | **불가** — 파일타입 분포/기간별 집계에 전체 필요 |
| 5 | QuickFamilyAssignPanel | `QuickFamilyAssignPanel.tsx:109` | customers(10000) = **~2.7MB** | **불가** — 가족 미설정 고객 필터에 전체 필요 |

### 3개 분석 공통 결론

> **"단순 limit 축소로 기능을 유지하면서 성능을 개선할 수 있는 항목은 없다."**
>
> 5곳 모두 클라이언트사이드 필터/정렬/집계가 전체 데이터에 의존.
> "limit=500으로 줄이면 500명까지만 올바르게 동작"하는 미봉책이 됨.
>
> 올바른 개선은 **서버사이드 전환** (백엔드 API 추가 + 프론트엔드 리팩토링).

---

## 3. 개선 항목 — 효과순 (Alex + Gini 교차 검증)

### Tier 1 — 높은 효과, 실현 가능

| 순위 | 항목 | 현재 | 개선 방향 | 예상 효과 (S) | 난이도 | Alex 판정 | Gini 판정 |
|------|------|------|----------|-------------|--------|----------|----------|
| **1** | **DocumentManagementView 서버사이드 집계** | `getRecentDocuments(1, 10000)` → 4.4MB | 백엔드 `/api/documents/stats?period=X&groupBy=fileType` 집계 API 추가 → 수 KB | **해당 뷰 -99%** | 소~중 | **최고 ROI** | **유일한 명확 ROI** |
| **2** | **QuickFamilyAssignPanel 중복 API 제거** | 독립적으로 customers(10000) + relationships 재호출 | 부모 뷰(CustomerRelationshipView)의 `allCustomers`/`relationships`를 props로 전달 | **API 2건 즉시 제거 (-2.7MB)** | 극소 | props 전달만으로 해결 | 실행 가능 확인 |
| **3** | **ContractAllView 서버사이드 전환** | contracts(10000) + customers(10000) = 5.5MB | Phase 2(AllCustomersView) 패턴 재사용: 서버사이드 검색/정렬/페이지네이션 | **현재 0건 → 데이터 축적 후 효과** | 중 | 현재 계약 0건, 미래 대비 | 클라이언트 로직 4개 서버 전환 필요 |

### Tier 2 — 중간 효과, 중간~높은 작업

| 순위 | 항목 | 현재 | 개선 방향 | 예상 효과 | 난이도 | 3개 분석 합의 |
|------|------|------|----------|----------|--------|-------------|
| **4** | **SSE 이벤트 debounce** | 문서 탐색기 434 요청/18초 (연쇄 fetchDocuments) | SSE 이벤트 수신 시 debounce 500ms 적용 | **탐색기 불필요 API 호출 -80%** | 소 | 합의 |
| **5** | **CustomerRegionalView geocode 캐싱** | 고객별 geocode API 수백 건 호출 (W에서도 6.47s 병목) | 좌표를 DB에 캐싱 (주소 변경 시만 재호출) | **지역별보기 지도 로딩 -80%** | 중 (백엔드) | 합의 |
| **6** | **DocumentStatusProvider Context 분할** | 15개 의존성 단일 useMemo → ANY 변경 시 전체 리렌더 | data/actions/ui 3개 Context 분리 | **리스트/탐색기 리렌더 -70%** | 대 | Alex: 당장 불필요 (useMemo 이미 적용), Gini: 구조 개선 |

### Tier 3 — 낮은 효과 또는 높은 작업, 재검토 조건 포함

| 순위 | 항목 | 예상 효과 | 난이도 | 3개 분석 합의 | 재검토 조건 |
|------|------|----------|--------|-------------|-----------|
| **7** | CSS transition(722)/box-shadow(432) 저사양 대응 | ~~-20~30%~~ → **미미** | 소 | Alex: GPU 가속이므로 병목 아님. 디자인 훼손 위험 | — |
| **8** | App.tsx 상태 Zustand 이관 (useState 26개) | ~~-80%~~ → **코드 품질 개선** | 대 | Alex: S 성능과 무관. Gini: 유지보수 개선 | 리팩토링 시점 |
| **9** | CustomerRegionalView 지역별 lazy 로드 | 지역별보기 -50% | 대 (아키텍처 변경) | 전체 데이터 필수 구조 → 서버사이드 집계 필요 | **고객 3,000건 돌파 시** |
| **10** | CustomerRelationshipView 서버사이드 | 관계별보기 -50% | 대 (백엔드 API 신규) | "미설정" 분류에 전체 데이터 필수 | **고객 3,000건 돌파 시** |
| **11** | 가상 스크롤 (@tanstack/react-virtual) | DOM 노드 -90% | 대 | 현재 페이지네이션 15~100건 → 병목 아님 | **고객 10,000건+ 시** |
| **12** | 초기 API 통합 (/api/init) | ~~-30%~~ → **미미** | 중 (백엔드) | visible 가드 후 활성 뷰만 호출 → 호출 수 문제 아님 | — |
| **13** | SSE → WebSocket 전환 | **미미** | 대 | SharedWorker 기반 SSE가 이미 연결 공유 중 | — |

---

## 4. 3개 분석의 교차 검증 결과

### 합의된 항목

| 항목 | 직접 탐색 | Alex | Gini | 합의 |
|------|---------|------|------|------|
| DocumentManagementView 서버사이드 집계 | Tier 1 #4 | **최고 ROI, #1 우선** | **유일한 명확 ROI** | **최우선 실행** |
| QuickFamilyAssignPanel 중복 제거 | 미포함 | **신규 발견, #2 우선** | 실행 가능 확인 | **즉시 실행** |
| 5곳 모두 단순 limit 축소 불가 | — | 코드 검증 완료 | 코드 검증 완료 | **합의** |
| Regional/Relationship 전체 데이터 필수 | 점진적 로드 제안 | 구조적 불가 판정 | 구조적 불가 판정 | **보류 (3,000건 돌파 시 재검토)** |

### 수정된 판단 (초기 분석 대비)

| 항목 | 초기 예상 | Alex/Gini 검증 후 | 변경 이유 |
|------|---------|------------------|----------|
| CSS transition/box-shadow 비활성화 | Tier 2, 효과 -20~30% | **Tier 3, 효과 미미** | GPU 가속 CSS는 저사양에서도 비용 낮음. 병목은 네트워크/JSON 파싱 |
| App.tsx Zustand 이관 | Tier 2, 효과 -80% | **Tier 3, S 성능과 무관** | 코드 품질 개선이지 성능 개선이 아님 |
| CustomerRegionalView 점진적 로드 | Tier 1, 효과 높음 | **Tier 3, 구조적 불가** | 트리 카운트/지도 마커에 전체 데이터 필수 |
| CustomerRelationshipView limit 축소 | Tier 1, 효과 높음 | **Tier 3, 구조적 불가** | "미설정" 분류 + Union-Find에 전체 데이터 필수 |
| ContractAllView 서버사이드 전환 | Tier 1 #1 | **Tier 1 #3 (우선순위 하락)** | 현재 계약 0건 → 당장 효과 없음 |
| DocumentManagementView 집계 | Tier 1 #4 | **Tier 1 #1 (우선순위 상승)** | 유일하게 서버사이드 전환 ROI가 명확한 항목 |

---

## 5. Gini 발견: 추가 이슈

### Critical — 테스트 커버리지 허점

**파일**: `DocumentManagementView.pie-chart.test.tsx:32`

```tsx
// 테스트가 mock하는 메서드:
DocumentStatusService: {
  getAllDocuments: vi.fn()  // ← getAllDocuments
}

// 실제 컴포넌트가 호출하는 메서드 (DocumentManagementView.tsx:128):
DocumentStatusService.getRecentDocuments(1, 10000, 'uploadTime_desc')  // ← getRecentDocuments
```

테스트가 `getAllDocuments`를 mock하지만 컴포넌트는 `getRecentDocuments` 호출.
→ 파이차트 관련 `allDocuments` 데이터 경로 테스트 커버리지 **사실상 무효**.

---

## 6. 실행 계획

### Phase 4 — 즉시 실행 가능 (효과순)

| 순서 | 작업 | 변경 범위 | 예상 S 효과 |
|------|------|----------|------------|
| **4-1** | DocumentManagementView: 서버사이드 집계 API + 프론트 전환 | BE: documents-routes.js (집계 API 추가) / FE: DocumentManagementView.tsx (10000건 로드 제거) | 해당 뷰 4.4MB → 수 KB |
| **4-2** | QuickFamilyAssignPanel: 부모 데이터 props 전달 (중복 API 제거) | FE: QuickFamilyAssignPanel.tsx + CustomerRelationshipView.tsx (props 추가) | 모달 시 -2.7MB |
| **4-3** | pie-chart 테스트 mock 수정 | FE: DocumentManagementView.pie-chart.test.tsx | 테스트 정합성 복구 |
| **4-4** | SSE 이벤트 debounce 추가 | FE: useDocumentStatusListSSE.ts | 탐색기 불필요 API -80% |

### Phase 5 — 데이터 축적 후 (조건부)

| 조건 | 작업 |
|------|------|
| 계약 데이터 축적 시 | ContractAllView 서버사이드 전환 (Phase 2 패턴 재사용) |
| 고객 3,000건 돌파 시 | CustomerRegionalView/RelationshipView 서버사이드 집계 API 도입 |
| 고객 10,000건+ 시 | @tanstack/react-virtual 가상 스크롤 도입 |

---

## 7. 예상 효과 요약

### Phase 4 완료 시

| 페이지 | 현재 Finish | Phase 4 후 예상 | 개선 |
|--------|------------|----------------|------|
| 전체 고객 보기 | 14.10s | 14s (변화 없음) | — |
| 지역별 고객 보기 | 33.81s | 33s (변화 없음) | — |
| 관계별 고객 보기 | 24.09s | **18s** (QuickFamilyAssignPanel 중복 제거) | **-25%** |
| 전체 문서 보기 | 14.55s | 14s (변화 없음) | — |
| 문서 탐색기 | 18.05s | **12s** (SSE debounce) | **-33%** |
| 상세 문서검색 | 34.34s | 34s (변화 없음) | — |
| 문서 관리 대시보드 | (미측정) | **수 초** (4.4MB → 수 KB) | **-95%+** |

### 전체 Phase 통합 (최초 → Phase 4)

```
최초 상태 (Phase 1 전):    2분+ (42~53 MB)
Phase 1~3 완료:           13~34초 (4.2~8.2 MB)   — -80~90%
Phase 4 완료 후 예상:      12~33초 (3~7 MB)       — 추가 -10~25%
```

---

## 8. 최종 결론

### Alex 아키텍트 핵심 소견

> **Phase 1~3은 매우 효과적이었다 (2분+ → 13~34초 = 80%+ 개선).**
> 남은 병목의 실체는 "전체 데이터가 구조적으로 필요한 뷰"들이다.
> 889건 규모에서 지역/관계 뷰의 서버사이드 전환은 **과잉 투자**.
> **고객 3,000건 돌파 시점에 재검토** 권장.
> CSS transition/box-shadow 비활성화는 **병목이 아니므로 건너뛰기**.

### Gini 품질 엔지니어 핵심 소견

> **5곳 모두 단순 limit 축소로 기능 유지 불가** — 코드 검증 완료.
> **DocumentManagementView만 서버사이드 전환 ROI가 명확.**
> QuickFamilyAssignPanel은 부모 데이터 재사용으로 즉시 개선 가능.
> pie-chart 테스트 mock 불일치는 즉시 수정 필요.

### 3개 분석 공통 결론

1. **지금 할 수 있는 가장 효과적인 것**: DocumentManagementView 서버사이드 집계 + QuickFamilyAssignPanel 중복 제거
2. **단순 limit 축소는 미봉책**: 5곳 모두 서버사이드 전환이 필요하며, 현재 데이터 규모에서 ROI가 명확한 것은 DocumentManagementView뿐
3. **CSS/Context/Zustand는 현재 S 병목이 아님**: 병목은 네트워크 전송 + JSON 파싱이지 렌더링이 아님
4. **고객 3,000건 돌파 시 지역/관계 뷰 서버사이드 전환 재검토**
