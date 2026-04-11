# 문서 일괄등록 — 폴더 매핑 로직 재설계 (명시적 인식 기반)

- **일자**: 2026-04-11
- **이슈**: aim2nasa/aims#67
- **브랜치**: `feat/folder-matching-improvement` (main에서 재시작)
- **프로세스**: Compact Fix

---

## 1. 배경

1차 재설계(폐기)가 재귀 트리 + 3-state + 자동 매칭 + 형제 추천 + container 배지를 도입했으나 사용자 테스트 결과 "너무 복잡하고 지저분하다"는 결론. 전면 재설계.

사용자 요구:
1. **극도로 심플**
2. **논리적 모순 없음**
3. **폴더가 누구에게 매핑되는지 명확**

## 2. 설계 철학 — 명시적 인식 강제

자동 매핑을 배제한 것은 효율 희생이 아니라 **의도된 UX**. 사용자가 각 폴더의 데이터가 누구에게 매핑되는지를 매번 직접 인식·결정하게 하여, 자동 매칭이 틀렸을 때 사용자가 모르고 업로드되는 사고를 구조적으로 차단한다.

## 3. 핵심 규칙 (5개)

### R1. 폴더 상태 = 3가지 배타
| 상태 | 정의 | 표시 |
|---|---|---|
| **직접매핑** | 사용자가 명시적으로 고객 지정 | `→ 고객명  [해제]` |
| **상속** | 조상 폴더 중 하나가 직접매핑됨 | `📎 고객명` |
| **미매핑** | 자기도 조상도 매핑 없음 | `[고객 지정 ▾]` |

**불변식**: 루트→F 경로상 직접매핑 폴더는 **최대 1개**.

### R2. 매핑 = "고객 지정" 버튼 한 번
- 미매핑 폴더 행의 `[고객 지정]` 클릭 → 드롭다운 열림
- 드롭다운은 **폴더명 기반 유사도 점수로 고객 정렬** (main의 `extractTokens`/`getRelevanceScore` 로직 재사용)
- 사용자가 명시적으로 클릭해 확정. 자동 적용/Enter 단축 없음
- 드롭 직후 모든 폴더는 미매핑 상태로 시작 (자동 매핑 없음)

### R3. 부모·자식 직접매핑 공존 금지
- **자식(자손 포함)에 직접매핑 존재 시 부모 매핑 버튼 비활성** + Tooltip 안내
- **부모가 직접매핑되면 자식은 상속 상태** → `[고객 지정]` 버튼 자체가 나타나지 않음
- 한 체인에 직접매핑 2개가 공존하는 상태는 원천 불가능

### R4. 업로드 단위 = 직접매핑된 폴더만
- 직접매핑된 폴더의 모든 하위 파일이 해당 고객 문서로 업로드
- 상속 폴더는 조상의 업로드에 포함되므로 별도 업로드 단위 아님
- 미매핑 폴더는 업로드되지 않음

### R5. 해제는 즉시, 확인 없음
- `[해제]` 클릭 → 미매핑 전환 → 하위 상속도 즉시 풀림 → 자식들 `[고객 지정]` 버튼 복귀
- 되돌리고 싶으면 다시 매핑

### 트리 구조 불변
매핑 상태 전이 어느 단계에서도 트리 구조(펼침·들여쓰기·순서)는 절대 변형되지 않는다.

## 4. 추천 로직 (main에서 재사용, 손대지 않음)

`MappingPreview.tsx:186-230` (main 기준):

### `extractTokens(folderName)`
- `[.\-_,\s()\[\]]` 구분자로 분리
- 후행 숫자/영문 제거 (`김지현OK` → `김지현`, `20240926` → `''`)
- 최소 2글자 이상 토큰만 유지

예: `김태호.김지현OK` → `[김태호, 김지현]`

### `getRelevanceScore(customerName, folder, tokens)`
4단계 점수 (높을수록 상단):

| 점수 | 조건 | 예 |
|---|---|---|
| 300+ | 고객명 === 토큰 (완전 일치) | 토큰 `홍길동` ↔ 고객 `홍길동` |
| 200+ | 폴더명 전체에 고객명 포함 | 고객 `김태호` ⊂ 폴더 `김태호.김지현OK` |
| 200+ | 토큰에 고객명 포함 | 토큰 `홍길동2024` ⊃ 고객 `홍길동` |
| 100+ | 고객명에 토큰 포함 | 고객 `주식회사마리치` ⊃ 토큰 `마리치` |
| 1~50 | 고유 글자 교집합 비율 ≥ 50% | `마리치` vs `마라치` (67%) |

### 정렬
```
base.sort((a, b) => getRelevanceScore(b) - getRelevanceScore(a))
```

→ `홍길동_2024` 폴더에서 드롭다운 열면 **홍길동 고객이 자동으로 상단**.

### 형제 추천 (선택)
1차 재설계의 형제 폴더 고객 우선 로직은 폐기. 점수 기반 정렬이 동일 효과 + 더 일반적.

