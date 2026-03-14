# 고객 메모 기능 업그레이드 설계서

> **Designer**: Dana (UX/UI)
> **Date**: 2026.03.14
> **Version**: 2.1 (에이전트 리뷰 + 모바일 웹 반영)
> **Status**: 설계 완료 — 구현 승인 대기
> **Reviewers**: Alex (설계), Gini (QA), Sora (설계사), PM (기획), Code Reviewer

---

## 1. 현재 상태 분석

### 문제점

| 구분 | 현재 | 문제 |
|------|------|------|
| **UI** | 단일 textarea (`customers.memo` 직접 수정) | 시간 흐름 추적 불가, 메모 간 구분 없음 |
| **데이터** | `customer_memos` 컬렉션 존재하나, MemosTab이 `customers.memo` 필드만 직접 편집 | 준비된 인프라 미활용, 데이터 소스 불일치 |
| **MCP** | `customers.memo` 텍스트 기반 줄 단위 조작 | 구조화되지 않아 AI가 개별 메모를 정확히 다루기 어려움 |

### 이미 준비된 인프라 (미사용 중)

- `customer_memos` 컬렉션 (개별 문서, 타임스탬프, 작성자 추적)
- `MemoService` (CRUD API 완비)
- `useMemoController` (상태 관리 훅 완비)
- 백엔드 REST API 4개 (GET/POST/PUT/DELETE `/api/customers/:id/memos`)
- `syncCustomerMemoField()` — CUD 후 `customers.memo` 자동 동기화

**결론**: 백엔드/서비스/컨트롤러는 이미 완성되어 있으나, **프론트엔드 UI와 MCP 도구만 구식**인 상태.
이번 전환은 "UI만 바꾸는 것"이 아니라 **데이터 소스가 `customers.memo` → `customer_memos` 컬렉션으로 완전 전환**되는 것임을 인지해야 함.

---

## 2. 설계 원칙

1. **경량**: 이미 준비된 인프라를 활용 — 새 API 없음, 새 컬렉션 없음
2. **시간 기반**: 메모를 독립된 카드로 표시, 날짜/시간 명확히 노출
3. **음성 친화**: MCP 도구가 구조화된 데이터를 반환 → AI가 자연어로 읽어줄 수 있음
4. **Apple 디자인**: AIMS 기존 디자인 시스템 준수
5. **동시 배포**: Phase 1(UI) + Phase 2(MCP) 반드시 함께 배포 (과도기 불일치 방지)
6. **모바일 우선**: 설계사는 이동 중 모바일로 메모 → 터치/키보드 대응 필수

---

## 3. 프론트엔드 UI 설계

### 3-1. MemosTab 리디자인

```
┌─────────────────────────────────────────┐
│ 📝 메모                                  │  ← 헤더
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ 항상 열린 입력 필드                    │ │  ← 토글 없이 항상 노출 (Sora 피드백)
│ │ placeholder: "전화 상담 후 메모를     │ │
│ │  남겨보세요... (Ctrl+Enter로 저장)"   │ │
│ │                              [저장] │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ── 2026.03.14 ──────────────────────── │  ← 날짜 구분선
│                                         │
│  14:30  보험 리뷰 미팅. 종신보험 증액    │  ← 메모 카드
│         검토 요청함.                     │
│                                    ⋯   │  ← 더보기 (수정/삭제)
│                                         │
│  09:15  전화 상담. 자녀 학자금 보험      │
│         문의. 다음주 목요일 방문 예정     │
│                                    ⋯   │
│                                         │
│ ── 2026.03.13 ──────────────────────── │
│                                         │
│  16:40  연간보고서 수령. 변액보험 수익률 │
│         하락 안내함.                     │
│                                    ⋯   │
│                                         │
└─────────────────────────────────────────┘
```

### 3-2. 인터랙션 상세

