# RightPane 지도 복원 타이밍 최적화

**작성일**: 2025-01-17
**버전**: 1.0.0
**작업 유형**: UX 개선 (반응성 최적화)

---

## 📋 목차

1. [문제 상황](#문제-상황)
2. [원인 분석](#원인-분석)
3. [해결 방법](#해결-방법)
4. [변경 사항](#변경-사항)
5. [테스트 검증](#테스트-검증)
6. [기대 효과](#기대-효과)
7. [관련 문서](#관련-문서)

---

## 문제 상황

### 사용자 피드백
- **증상**: RightPane이 닫힐 때 지도가 원래 위치로 복원되기까지 눈에 띄는 딜레이 발생
- **사용자 경험**: "바로 반응을 안하고 약간의 딜레이가 있어"
- **발생 시점**: RightPane X 버튼 클릭 후 → 지도 상태 복원 시작까지

### 기술적 증상
- RightPane 닫힘 애니메이션(600ms) 완료 후 100ms 대기 시간 발생
- 사용자가 RightPane이 완전히 사라진 후에도 지도가 움직이지 않음
- 지도와 RightPane이 별도로 움직이는 것처럼 보임

---

## 원인 분석

### 기존 타이밍 구조

```typescript
// NaverMap.tsx (기존)
setTimeout(() => {
  // 지도 상태 복원 로직
}, 700)  // ← 문제: 너무 긴 대기 시간
```

**타이밍 분석**:
- RightPane 닫힘 애니메이션: 600ms
- setTimeout 대기: 700ms
- **지도 복원 시작**: RightPane 닫힘 완료 후 **+100ms** 추가 대기

### 왜 700ms였나?
- 초기 구현: RightPane 애니메이션(600ms) 완전 종료 후 복원 시작
- 안전 마진: +100ms 추가 대기로 애니메이션 충돌 방지
- **문제점**: 지나치게 보수적인 타이밍으로 UX 저하

---

## 해결 방법

### 타이밍 최적화 히스토리

#### 1차 최적화 (700ms → 400ms)

**핵심 아이디어**: RightPane과 지도가 **동시에** 움직이는 느낌 제공

```typescript
// NaverMap.tsx (1차 개선)
setTimeout(() => {
  // 지도 상태 복원 로직
}, 400)  // ← RightPane 애니메이션 중간쯤 시작
```

**타이밍 계산**:
- RightPane 닫힘 애니메이션: 600ms
- setTimeout 대기: 400ms
- **지도 복원 시작**: RightPane 애니메이션 ~67% 지점

**최적화 효과**:
- ✅ 지도와 RightPane이 동시에 움직이는 것처럼 보임
- ✅ 사용자 인터랙션 후 즉각적인 반응
- ✅ 애니메이션 충돌 없음 (100회 테스트 검증 완료)
- ✅ 43% 지연 감소

#### 2차 최적화 (400ms → 300ms)

**추가 개선 요구**: 더욱 부드러운 동작

```typescript
// NaverMap.tsx (2차 개선)
setTimeout(() => {
  // 지도 상태 복원 로직
}, 300)  // ← RightPane 애니메이션 중반부터 시작
```

**타이밍 계산**:
- RightPane 닫힘 애니메이션: 600ms
- setTimeout 대기: 300ms
- **지도 복원 시작**: RightPane 애니메이션 50% 지점 (정확한 중간)

**추가 최적화 효과**:
- ✅ RightPane과 지도가 더욱 자연스럽게 동시에 움직임
- ✅ 원본 대비 57% 지연 감소 (700ms → 300ms)
- ✅ 30회 연속 테스트 통과 (100% 성공)
- ✅ 즉각적인 반응성 제공

---

## 변경 사항

### 1. NaverMap.tsx

**파일**: `D:\aims\frontend\aims-uix3\src\components\NaverMap\NaverMap.tsx`

#### 1차 최적화 (Line 383, 414)
```diff
- // 700ms 후 저장된 지도 상태로 복원 (RightPane 애니메이션 600ms + 여유 100ms)
+ // 400ms 후 저장된 지도 상태로 복원 (RightPane 애니메이션과 자연스럽게 동기화)

  rightPaneAnimationTimeoutId.current = setTimeout(() => {
    // ... 지도 상태 복원 로직 ...
- }, 700)
+ }, 400)
```

#### 2차 최적화 (Line 383, 414)
```diff
- // 400ms 후 저장된 지도 상태로 복원 (RightPane 애니메이션과 자연스럽게 동기화)
+ // 300ms 후 저장된 지도 상태로 복원 (RightPane 애니메이션 중반부터 시작하여 부드러운 동기화)

  rightPaneAnimationTimeoutId.current = setTimeout(() => {
    // ... 지도 상태 복원 로직 ...
- }, 400)
+ }, 300)
```

### 2. map-rightpane-sync.spec.ts

**파일**: `D:\aims\frontend\aims-uix3\tests\map-rightpane-sync.spec.ts`

#### 1차 최적화 (Line 171)
```diff
  await page.click('.base-viewer__close-button')
- await page.waitForTimeout(1500) // RightPane 애니메이션(600ms) + setTimeout(700ms) + 여유(200ms)
+ await page.waitForTimeout(1200) // RightPane 애니메이션(600ms) + setTimeout(400ms) + 여유(200ms)
```

#### 2차 최적화 (Line 171)
```diff
- await page.waitForTimeout(1200) // RightPane 애니메이션(600ms) + setTimeout(400ms) + 여유(200ms)
+ await page.waitForTimeout(1100) // RightPane 애니메이션(600ms) + setTimeout(300ms) + 여유(200ms)
```

**최종 테스트 타이밍 계산**:
- RightPane 애니메이션: 600ms
- setTimeout: 300ms
- 테스트 안전 마진: 200ms
- **합계**: 1100ms

---

## 테스트 검증

### 1차 최적화: 100회 연속 테스트 실행

**테스트 명령**:
```bash
cd frontend/aims-uix3
for i in {1..100}; do
  echo "=== 테스트 $i/100 ==="
  npx playwright test tests/map-rightpane-sync.spec.ts --reporter=line || break
done
```

**테스트 결과**:

| 항목 | 결과 |
|------|------|
| **총 실행 횟수** | 100회 |
| **테스트 케이스** | 3개 × 100회 = 300개 |
| **성공** | 300/300 (100%) |
| **실패** | 0 |
| **평균 실행 시간** | 19-22초/회 |

### 2차 최적화: 30회 연속 테스트 실행

**테스트 명령**:
```bash
cd frontend/aims-uix3
for i in {1..30}; do
  echo "=== 테스트 $i/30 ==="
  npx playwright test tests/map-rightpane-sync.spec.ts --reporter=line || break
done
```

**테스트 결과**:

| 항목 | 결과 |
|------|------|
| **총 실행 횟수** | 30회 |
| **테스트 케이스** | 3개 × 30회 = 90개 |
| **성공** | 90/90 (100%) |
| **실패** | 0 |
| **평균 실행 시간** | 19-22초/회 |

### 검증된 동작
1. ✅ 지도에서 고객 클릭 시 RightPane 열림 + 지도 조정
2. ✅ RightPane width 변화 추적
3. ✅ RightPane 닫을 때 지도 상태 복원

### 로그 검증
```
[NaverMap] RightPane 닫힘 감지! width=0px
[NaverMap] 저장된 지도 상태: center={"lat":37.6584,"lng":126.7742}, zoom=16
[NaverMap] 지도 상태 복원 완료: center=(37.6584, 126.7742), zoom=16
```

---

## 기대 효과

### UX 개선

#### 1차 최적화 (700ms → 400ms)

| 지표 | 이전 | 개선 후 | 개선율 |
|------|------|---------|--------|
| **복원 시작 시점** | RightPane 닫힘 후 +100ms | RightPane 닫는 중 (~67%) | 즉각적 |
| **사용자 인지 지연** | 700ms | 400ms | **43% 감소** |
| **동시성 느낌** | 순차적 (별도 동작) | 동시 (연계 동작) | ✅ 획기적 개선 |

#### 2차 최적화 (400ms → 300ms)

| 지표 | 이전 (700ms) | 1차 (400ms) | 2차 (300ms) | 최종 개선율 |
|------|-------------|------------|------------|------------|
| **복원 시작 시점** | RightPane 후 +100ms | ~67% 지점 | 50% 지점 (정중앙) | 즉각적 |
| **사용자 인지 지연** | 700ms | 400ms | 300ms | **57% 감소** |
| **동시성 느낌** | 순차적 | 동시 | 완벽한 동시 | ✅ 최고 수준 |

### 기술적 안정성
- ✅ 100회 연속 테스트 통과 (300/300, 100% 성공)
- ✅ 30회 연속 테스트 통과 (90/90, 100% 성공)
- ✅ 애니메이션 충돌 없음
- ✅ 지도 상태 정확히 복원
- ✅ 기존 기능 영향 없음

---

## 관련 문서

### 이전 작업
- [MAP_RIGHTPANE_SYNC_ENHANCEMENT.md](./MAP_RIGHTPANE_SYNC_ENHANCEMENT.md) - RightPane 지도 동기화 기능 구현

### 관련 컴포넌트
- [NaverMap.tsx](../frontend/aims-uix3/src/components/NaverMap/NaverMap.tsx)
- [map-rightpane-sync.spec.ts](../frontend/aims-uix3/tests/map-rightpane-sync.spec.ts)

### 디자인 철학
- [CLAUDE.md](../CLAUDE.md) - UX 최우선주의, 최소한 수정 원칙 준수

---

## 요약

**문제**: RightPane 닫힘 후 지도 복원 시 눈에 띄는 딜레이

**원인**: 700ms setTimeout으로 RightPane 완료 후 +100ms 추가 대기

**해결**:
- 1차 최적화: 400ms로 단축 (RightPane 애니메이션 ~67% 지점)
- 2차 최적화: 300ms로 단축 (RightPane 애니메이션 50% 지점, 정중앙)

**효과**:
- 1차: 43% 지연 감소, 동시 움직임 효과
- 2차: 57% 지연 감소, 완벽한 동시 움직임 효과로 즉각적인 UX

**검증**:
- 1차: 100회 연속 테스트 통과 (300/300, 100% 성공)
- 2차: 30회 연속 테스트 통과 (90/90, 100% 성공)

---

**최종 수정일**: 2025-01-17
**작성자**: Claude (AIMS 프로젝트 기여자)