## 5. 파생 결정 사항

### D1. 빈 폴더(파일 0개) 처리
**표시 + 매핑 허용 + 업로드 단위에서 제외** (자식에 파일이 있는 경우 탐색 가지로 필요)

### D2. 동명이인 고객 구분
드롭다운에서 **생년월일 병기**. 없으면 전화번호 마스킹, 그것도 없으면 `#1 #2` 번호.

### D3. 직접매핑 폴더의 고객 변경
고객 이름 부분 재클릭 → 드롭다운 재오픈 → 다른 고객 선택. 해제 단계 불필요.

### D4. 폴더명 ↔ 고객명 느슨 매칭
main의 `extractTokens`/`getRelevanceScore` 로직 그대로 사용. 손대지 않음.

### D5. Tooltip 메시지 형식
`"하위 '{첫번째}', '{두번째}' 외 N개 폴더에 매핑이 있습니다. 먼저 해제하세요"`. 3개 이하면 전부 나열.

### D6. 상속 폴더 통계
- 각 행: 자기 직하 파일 개수·크기
- 직접매핑 폴더: 자기 + 전체 하위 합계 병기

### D7. 상단 요약
```
업로드 대상: N개 폴더 · M명 고객 · P개 파일 · Q MB
(미매핑 R개는 업로드되지 않습니다)
```
중립 안내 톤.

## 6. 타입 재설계

```ts
export type FolderMappingState = 'direct' | 'inherited' | 'unmapped'

export interface FolderMapping {
  folderPath: string            // 전체 경로 (트리 unique key)
  folderName: string            // leaf name
  parentFolderPath: string | null
  state: FolderMappingState
  customerId: string | null     // direct or inherited
  customerName: string | null
  inheritedFromPath: string | null  // state=inherited일 때 조상 경로
  directFiles: File[]           // 자기 직하 파일만
  directFileCount: number
  directTotalSize: number
  subtreeFiles: File[]          // 자기 + 전체 하위 파일 (업로드 단위일 때만 의미)
  subtreeFileCount: number
  subtreeTotalSize: number
}
```

**제거**: `matched`, `isAutoMatched`, `state: 'matched'|'container'|'unmatched'` 등 1차 재설계 필드.

## 7. 수정 범위

| 파일 | 변경 |
|---|---|
| `frontend/aims-uix3/src/features/batch-upload/types/index.ts` | `FolderMapping` 재정의 |
| `frontend/aims-uix3/src/features/batch-upload/utils/customerMatcher.ts` | 자동 매칭 함수 제거. 트리 빌드 + 상태 계산 + 공존 금지 검증 유틸 신설. 추천 로직은 MappingPreview에 그대로 유지 |
| `frontend/aims-uix3/src/features/batch-upload/components/MappingPreview.tsx` | 3상태 렌더, 공존 금지 가드, 해제 즉시 반영. `extractTokens`/`getRelevanceScore`/`filteredCustomers` 그대로 보존 |
| `frontend/aims-uix3/src/features/batch-upload/components/MappingPreview.css` | 3상태 스타일. 배지/체크박스/칩 스타일 제거 |
| `frontend/aims-uix3/src/features/batch-upload/BatchDocumentUploadView.tsx` | folderMappings 흐름 단순화 |
| `frontend/aims-uix3/src/features/batch-upload/utils/__tests__/customerMatcher.test.ts` | 3상태 전이, 공존 금지 불변식 테스트 |
| `frontend/aims-uix3/src/features/batch-upload/__tests__/MappingPreview.test.tsx` | 3상태 렌더, 공존 가드, 해제 즉시성 테스트 |

## 8. 검증 계획 (Phase 3)

| 시나리오 | 기대 |
|---|---|
| 드롭 직후 | 모든 폴더 미매핑. 요약 "0개 폴더" |
| 폴더명 `홍길동_2024`에 "고객 지정" 클릭 | 드롭다운 상단에 홍길동 고객 자동 정렬 |
| `정승우`에 정승우 매핑 | 직접매핑. 요약 "1개 폴더" |
| `2024_자료`에 한울컨설팅 매핑 | 자식 전체 상속 상태. 업로드 단위 1개 |
| 상속 자식에 "고객 지정" 시도 | 버튼 없음 |
| `2024_자료` 해제 | 자식 미매핑 복귀 |
| 자식 개별 매핑 후 부모 매핑 시도 | 버튼 비활성 + Tooltip |
| 직접매핑 행 고객명 재클릭 | 드롭다운 재오픈, 다른 고객 선택 가능 |
| 동명이인 김철수 2명 | 드롭다운에 생년월일 병기 |
| 빈 폴더 | 표시됨, 매핑 가능하나 업로드는 자식 파일 있을 때 유효 |

## 9. Out of Scope

- 백엔드 변경
- 업로드 파이프라인 자체
- 폴더 선택 다이얼로그 (webkitdirectory/showDirectoryPicker)
- 파일 단위 매핑 (폴더 단위 한정)
