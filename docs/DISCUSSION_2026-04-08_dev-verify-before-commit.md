# dev 검증 → 커밋 프로세스 개선

**날짜:** 2026-04-08
**배경:** #8 작업에서 dev 검증 없이 커밋/머지하여 빈 드롭다운이 prd에 반영될 뻔한 사고 발생

## 문제

### 기존 프로세스
```
코드 수정 → Gini 검수 → 커밋 → dev 검증 → 머지
```

**문제점:**
- 검증되지 않은 코드가 커밋됨
- dev 검증 실패 시 수정 커밋을 또 만들어야 함 → 시간/노동 낭비
- 게이트(`.dev-verified`)가 머지 시점에만 있어서, 커밋은 자유롭게 가능했음

### 실제 사고 사례 (#8, 2026-04-08)
1. Admin 파싱 설정 페이지에 "문서 요약/분류" 모델 선택 UI 추가
2. dev 검증 없이 커밋 → main 머지 → 드롭다운이 비어있음 발견
3. fallback 수정 커밋을 추가로 만들어야 했음
4. 방금 만든 "dev → prd" 프로세스를 즉시 위반

## 결정

### 개선된 프로세스
```
코드 수정 → dev 검증 → .dev-verified 게이트 생성 → Gini 검수 → 커밋 → 머지
```

**핵심 원칙:** 검증된 코드만 커밋한다.

### 게이트 위치 변경

| | 기존 | 개선 |
|---|---|---|
| `.dev-verified` 체크 | `pre_merge_gate.py` (머지 시점) | `pre_commit_review.py` (커밋 시점) |
| 효과 | 머지만 차단 (커밋은 자유) | 커밋 자체를 차단 |

### 근거
- 로컬 dev 서버(localhost)에서 검증하므로 커밋 없이도 코드 확인 가능
- 검증 실패 시 커밋 자체가 없으므로 되돌릴 것도 없음
- 커밋 = "검증 완료된 코드"라는 의미가 보장됨

## 영향 범위

### 스킬 변경
1. **`/compact-fix`** — Phase 순서: dev 검증(Phase 3) → 커밋(Phase 4)
2. **`/ace-process`** — ACE 4/6(검증) → 커밋 순서 명시
3. **`/bug`** — compact-fix 기반이므로 자동 적용

### Hook 변경
4. **`pre_commit_review.py`** — `.dev-verified` 게이트 체크 추가
5. **`pre_merge_gate.py`** — 제거 (커밋에서 이미 검증, 중복 불필요)

### dev 서버 정보
| 서비스 | URL |
|--------|-----|
| AIMS 메인 (aims-uix3) | `https://localhost:5177` |
| AIMS Admin (aims-admin) | `http://localhost:5178` |

## 게이트/하네스 구조

```
게이트 (조건):     .dev-verified 마커 파일
하네스 (강제장치): pre_commit_review.py hook (settings.json에서 등록)

코드 수정
  ↓
dev 검증 PASS → touch .dev-verified
  ↓
git commit → hook이 .dev-verified 확인
  ├─ 있음 → 커밋 통과 (마커 삭제)
  └─ 없음 → 커밋 차단: "dev 검증을 먼저 완료하세요"
  ↓
git merge main → 별도 게이트 불필요 (커밋 시 이미 검증됨)
```
