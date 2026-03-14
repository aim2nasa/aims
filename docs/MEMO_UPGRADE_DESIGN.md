# 고객 메모 기능 업그레이드 설계서

> **Designer**: Dana (UX/UI)
> **Date**: 2026.03.14
> **Status**: 설계 완료 — 구현 승인 대기

---

## 1. 현재 상태 분석

### 문제점

| 구분 | 현재 | 문제 |
|------|------|------|
| **UI** | 단일 textarea (`customers.memo` 직접 수정) | 시간 흐름 추적 불가, 메모 간 구분 없음 |
| **데이터** | `customer_memos` 컬렉션 + `customers.memo` 동기화 | MemosTab이 `customers.memo`만 직접 편집 → `customer_memos` 컬렉션 미사용 |
| **MCP** | `customers.memo` 텍스트 기반 줄 단위 조작 | 구조화되지 않아 AI가 개별 메모를 정확히 다루기 어려움 |

### 이미 준비된 인프라 (미사용 중)

- `customer_memos` 컬렉션 (개별 문서, 타임스탬프, 작성자 추적)
- `MemoService` (CRUD API 완비)
- `useMemoController` (상태 관리 훅 완비)
- 백엔드 REST API 4개 (GET/POST/PUT/DELETE)

**결론**: 백엔드/서비스/컨트롤러는 이미 완성되어 있으나, **프론트엔드 UI와 MCP 도구만 구식**인 상태.

---

## 2. 설계 원칙

1. **경량**: 이미 준비된 인프라를 활용 — 새 API 없음, 새 컬렉션 없음
2. **시간 기반**: 메모를 독립된 카드로 표시, 날짜/시간 명확히 노출
3. **음성 친화**: MCP 도구가 구조화된 데이터를 반환 → AI가 자연어로 읽어줄 수 있음
4. **Apple 디자인**: AIMS 기존 디자인 시스템 준수

---

## 3. 프론트엔드 UI 설계

### 3-1. MemosTab 리디자인

```
┌─────────────────────────────────────────┐
│ 📝 메모                           + 추가 │  ← 헤더
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ 입력 필드 (placeholder: "메모 추가...")│ │  ← 새 메모 입력 (+ 클릭 시 나타남)
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
| **메모 추가** | 헤더의 `+` 버튼 → 입력 영역 토글 → 내용 입력 → Enter 또는 저장 버튼 |
| **메모 수정** | `⋯` 메뉴 → "수정" → inline 편집 모드 → Enter 또는 저장 |
| **메모 삭제** | `⋯` 메뉴 → "삭제" → AppleConfirmModal 확인 |
| **날짜 구분** | 같은 날짜의 메모는 하나의 날짜 헤더 아래 그룹핑 |
| **시간 표시** | 각 메모 좌측에 `HH:mm` 형식으로 시간 표시 |
| **스크롤** | 메모가 많을 경우 영역 내 스크롤 (최신순 정렬, 위가 최신) |
| **빈 상태** | "아직 메모가 없습니다" + 부드러운 안내 텍스트 |

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
```

---

## 4. MCP 도구 업그레이드

### 4-1. 현재 → 변경

MCP 도구를 `customer_memos` 컬렉션 기반으로 전환.

| 도구 | 현재 | 변경 |
|------|------|------|
| `add_customer_memo` | `customers.memo` 텍스트 append | `customer_memos` 컬렉션에 INSERT + `customers.memo` 동기화 |
| `list_customer_memos` | `customers.memo` 텍스트 반환 | `customer_memos` 조회 → 구조화된 JSON 반환 |
| `delete_customer_memo` | 줄 번호/패턴으로 텍스트 조작 | `memoId` 또는 `contentPattern`으로 문서 DELETE + 동기화 |
| **NEW** `update_customer_memo` | 없음 | `memoId` + `content`로 메모 수정 |
| **NEW** `search_customer_memos` | 없음 | 특정 고객 또는 전체 고객 메모 검색 (키워드 기반) |

### 4-2. 음성 시나리오 (MCP 대화 예시)

#### 메모 추가 (음성 입력)
```
설계사: "김영희 고객에게 메모 남겨줘. 오늘 전화해서 변액보험 수익률 설명했고,
        다음 주 수요일에 만나기로 했어."
AI:     add_customer_memo 호출 →
        "김영희 고객에게 메모를 남겼습니다. (2026.03.14 14:30)"
```