| 동작 | 설명 |
|------|------|
| **메모 추가** | 입력 영역은 항상 열려있음 → 내용 입력 → 플랫폼별 저장 (아래 참조) |
| **메모 수정** | `⋯` 메뉴 → "수정" → inline 편집 모드 → 동일 패턴으로 저장 |
| **메모 삭제** | `⋯` 메뉴 → "삭제" → AppleConfirmModal 확인 |
| **날짜 구분** | 같은 날짜의 메모는 하나의 날짜 헤더 아래 그룹핑 |
| **시간 표시** | 각 메모 좌측에 `HH:mm` 형식으로 시간 표시 |
| **스크롤** | 메모가 많을 경우 영역 내 스크롤 (최신순 정렬, 위가 최신) |
| **빈 상태** | "전화 상담 후 메모를 남겨보세요" (구체적 안내, Sora 피드백) |

> **키보드 패턴 (플랫폼별 분기)**
> - **PC** (슬랙/카톡 PC 패턴): Enter = 저장, Shift+Enter = 줄바꿈
> - **모바일** (카톡/iMessage 패턴): Enter = 줄바꿈, 저장 버튼 = 저장
> - 감지: `useDeviceOrientation().isMobileLayout` (768px 이하 또는 터치 디바이스)

### 3-3. 디자인 토큰

```css
/* 메모 카드 */
font-size: var(--font-caption);        /* 12px - 본문 */
color: var(--color-text-primary);

/* 시간 라벨 */
font-size: 11px;
font-weight: 600;
color: var(--color-text-tertiary);

/* 날짜 구분선 */
font-size: 11px;
font-weight: 600;
color: var(--color-text-quaternary);
border-bottom: 1px solid var(--color-border-secondary);

/* 더보기 버튼 */
opacity: 0 → hover 시 0.6;
font-size: 14px;

/* 입력 영역 테두리 — CSS 변수만 사용 (rgba 직접 사용 금지) */
border: 1px solid var(--color-border-secondary);
/* focus ring */
box-shadow: 0 0 0 3px var(--color-focus-ring);
```

### 3-4. 모바일 웹 대응

AIMS는 4단계 breakpoint(480/768/1024/1366px) + 폰 가로 모드를 지원하며,
메모 탭은 **모바일에서 가장 빈번하게 사용되는 기능** (이동 중 메모 추가/확인).

#### 3-4-1. Breakpoint별 레이아웃

```
데스크톱 (>768px)              모바일 세로 (≤768px)           모바일 가로 (≤500px 높이)
┌──────────────────┐          ┌──────────────┐              ┌─────────────────────────┐
│ 📝 메모           │          │ 📝 메모       │              │ 📝 메모                  │
│ ┌──────────────┐ │          │ ┌──────────┐ │              │ ┌─────────────────────┐ │
│ │ 입력 필드     │ │          │ │ 입력 필드 │ │              │ │ 입력 (1줄 축소)      │ │
│ │ 2~3줄 높이   │ │          │ │ 2줄 높이  │ │              │ └─────────────────────┘ │
│ │       [저장] │ │          │ │    [저장] │ │              │ 14:30 보험 리뷰 미팅... ⋯│
│ └──────────────┘ │          │ └──────────┘ │              │ 09:15 전화 상담...     ⋯│
│ ── 2026.03.14 ── │          │ ─ 2026.03.14 │              └─────────────────────────┘
│ 14:30 보험 리뷰.. │          │ 14:30 보험.. │
│            ⋯    │          │          ⋯  │
│ 09:15 전화 상담.. │          │ 09:15 전화.. │
│            ⋯    │          │          ⋯  │
└──────────────────┘          └──────────────┘
```

#### 3-4-2. 모바일 CSS 규칙

