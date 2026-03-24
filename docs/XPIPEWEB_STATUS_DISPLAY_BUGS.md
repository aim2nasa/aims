# xPipeWeb 상태 표시 버그 보고서

> 작성일: 2026-03-25
> 발견 경위: Phase 3 UI 개선 작업 중 사용자 실물 테스트에서 발견
> 상태: 코드 수정 완료, 검증 대기

---

## 배경

Phase 3 (어댑터 설정 UI) 구현 후 실제 브라우저에서 테스트한 결과, **파이프라인 상태 표시 전반에 걸친 버그**가 발견됨. Playwright E2E 테스트에서는 DOM 요소 존재 여부만 확인하고 **실제 표시 값과 색상을 검증하지 않아** 이 버그들을 놓침.

### 근본 원인

xPipeWeb 프론트엔드(app.js)에 **두 가지 상태 데이터 소스**가 존재:

| 데이터 소스 | 용도 | 키 |
|-----------|------|-----|
| `stages_detail` | 이벤트 트래킹 (시작/완료 시점 기록) | `doc.stages_detail` |
| `stages_data` | **실제 파이프라인 결과** (status, input, output) | `doc.stages_data` |

UI가 `stages_detail`만 참조하고 `stages_data`를 무시하면서, 실제 완료/스킵된 스테이지가 잘못된 상태로 표시됨.

---

## 버그 목록

### BUG-1: 파이프라인 도트 색상 오류 (Major)

**증상:** 실제로 완료된 스테이지(텍스트추출, 임베딩 등)가 회색(pending)으로 표시됨.

**원인:** `_renderDotPipeline()`이 `stages_detail[name].status`만 참조. `stages_detail`에 이벤트가 기록되지 않은 스테이지는 무조건 `pending`으로 fallback.

**기대 동작:**
- 완료 → 녹색 (done)
- 스킵 → 회색 취소선 (skipped)
- 에러 → 빨간색 (error)
- 처리중 → 노란색 (running)
- 대기 → 회색 (pending)

**수정:** `stages_data.status`를 우선 참조, `stages_detail.status`는 fallback.

```js
// 수정 전
let cls = 'pending';
if (detail.status === 'completed') cls = 'done';

// 수정 후
const effectiveStatus = stageData.status || detail.status || '';
if (effectiveStatus === 'completed') cls = 'done';
```

---

### BUG-2: 스테이지 클릭 시 "대기 중" 오표시 (Major)

**증상:** 완료된 문서의 스테이지 도트를 클릭하면 아코디언에 "업로드 (Ingest) 대기 중"이 표시됨. 모든 스테이지가 "대기 중"으로 나옴.

**원인:** `renderStageDetail()`에서 `const status = detail.status || 'pending'` — `stages_detail`에 status가 없으면 무조건 `'pending'`으로 fallback. `stages_data`에는 실제 status(`completed`, `skipped` 등)가 있지만 참조하지 않음.

**수정:** `data.status || detail.status || 'pending'` 우선순위 변경.

```js
// 수정 전
const status = detail.status || 'pending';

// 수정 후
const status = data.status || detail.status || 'pending';
```

---

### BUG-3: 분류/감지 컬럼 "-" 표시 (Major)

**증상:** 어댑터 없이 파이프라인 실행 시, 분류/감지 컬럼이 `-`로만 표시되어 **처리가 안 된 것처럼 보임**. 실제로는 정상적으로 스킵된 것.

**원인 1:** `result.stages_skipped` 배열에 `classify`/`detect_special`이 포함되지 않음 (백엔드 이슈 — 해당 스테이지는 `stages_data`에 `status: "skipped"`로 기록되지만 `stages_skipped` 배열에는 누락).

**원인 2:** 프론트엔드가 `stages_skipped` 배열만 참조하고 `stages_data.status`를 체크하지 않음.

**수정:** `stages_skipped` 배열 + `stages_data.status === 'skipped'` 이중 참조. "스킵" 텍스트 + 툴팁 표시.

```js
// 수정 후
const classifySkipped = (doc.result.stages_skipped || []).includes('classify')
  || (doc.stages_data?.classify?.status === 'skipped');
```

---

### BUG-4: skipped 스테이지 상세에 사유 미표시 (Minor)

**증상:** skipped된 스테이지를 클릭해도 "대기 중"으로 표시됨. 스킵 사유("어댑터 미설정 — 분류 설정 없음")가 보이지 않음.

**원인:** `renderStageDetail()`에 `skipped` status 분기가 없었음. `stages_data`에 `reason` 필드가 있지만 표시 로직 미구현.

**수정:** `skipped` 분기 추가 + `data.reason` 표시.

---

### BUG-5: skipped 스테이지 도트 미표시 (Minor → 수정 방향 변경)

**증상:** 초기 구현에서 skipped 스테이지를 파이프라인 도트에서 **아예 숨겨버림** (`if (skipped.includes(name)) continue`). 어떤 스테이지가 건너뛰어졌는지 알 수 없음.

**수정:** 숨기지 않고 취소선 스타일로 표시.

```css
.inline-stage.skipped {
  background: rgba(0, 0, 0, 0.03);
  color: var(--text-muted, #999);
  text-decoration: line-through;
}
```

---

## 검증 실패 원인 분석

### Playwright E2E 테스트가 이 버그들을 놓친 이유

1. **DOM 존재 여부만 확인** — "스킵" 텍스트가 있는지, `skipped` class가 있는지만 체크. 다른 스테이지의 `pending` class가 `done`이어야 하는지는 검증 안 함.

2. **스테이지 클릭 테스트 미실시** — 도트를 클릭하여 아코디언 상세가 올바른지 전혀 검증하지 않음.

3. **시각적 검증 미흡** — 스크린샷을 캡처했지만 해상도가 낮아 실제 색상/텍스트를 육안으로 확인할 수 없었음.

### 향후 E2E 테스트 개선 방향

- 각 스테이지 도트의 **class 값을 개별 검증** (done/skipped/pending/error)
- 도트 클릭 → 아코디언 상세의 **상태 텍스트 검증** (완료/스킵/대기)
- headful 모드로 실행하여 **실제 화면을 육안 확인**

---

## 수정 파일

| 파일 | 수정 내용 |
|------|----------|
| `app.js` | `_renderDotPipeline`: effectiveStatus 우선순위 변경 |
| `app.js` | `renderStageDetail`: data.status 우선 참조 + skipped 분기 추가 |
| `app.js` | 분류/감지 컬럼: stages_data.status 이중 참조 |
| `style.css` | `.inline-stage.skipped` 스타일 추가 |

---

## 현재 상태

- 코드 수정: 완료
- Playwright headful 검증: **완료** (18/18 PASS — 도트 class, 클릭 상세, 컬럼 텍스트, 취소선)
- Regression 테스트: **완료** (`test_adapter_none_classify_detect_stage_data_skipped` 추가, 323 passed)
- 커밋: 완료