#### 메모 조회 (음성 출력)
```
설계사: "김영희 고객 메모 읽어줘"
AI:     list_customer_memos 호출 →
        "김영희 고객의 메모입니다.
         오늘 오후 2시 30분: 전화해서 변액보험 수익률 설명, 다음 주 수요일 미팅 예정.
         어제 오전 9시 15분: 자녀 학자금 보험 문의, 목요일 방문 예정.
         총 2건의 메모가 있습니다."
```

#### 메모 검색
```
설계사: "다음 주 미팅 예정인 고객 메모 찾아줘"
AI:     search_customer_memos({ query: "미팅 예정" }) 호출 →
        "미팅 관련 메모가 2건 있습니다.
         김영희: 다음 주 수요일 미팅 예정 (오늘 기록)
         박철수: 3월 18일 사무실 방문 예정 (어제 기록)"
```

#### 메모 삭제
```
설계사: "김영희 고객 어제 메모 삭제해줘"
AI:     delete_customer_memo 호출 →
        "김영희 고객의 어제(2026.03.13) 메모를 삭제했습니다.
         '연간보고서 수령. 변액보험 수익률 하락 안내함.'"
```

### 4-3. MCP 응답 형식 (구조화)

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
  "total": 2
}
```

이 구조화된 응답을 AI가 자연어로 변환하여 음성으로 읽어줄 수 있음.

---

## 5. 데이터 흐름

### Single Source of Truth: `customer_memos` 컬렉션

```
[프론트엔드 MemosTab]  ──REST API──►  [customer_memos 컬렉션]
                                              │
[MCP 도구]  ──────────직접 조회──►             │
                                              ▼
                                    [customers.memo 동기화]
                                    (하위 호환 + 텍스트 검색용)
```

- **읽기/쓰기**: 항상 `customer_memos` 컬렉션 기준
- **동기화**: CUD 작업 후 `syncCustomerMemoField()` 호출 → `customers.memo` 갱신
- **하위 호환**: `customers.memo` 필드는 유지 (기존 검색/표시 호환)

---

## 6. 구현 범위

### Phase 1: 프론트엔드 MemosTab 리디자인 (핵심)

| 작업 | 파일 | 설명 |
|------|------|------|
| MemosTab 재구현 | `MemosTab.tsx` | `useMemoController` 연결, 카드형 UI |
| CSS 재작성 | `MemosTab.css` | 날짜 그룹, 시간 라벨, 카드 스타일 |
| 날짜 그룹핑 | `MemosTab.tsx` 내 | `created_at` 기준 날짜별 그룹 |

**변경 없는 파일**: `memoService.ts`, `useMemoController.ts`, 백엔드 REST API — 모두 그대로 사용.

### Phase 2: MCP 도구 업그레이드

| 작업 | 파일 | 설명 |
|------|------|------|
| MCP 도구 전환 | `memos.ts` | `customer_memos` 컬렉션 기반으로 전환 |
| `update_customer_memo` 추가 | `memos.ts` | 메모 수정 도구 |
| `search_customer_memos` 추가 | `memos.ts` | 전체 고객 메모 검색 도구 |
| 도구 등록 | `tools/index.ts` | 새 도구 등록 |

### 구현하지 않는 것

- 태그/카테고리 시스템 (과도한 복잡성)
- 메모 고정(pin) 기능 (우선순위 낮음)
- 메모 알림/리마인더 (별도 기능으로 분리)
- 이미지/파일 첨부 (현재 불필요)
- 메모 공유 (단일 설계사 사용)

---

## 7. 리스크 및 고려사항

| 항목 | 대응 |
|------|------|
| `customers.memo` 기존 데이터 | 마이그레이션 스크립트 이미 존재 (`migrate-memos.js`). 기존 텍스트 → `customer_memos` 변환 가능 |
| MCP 하위 호환 | `customers.memo` 동기화 유지 → chatService 기존 동작 영향 없음 |
| 대량 메모 성능 | `customer_memos`에 `customer_id` 인덱스 확인 필요 (이미 있을 가능성 높음) |
| 음성 입력 품질 | AI가 자연어를 정리하여 저장 → 사용자가 음성으로 말해도 깔끔한 메모 생성 |