```css
/* ── 768px 이하: 모바일 기본 ── */
@media (max-width: 768px) {
  /* 입력 textarea: iOS 자동 줌 방지 (16px 이상 필수) */
  .memo-input__textarea {
    font-size: max(16px, var(--font-caption));
  }

  /* 더보기(⋯) 버튼: 터치 기기에서 항상 표시 */
  .memo-card__more {
    opacity: 0.5;  /* hover 불가이므로 항상 보임 */
  }

  /* 메모 카드: 터치 영역 확보 */
  .memo-card {
    min-height: 44px;  /* WCAG 2.5.5 터치 타겟 */
    padding: var(--spacing-2) var(--spacing-3);
  }
}

/* ── 480px 이하: 스마트폰 ── */
@media (max-width: 480px) {
  /* 날짜 구분선: 약간 컴팩트 */
  .memo-date-header {
    font-size: 10px;
    padding: var(--spacing-1) 0;
  }

  /* 시간 라벨: 축소 */
  .memo-card__time {
    font-size: 10px;
    min-width: 32px;
  }
}

/* ── 폰 가로 모드: 세로 공간 극대화 ── */
@media (orientation: landscape) and (max-height: 500px) and (pointer: coarse) {
  /* 입력 영역: 1줄로 축소 (포커스 시 확장) */
  .memo-input__textarea {
    min-height: 28px;
    rows: 1;
  }

  .memo-input__textarea:focus {
    min-height: 48px;  /* 포커스 시 2줄로 확장 */
  }

  /* 날짜 구분선 숨김 (공간 절약) → 시간 옆에 날짜 표시 */
  .memo-date-header {
    display: none;
  }

  .memo-card__time::before {
    content: attr(data-date) " ";  /* "03.14 14:30" 형식 */
    font-weight: 400;
  }

  /* 메모 카드: 극도 컴팩트 */
  .memo-card {
    min-height: 28px;
    padding: 4px var(--spacing-2);
  }
}

/* ── 터치 디바이스 공통 ── */
@media (pointer: coarse) {
  /* 더보기 버튼: 항상 표시 (hover 없으므로) */
  .memo-card__more {
    opacity: 0.5;
  }

  /* 터치 영역 확대: 44x44px 히트 영역 */
  .memo-card__more::after {
    content: '';
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 44px; height: 44px;
  }

  /* 저장 버튼: 터치 친화적 크기 */
  .memo-input__save {
    min-height: 36px;
    min-width: 52px;
  }

  /* 호버 효과 비활성화 */
  .memo-card:hover {
    background: inherit;
  }
}
```

#### 3-4-3. 모바일 키보드 대응

| 상황 | 대응 |
|------|------|
| **키보드 열림** | `100dvh` 기반 레이아웃 → 키보드 높이 자동 제외. 부모 `CustomerDetailView`가 이미 `100dvh` 사용 |
| **iOS 자동 줌** | textarea `font-size: max(16px, ...)` 필수 (16px 미만 시 iOS가 자동 줌) |
| **입력 중 스크롤** | 입력 영역은 상단 고정, 메모 리스트만 스크롤 |
| **저장 패턴** | PC: Enter=저장(슬랙 패턴), 모바일: 저장 버튼(카톡 패턴). `useDeviceOrientation` 감지 |
| **안전 영역** | 부모 레이아웃이 `env(safe-area-inset-*)` 처리 완료 → MemosTab 자체에서 추가 처리 불필요 |

#### 3-4-4. 모바일 인터랙션 차이

| 동작 | 데스크톱 (슬랙/카톡 PC) | 모바일 (카톡/iMessage) |
|------|---------|--------|
| **메모 저장** | **Enter** | **저장 버튼** |
| **줄바꿈** | **Shift+Enter** | **Enter** (가상 키보드 기본 동작) |
| **더보기(⋯)** | hover 시 나타남 | **항상 표시** (opacity 0.5) |
| **수정 모드** | 더보기 → 수정 클릭 | 동일 (터치 영역 44px 확보) |
| **삭제 확인** | AppleConfirmModal | 동일 (모달은 이미 반응형 대응 완료) |
| **스크롤** | 마우스 휠 | 터치 스크롤 (`-webkit-overflow-scrolling: touch`) |

### 3-5. 구현 시 주의사항 (Code Review 반영)

