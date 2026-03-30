# ACE 보고서: 고객별 문서함 파일명 컬럼 최소 폭 보장

**일시:** 2026-03-30
**요청:** CP에서 파일명 컬럼이 RP 열림/브라우저 축소 시 가장 먼저 줄어드는 문제 수정

---

## 결정의 맥락

### 왜 JS 동적 측정을 선택했나
- CSS만으로는 "가장 긴 파일명 기준 동적 폭 확보" 불가능
- `1fr` 컬럼은 남은 공간만 사용 → CP 축소 시 0에 수렴
- CSS `max-content`도 `overflow: hidden` + `min-width: 0` 조합에서 무력화됨
- 결론: JS로 텍스트 폭 측정 → CSS 변수(`--doc-row-min-width`) 주입 → 행 min-width 설정

### 측정 방법 3번 실패 후 최종 확정
1. **Canvas `measureText`** — 실패. letter-spacing, font-feature-settings 미반영. 실제 렌더링보다 짧게 측정
2. **`scrollWidth` 직접 측정** — 실패. 부모 `overflow: hidden` + `min-width: 0`이 flex child를 축소시켜 scrollWidth도 잘린 값 반환
3. **일시적 스타일 해제 후 scrollWidth** — 실패. `useLayoutEffect` 안에서 reflow 타이밍 불안정
4. **숨겨진 probe `<span>`으로 측정** — 성공. DOM 제약에 완전히 독립적. 실제 폰트 스타일 복제하여 `offsetWidth` 측정

### overflow 체인 문제
- `tree-layout` → `tree-container` → `children` → `document` 4단계 중첩
- `tree-container`에 `overflow: auto`가 독립 스크롤 컨텍스트를 만들어 수평 스크롤 차단
- `children`에 `overflow: hidden`이 콘텐츠를 클리핑
- CSS 사양: `overflow-x: visible` + `overflow-y: auto` 동시 설정 불가 (visible이 auto로 강제 변환)
- **해결**: `tree-layout`이 양방향 스크롤(`overflow: auto`) 담당, `tree-container`/`children`의 overflow 제거

---

## 함정/주의점

### 건드리면 깨지는 것
- `tree-container`에 `overflow` 다시 추가하면 수평 스크롤 즉시 차단됨
- `children`에 `overflow: hidden` 복원하면 동일
- `doc-name-cell`의 `min-width: 0`은 grid item 축소를 허용하는 핵심 — 제거하면 레이아웃 깨짐
- 모바일 CSS에서 `min-width: unset` 빠지면 375px 뷰포트에서 강제 수평 스크롤 발생

### 측정 시 주의
- probe span에 별칭 접두사 `+`(CSS `::before`) 포함 필수 — `textContent`에는 없음
- `useLayoutEffect` 의존성에 `expandedKeys` 필수 — 폴더 펼칠 때 재측정
- 고정 컬럼 합계(480px)와 hover-actions 여유(116px)는 컬럼 폭 변경 시 같이 수정해야 함

---

## 프로세스 교훈

### Mira 검증 실패
Canvas 측정이 부정확했는데, Mira가 프로그래밍적 데이터(`isTruncated=false`)만 보고 PASS 판정.
스크린샷을 육안으로 보고 "파일명이 잘려 보이는가?"를 직접 확인했으면 즉시 FAIL.

**개선**: Mira AGENT.md에 "육안으로 요구사항 만족 확인이 존재 이유" 원칙 추가 (커밋 7b34f708)

### Jude 증거 감사
Mira의 오염된 증거를 Phase B에서 수용, Phase C에서 핵심 AC(파일명 잘림) 대신 사소한 AC(아이콘 색상)만 재실행.

**개선**: ACE SKILL.md에 증거 감사 방식 + 핵심 AC 우선 재실행 규칙 추가 (커밋 7b34f708)