- `title` 속성 사용 금지 → AIMS `<Tooltip>` 컴포넌트 사용
- `<button>` HTML 직접 사용 금지 → AIMS 컴포넌트 규칙 준수
- CSS에 `rgba()` 직접 사용 금지 → `var(--color-*)` CSS 변수만 사용
- `native title="고객 메모"` 현재 코드에 존재 → 리디자인 시 반드시 제거

---

## 4. MCP 도구 업그레이드

### 4-1. 데이터 접근 경로 (PM/Alex 피드백 반영)

**MCP 도구는 `customer_memos` 컬렉션에 직접 접근**하되, CUD 후 `syncCustomerMemoField()` 로직을 MCP 내부에 복제 구현합니다.

> REST API 경유 방식은 MCP 내부에서 JWT 토큰 관리가 필요하여 복잡성이 증가하므로,
> DB 직접 접근 + 동기화 함수 복제가 현실적입니다.

```
[프론트엔드 MemosTab]  ──REST API──►  [customer_memos 컬렉션]
                                              │
[MCP 도구]  ──────DB 직접 접근──►              │
       └─ syncCustomerMemoField() 복제 ─►     │
                                              ▼
                                    [customers.memo 동기화]
                                    (하위 호환 + 텍스트 검색용)
```

### 4-2. 현재 → 변경

| 도구 | 현재 | 변경 |
|------|------|------|
| `add_customer_memo` | `customers.memo` 텍스트 append | `customer_memos` INSERT + sync |
| `list_customer_memos` | `customers.memo` 텍스트 반환 | `customer_memos` 조회 → 구조화 JSON. **`limit` 파라미터 추가** (기본 10건, Sora: "최근 N건만 읽어줘") |
| `delete_customer_memo` | `lineNumber`/`contentPattern` 텍스트 조작 | **`memoId`** 기반 삭제 + sync. AI가 먼저 `list`로 ID 확인 후 삭제 (2단계 흐름) |
| **NEW** `update_customer_memo` | 없음 | `memoId` + `content`로 메모 수정 + sync |
| **NEW** `search_customer_memos` | 없음 | 키워드 기반 검색 (DB 직접 `$regex` 조회, 소유권 격리 유지) |

### 4-3. MCP 삭제 2단계 흐름 (PM 피드백 반영)

음성으로 "어제 메모 삭제해줘"라고 하면:

```
1. AI가 list_customer_memos 호출 → 메모 목록 + ID 획득
2. 날짜/내용 매칭으로 대상 특정
3. 매칭 결과가 2건 이상이면 → 후보 목록 제시, 사용자에게 확인 요청 (Gini 피드백)
4. 1건이면 → delete_customer_memo(memoId) 호출
```

### 4-4. search_customer_memos 소유권 격리 (Alex 피드백 반영)

전체 고객 메모 검색 시 2-step 쿼리:

```
1. customers 컬렉션에서 meta.created_by === userId인 고객 ID 목록 조회
2. customer_memos 컬렉션에서 해당 고객 ID 목록 + 키워드 $regex 조회
```

> 현재 메모 규모가 크지 않으므로 `$regex`로 충분. 향후 확장 시 MongoDB Text Index 검토.

### 4-5. 음성 시나리오 (MCP 대화 예시)

#### 메모 추가 (음성 입력)
```
설계사: "김영희 고객에게 메모 남겨줘. 오늘 전화해서 변액보험 수익률 설명했고,
        다음 주 수요일에 만나기로 했어."
AI:     add_customer_memo 호출 →
        "김영희 고객에게 메모를 남겼습니다. (2026.03.14 14:30)"
```

#### 메모 조회 (음성 출력, limit 지원)
```
설계사: "김영희 고객 최근 메모 3건만 읽어줘"
AI:     list_customer_memos({ customerId, limit: 3 }) 호출 →
        "김영희 고객의 최근 메모 3건입니다.
         오늘 오후 2시 30분: 전화해서 변액보험 수익률 설명, 다음 주 수요일 미팅 예정.
         어제 오전 9시 15분: 자녀 학자금 보험 문의, 목요일 방문 예정.
         3월 12일 오후 4시 40분: 연간보고서 수령."
```

#### 메모 검색
```
설계사: "다음 주 미팅 예정인 고객 메모 찾아줘"
AI:     search_customer_memos({ query: "미팅 예정" }) 호출 →
        "미팅 관련 메모가 2건 있습니다.
         김영희: 다음 주 수요일 미팅 예정 (오늘 기록)
         박철수: 3월 18일 사무실 방문 예정 (어제 기록)"
```

#### 메모 삭제 (2단계 흐름)
```
설계사: "김영희 고객 어제 메모 삭제해줘"
AI:     1) list_customer_memos 호출 → 어제 메모 1건 확인
        2) delete_customer_memo({ memoId: "xxx" }) 호출 →
        "김영희 고객의 어제(2026.03.13) 메모를 삭제했습니다.
         '연간보고서 수령. 변액보험 수익률 하락 안내함.'"
```

### 4-6. MCP 응답 형식 (구조화)

`list_customer_memos` 응답:

```json
{
  "customerId": "abc123",
  "customerName": "김영희",
  "memos": [
    {
      "id": "memo_001",
      "content": "전화 상담. 변액보험 수익률 설명. 다음 주 수요일 미팅 예정.",
      "created_at": "2026.03.14 14:30",
      "updated_at": null
    },
    {
      "id": "memo_002",
      "content": "연간보고서 수령. 변액보험 수익률 하락 안내함.",
      "created_at": "2026.03.13 16:40",
      "updated_at": null
    }
  ],
  "total": 2,
  "limit": 10
}
```

---

## 5. 데이터 흐름

### Single Source of Truth: `customer_memos` 컬렉션

- **읽기/쓰기**: 항상 `customer_memos` 컬렉션 기준
- **동기화**: CUD 작업 후 `syncCustomerMemoField()` 호출 → `customers.memo` 갱신
- **하위 호환**: `customers.memo` 필드는 유지 (기존 검색/표시 호환)

### 하위 호환 보호 (Gini 피드백 반영)

`useCustomerEditController`가 `customers.memo` 필드를 직접 편집하는 경로가 존재함.
전환 후 이 경로를 통한 직접 수정이 `customer_memos` 컬렉션과 역방향 불일치를 유발할 수 있음.

**대응**: `useCustomerEditController`에서 `memo` 필드를 **읽기 전용**으로 변경하거나, 편집 저장 시 해당 필드를 제외.

---

## 6. 구현 범위

### Phase 0: 사전 준비 (필수, 배포 전)

| 작업 | 설명 |
|------|------|
| **역방향 마이그레이션 스크립트** | `customers.memo` 텍스트 → `customer_memos` 컬렉션 파싱/INSERT. `[YYYY.MM.DD HH:mm]` 패턴 파싱, 타임스탬프 없는 줄은 마이그레이션 시점으로 INSERT. dry-run 옵션 포함 |
| **DB 인덱스 확인** | `customer_memos` 컬렉션에 `customer_id` 인덱스 확인, 없으면 생성 |
| **기존 데이터 검증** | `customers.memo`에만 있고 `customer_memos`에 없는 데이터 건수 확인 |

### Phase 1+2: 프론트엔드 + MCP 동시 구현 (동시 배포 필수)

#### Phase 1: 프론트엔드 MemosTab 리디자인

| 작업 | 파일 | 설명 |
|------|------|------|
| MemosTab 재구현 | `MemosTab.tsx` | `useMemoController` 연결, 카드형 UI, 항상 열린 입력 영역 |
| CSS 재작성 | `MemosTab.css` | 날짜 그룹, 시간 라벨, 카드 스타일. CSS 변수만 사용 |
| memo 편집 경로 차단 | `useCustomerEditController.ts` | `memo` 필드 직접 편집 제거 또는 읽기 전용 |

**변경 없는 파일**: `memoService.ts`, `useMemoController.ts`, 백엔드 REST API

#### Phase 2: MCP 도구 업그레이드

| 작업 | 파일 | 설명 |
|------|------|------|
| MCP 도구 전환 | `memos.ts` | `customer_memos` DB 직접 접근 + `syncCustomerMemoField()` 복제 |
| `list` limit 추가 | `memos.ts` | 기본 10건, 음성 "최근 N건" 지원 |
| `delete` memoId 기반 | `memos.ts` | lineNumber/contentPattern → memoId 전환 |
| `update_customer_memo` 추가 | `memos.ts` | 메모 수정 도구 |
| `search_customer_memos` 추가 | `memos.ts` | 2-step 소유권 격리 + $regex 검색 |
| 도구 등록 | `tools/index.ts` | 새 도구 등록 |
| E2E 테스트 업데이트 | `sync.e2e.test.ts` | `{ memo: string }` → `{ memos: [...] }` 응답 형식 반영 |

### 구현하지 않는 것

- 태그/카테고리 시스템 (과도한 복잡성)
- 메모 알림/리마인더 (별도 기능으로 분리)
- 이미지/파일 첨부 (현재 불필요)
- 메모 공유 (단일 설계사 사용)

### 향후 검토 (Future)

- **메모 고정(Pin)**: Sora 요청 — "항상 기억해야 할 정보" 상단 고정 (가까운 미래 검토)
- **UI 내 검색/기간 필터**: Sora 요청 — 화면에서 직접 키워드 검색 (Phase 2 이후)
- **MongoDB Text Index**: 메모 규모 증가 시 `$regex` → Text Index 전환

---

## 7. 리스크 및 대응

| 항목 | 대응 |
|------|------|
| **역방향 마이그레이션** (Alex/Gini Critical) | Phase 0에서 `customers.memo` → `customer_memos` 파싱 스크립트 작성. dry-run 포함. 기존 `migrate-memos.js`는 정방향만 처리하므로 별도 스크립트 필요 |
| **syncCustomerMemoField 동기화 실패** (Gini Critical) | 동기화 실패 시 에러 로그 + 응답에 `syncWarning: true` 플래그 추가. Silent fail 방지 |
| **MCP-UI 과도기 불일치** (Alex Major) | Phase 1+2 동시 배포로 해결. 단독 배포 금지 |
| **useCustomerEditController memo 직접 편집** (Gini Critical) | Phase 1에서 memo 필드 편집 경로 차단 |
| **DB 인덱스** (Alex) | Phase 0에서 `customer_memos.customer_id` 인덱스 확인/생성 |
| **ObjectId 직렬화** (Code Reviewer) | POST/PUT 응답에서 `_id.toHexString()` 사용 확인. 구현 시 검증 |
| **E2E 테스트 깨짐** (Gini) | Phase 2에서 `sync.e2e.test.ts` 응답 형식 동시 업데이트 |
| **MCP 하위 호환** | `customers.memo` 동기화 유지 → chatService 기존 동작 영향 없음 |

---

## 8. 성공 기준 (PM 피드백 반영)

| 측정 항목 | 기준 |
|----------|------|
| 기존 메모 손실 | 마이그레이션 후 **0건 손실** (dry-run 검증 포함) |
| MCP 음성 추가 응답 | **3초 이내** |
| UI 기능 동작 | 추가/수정/삭제 **3가지 모두 정상** |
| 하위 호환 | `customers.memo` 필드 기존 검색 **정상 동작** |
| 날짜 그룹핑 | 같은 날짜 메모 **1개 날짜 헤더** 아래 정확히 그룹핑 |
| 동기화 | REST API / MCP 양쪽 CUD 후 `customers.memo` 동기화 **정상** |
| 모바일 (768px) | 메모 추가/조회 **정상**, iOS 자동 줌 **미발생**, 터치 타겟 **44px 이상** |
| 모바일 (480px) | 컴팩트 레이아웃 **깨짐 없음**, 더보기 버튼 **접근 가능** |
| 폰 가로 모드 | 입력 영역 축소 + 포커스 시 확장 **정상 동작** |
