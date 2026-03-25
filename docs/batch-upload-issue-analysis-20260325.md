# 문서 일괄등록 70/446 멈춤 현상 분석 보고서

> **일시**: 2026-03-25
> **증상**: 446개 파일 일괄등록 시 70개 처리 후 "파일 검증 중..." 상태에서 진행 정지
> **환경**: AIMS v0.551.1, FastAPI 모드 (xPipe 파이프라인)
> **분석**: Claude 초안 → Alex/Gini 1차 리뷰 → 근본 원인 2차 분석 → dev 재현 테스트로 확정
> **상태**: **해결 완료 (dev 검증 통과)**

---

## 해결 결과

### 원인
`useBatchUpload.ts` Line 537: 업로드 시작 시 `setProgress({ currentDuplicate: null })`이 실행되어, 다른 워커가 표시 중인 DuplicateDialog를 강제 언마운트. 10초 자동 스킵 타이머가 소멸되고, `isPausedRef = true`가 영구 유지되어 3개 워커 모두 무한 대기.

### 수정
```diff
- duplicateState: {
-   ...prev.duplicateState,
-   currentDuplicate: null,
- },
```
업로드 시작 시 `duplicateState`를 건드리지 않도록 해당 블록 삭제 (1줄 수정).

### 검증 (dev)
| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| 업로드 결과 | 42/446에서 멈춤 (무한 대기) | **446/446 완료** |
| 성공 | 42개 | **394개** |
| 중복 스킵 | 0개 (다이얼로그 소멸) | **52개** (자동 스킵 정상) |
| 실패 | 0개 | **0개** |
| 소요 시간 | ∞ (멈춤) | **2분 1초** |
| 워커 상태 | 3개 모두 무한 대기 | 3개 모두 정상 종료 (174+127+145) |

### 수정 후 로그 증거
```
[DuplicateDialog] 마운트: 유아영명함.png, 카운트다운 10초 시작
[DuplicateDialog] 자동스킵 실행: 유아영명함.png              ← 10초 후 정상 실행
[handleDuplicateAction] action=skip, applyToAll=true         ← 핸들러 호출됨
[Worker-0] 다이얼로그 결과: action=skip, isPaused 해제       ← 워커 재개
[Worker-2] 일시정지 해제됨 → 재개                            ← 다른 워커도 재개
[Worker-2] applyToAll 적용: action=skip                      ← 이후 중복은 즉시 스킵

[Worker-2] 종료: 이유=할일없음, processed=145, 큐={"completed":394,"skipped":52}
[Worker-0] 종료: 이유=할일없음, processed=174, 큐={"completed":394,"skipped":52}
[Worker-1] 종료: 이유=할일없음, processed=127, 큐={"completed":394,"skipped":52}
[processQueue] 최종큐={"completed":394,"failed":0,"skipped":52}
```

---

## 0. 확정된 근본 원인 (Executive Summary)

### 원인: 업로드 시작 시 `currentDuplicate: null` 설정으로 DuplicateDialog 강제 언마운트

**파일**: `useBatchUpload.ts` **Line 535-538**

```typescript
// Line 525-539: "상태 업데이트 - 업로드 시작" — 모든 워커가 업로드 시작할 때 실행
setProgress((prev) => ({
  ...prev,
  state: 'uploading',
  duplicateState: {
    ...prev.duplicateState,
    currentDuplicate: null,   // ← 이 한 줄이 원인
  },
}))
```

### 멈춤 재현 시퀀스 (dev 로그로 증명)

```
1. Worker-1: 중복 파일 발견 → DuplicateDialog 표시 → isPausedRef = true
2. Worker-2: 이미 해시 계산 중 (isPausedRef 체크 이후 진입) → 해시 완료 → 업로드 시작
3. Worker-2: setProgress({ currentDuplicate: null }) ← Line 537 실행
4. DuplicateDialog: 즉시 언마운트 (남은시간=10초, 자동스킵 미실행)
5. handleDuplicateAction: 호출 안 됨 → duplicateResolverRef 영원히 pending
6. isPausedRef = true 영구 유지
7. Worker-0, Worker-2: 일시정지 루프에서 무한 대기
8. Worker-1: waitForDuplicateDecision Promise 영원히 resolve 안 됨
9. 결과: 3개 워커 모두 영구 정지
```

### 디버깅 로그 증거

```
[Worker-1] 다이얼로그 표시 요청: KakaoTalk_20240411_112918705_01.png
[waitForDuplicateDecision] Promise 생성: file_1774410821154_f7cc5a28
[Worker-0] 일시정지 대기중: isPaused=true, applyToAll=null

[DuplicateDialog] 마운트: 유아영명함.png, 카운트다운 10초 시작
[DuplicateDialog] 언마운트: 유아영명함.png, 남은시간=10초     ← 즉시 언마운트!
[DuplicateDialog] 마운트: 유아영명함.png, 카운트다운 10초 시작  ← React Strict Mode 재마운트
[Worker-2] 해시완료: 포트폴리오_구본미.pdf, 815ms             ← Worker-2가 업로드 시작
[DuplicateDialog] 언마운트: 유아영명함.png, 남은시간=10초     ← Worker-2의 setProgress가 dialog 제거!

[handleDuplicateAction] ← 이 로그 없음! 호출 안 됨!
[자동스킵 실행] ← 이 로그 없음! 타이머 소멸!

[Worker-0] 일시정지 대기중: isPaused=true  ← 영원히 반복
[Worker-2] 일시정지 대기중: isPaused=true  ← 영원히 반복
(Worker-1은 Promise 대기 중 — 로그 없음)
```

### 수정 방법

**Line 535-538 삭제** — 업로드 시작 시 `duplicateState`를 건드리지 않으면 됨:

```typescript
// 수정 전
setProgress((prev) => ({
  ...prev,
  state: 'uploading',
  currentFile: nextFile.fileName,
  currentFolder: nextFile.folderName,
  files: prev.files.map(...),
  duplicateState: {
    ...prev.duplicateState,
    currentDuplicate: null,   // ← 삭제
  },
}))

// 수정 후: duplicateState 제거
setProgress((prev) => ({
  ...prev,
  state: 'uploading',
  currentFile: nextFile.fileName,
  currentFolder: nextFile.folderName,
  files: prev.files.map(...),
}))
```

---

## 1. 현상 요약

| 항목 | 값 |
|------|----|
| 전체 파일 수 | 446개 |
| 서버 도달 파일 | **70개** (DB `files` + Nginx 로그 이중 확인) |
| 서버 에러 | **없음** (70건 전부 HTTP 200) |
| Upload Queue | pending=0, processing=0 (서버 대기 상태) |
| OCR 처리 | 70개 중 정상 진행 |
| 프론트엔드 상태 | "파일 검증 중: 김보성,안영미01.pdf"에서 멈춤 |
| 브라우저 콘솔 에러 | 없음 (unhandled rejection 미표시 가능) |

**결론: 서버는 완전 정상. 프론트엔드가 71번째 요청을 서버에 전송하지 않음.**

---

## 2. 확정된 팩트 (서버 데이터 기준, Gini 검증)

Nginx 접근 로그와 MongoDB 데이터를 교차 분석한 결과:

| 팩트 | 데이터 | 의미 |
|------|--------|------|
| Nginx shadow 호출 수 | **정확히 70회** | 프론트엔드가 70번만 요청 전송 |
| 모든 응답 코드 | **HTTP 200 × 70** | 서버 오류/타임아웃 0건 |
| 모든 응답 크기 | **182바이트 × 70** | 동일한 성공 응답 |
| 처리 구간 | **11:41:46 ~ 11:42:13 (27초)** | 3워커 × ~9초 = 정상 속도 |
| 69→70번째 간격 | **~5초 (평균 386ms 대비 13배)** | 마지막에 워커 1개만 남음 |
| 11:42:13 이후 요청 | **없음** | 프론트엔드가 멈춤 |
| FastAPI 프로세스 | 메모리 437MB, 재시작 0회 | 서버 프로세스 정상 |

---

## 3. 근본 원인 분석 — "왜 에러가 발생하는가"

### 관점 전환

기존 1차 분석은 "에러 발생 후 핸들링이 안 된다"(try-catch 부재)에 초점을 맞췄습니다.
이것은 **사후 처리(방어책)**이지 **근본 원인이 아닙니다.**

근본 원인 = "왜 70개 처리 후 프론트엔드가 멈추는가"

### 3-1. [ROOT CAUSE] 워커 조기 종료 — pending 파일 탐색 실패

> Gini 발견, 서버 타임스탬프 데이터로 교차 검증됨

**파일**: `useBatchUpload.ts`

```typescript
// Line 382-385: 다음 파일 찾기
const nextFile = uploadQueueRef.current.find(
  (f) => f.status === 'pending' && f.retryCount < MAX_RETRY_COUNT
)
if (!nextFile) return  // ← 워커 즉시 종료!

// Line 533-536: 실패 시 재시도 준비
nextFile.retryCount++
if (nextFile.retryCount < MAX_RETRY_COUNT) {
  nextFile.status = 'pending'      // ← 다시 pending으로
  await new Promise(r => setTimeout(r, RETRY_DELAY_MS))  // 1초 대기
}
```

**멈춤 재구성 (서버 데이터 기반):**
```
1. 3개 워커(A,B,C)가 각각 ~23개 파일 처리 (3×23 ≈ 70)
2. 일부 파일 업로드 실패 → retryCount++ → status='pending' + 1초 대기(await)
3. 이 1초 대기 중에 다른 워커가 find('pending')를 실행
4. 재시도 파일은 아직 await 중이라 status 복귀 전 → pending 파일 없음
5. 워커: "할 일 없음" → return으로 종료
6. 재시도 파일이 1초 후 pending 복귀 → 하지만 이미 워커 없음
7. 마지막 워커 1개만 남아 소수 처리 후 종료 (69→70번째 간격 5초 = 워커 1개 동작)
8. 376개 파일이 pending 상태로 영구 방치
```

**Nginx 데이터 근거:**
- 69→70번째 응답 간격: ~5초 (평균 386ms의 13배)
- = 워커 2개 이미 종료, 1개만 남아 처리하는 패턴과 일치

### 3-2. [ROOT CAUSE] calculateFileHash throw → Promise.all 전체 중단

> Alex/Gini 공통 확인

**파일**: `fileHash.ts`, `useBatchUpload.ts`

```typescript
// fileHash.ts Line 19, 32 — 의도적 throw
export async function calculateFileHash(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer()  // ← 대용량 파일 시 메모리 부족
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
    // ...
  } catch (error) {
    throw new Error('파일 해시 계산에 실패했습니다.')  // ← 의도적 throw!
  }
}

// useBatchUpload.ts Line 400 — try-catch 없이 호출
const duplicateResult = await checkDuplicateFile(file, existingHashes)
//  → calculateFileHash() throw → processNextFile() throw → Promise.all reject

// useBatchUpload.ts Line 577 — 하나라도 reject시 전체 중단
await Promise.all(activeUploads)
```

**`file.arrayBuffer()` 실패 원인 (Alex 분석):**
1. 70개 파일 처리 동안 메모리 누적 → 71번째 파일에서 메모리 부족
2. File 객체 무효화 (OS에서 원본 파일 이동/삭제 → `NotReadableError`)
3. 브라우저 동시 Blob 읽기 내부 제한

### 3-3. [ROOT CAUSE] duplicateResolverRef 덮어쓰기 데드락

> Gini 1차 분석에서 발견

**파일**: `useBatchUpload.ts` Lines 270-286, 408-446

두 워커가 동시에 중복을 발견하면:
```
워커 A: waitForDuplicateDecision → duplicateResolverRef.current = resolveA
워커 B: waitForDuplicateDecision → duplicateResolverRef.current = resolveB (resolveA 덮어씀!)
사용자 결정 → handleDuplicateAction → resolveB만 호출
워커 A: Promise 영원히 resolve 안 됨 → 데드락
```

### 3-4. [LATENT] FastAPI 자기 호출 구조 — 현재 건은 아니나 잠재 위험

> Alex 발견, Gini 데이터로 "이번 건의 직접 원인은 아님" 확인

**파일**: `shadow_mode.py` Lines 22-23, 155, 164-167

```python
FASTAPI_BASE = "http://localhost:8100/webhook"  # 자기 자신!

# FastAPI 모드: /shadow/docprep-main → httpx로 localhost:8100/webhook/docprep-main 호출
async with httpx.AsyncClient(timeout=60.0) as client:
    response = await _call_fastapi(client, workflow, ...)
```

FastAPI 서버(port 8100)가 자기 자신에게 HTTP 요청을 보내는 구조. 단일 uvicorn 프로세스에서:
- shadow 핸들러가 httpx 연결을 열고 대기
- 같은 프로세스에서 webhook 핸들러가 처리
- 동시 요청 증가 시 자기 호출 대기 체인 발생 가능

**이번 건에서는:** 서버 응답 전부 HTTP 200, 타임아웃 0건 → 직접 원인이 아님
**잠재 위험:** 파일 크기가 크거나 동시 업로드 수가 늘면 httpx 60초 타임아웃 트리거 가능

---

## 4. "왜 xPipe 이전에는 안 발생했는가"

> Gini 서버 데이터 분석으로 확정

| 항목 | n8n 모드 (이전) | FastAPI 모드 (현재) |
|------|----------------|-------------------|
| shadow_call 대상 | n8nd.giize.com (외부 서버) | localhost:8100 (자기 자신) |
| 응답 시간 | 수초~수십초 (n8n 처리 대기) | **즉시 응답 (182바이트)** |
| 워커 블로킹 | 느린 응답 → 워커가 천천히 파일 소진 | **빠른 응답 → 워커가 급속히 파일 소진** |
| 버그 트리거 | 느린 속도로 인해 재시도 타이밍 분산 → 워커 조기종료 안 됨 | **빠른 속도로 동시 실패 확률 증가 → 워커 조기종료 트리거** |

**결론:**

> **버그는 원래부터 있었다.** xPipe(FastAPI) 전환으로 서버 응답이 극도로 빨라지면서, 워커가 더 빠르게 파일을 소진하고, 기존 잠재 버그(워커 조기종료, Promise.all 전체 중단)의 **트리거 조건에 더 빠르고 확실하게 도달**하게 된 것이다.
>
> xPipe가 버그를 만든 것이 아니라, **수면 아래에 있던 버그를 수면 위로 끌어올린 것이다.**

---

## 5. 가장 유력한 시나리오 — Alex vs Gini

| 관점 | Alex (설계/구현) | Gini (품질 검증, 데이터 기반) |
|------|------------------|---------------------------|
| **주 원인** | FastAPI 자기 호출 구조가 지연 누적 → 타임아웃 → 워커 크래시 | 서버 에러 0건 확인 → **워커 조기종료 버그**가 주 원인 |
| **70의 의미** | 처리 누적으로 서버 응답 지연 → 71번째에서 타임아웃 | 3워커 × ~23개 = 69~70 → **재시도 파일만 남아 워커 전부 종료** |
| **xPipe 관계** | 자기 호출 구조 자체가 문제 | 빠른 응답이 기존 버그 트리거 확률 상승 |
| **데이터 부합** | 서버 에러 0건과 모순 | **서버 데이터와 완전 부합** |

**채택: Gini 분석 (서버 데이터 기반)**

Alex의 자기 호출 구조 분석은 잠재 위험으로 별도 관리 (3-4).

---

## 6. 수정 방안 — 근본 원인 제거 우선

### P0 — [근본 원인 제거] 워커 조기 종료 방지

**현재 문제:** `find(pending)` 결과 없으면 `return`으로 워커 즉시 종료 → 재시도 파일 방치

```typescript
// useBatchUpload.ts Line 382-385 — 수정 전
const nextFile = uploadQueueRef.current.find(
  (f) => f.status === 'pending' && f.retryCount < MAX_RETRY_COUNT
)
if (!nextFile) return  // ← 즉시 종료!

// 수정 후: 진행 중인 파일이 있으면 대기 후 재탐색
if (!nextFile) {
  const hasActive = uploadQueueRef.current.some(
    f => f.status === 'checking' || f.status === 'uploading' ||
         (f.status === 'pending' && f.retryCount > 0)  // 재시도 대기 중인 파일
  )
  if (hasActive) {
    await new Promise(r => setTimeout(r, 500))
    continue  // ← 재탐색
  }
  return  // 진짜 할 일 없을 때만 종료
}
```

### P0 — [근본 원인 제거] duplicateResolverRef 동시 접근 방지

**현재 문제:** 두 워커 동시 진입 시 첫 워커의 resolver 유실 → 데드락

```typescript
// 수정: waitForDuplicateDecision 진입 전 뮤텍스
// duplicateResolverRef.current가 null인지 확인
// null이 아니면 대기 → 직렬화된 중복 처리
```

### P0 — [근본 원인 제거] FastAPI 자기 호출 제거

**현재 문제:** shadow_mode.py에서 httpx로 localhost:8100에 자기 호출 → 잠재적 데드락

```python
# shadow_mode.py — 수정 전
FASTAPI_BASE = "http://localhost:8100/webhook"  # 자기 자신에게 HTTP 호출

# 수정 후: FastAPI 모드에서는 함수 직접 호출 (HTTP 우회)
elif mode == ServiceMode.FASTAPI:
    response = await doc_prep_main_handler(request_data, files)  # 직접 호출
```

### P1 — [방어책] processNextFile try-catch 추가

에러 핸들링은 근본 원인 제거가 아니지만, **방어적 이중 보호로 필요:**

```typescript
const processNextFile = async () => {
  while (true) {
    // ...
    try {
      nextFile.status = 'checking'
      const duplicateResult = await checkDuplicateFile(file, existingHashes)
      // ... 업로드 로직 ...
    } catch (error) {
      console.error(`[useBatchUpload] 파일 처리 실패: ${nextFile.fileName}`, error)
      nextFile.status = 'failed'
      nextFile.error = error instanceof Error ? error.message : '파일 처리 중 오류 발생'
      // setProgress로 UI 업데이트
      continue  // 다음 파일 계속 처리
    }
  }
}
```

### P1 — [방어책] Promise.all → Promise.allSettled

```typescript
await Promise.allSettled(activeUploads)
```

### P1 — [방어책] startUpload try-catch 추가

```typescript
const handleStartUpload = useCallback(async (selectedMappings) => {
  try {
    await startUpload(selectedMappings)
  } catch (error) {
    console.error('[BatchUpload] 업로드 중 오류:', error)
  }
}, [startUpload])
```

### P2 — 해시 캐시 로딩 동시성 제한

```typescript
// 한 번에 최대 5개 문서 상태만 동시 조회
```

### P2 — Nginx .bak 설정 파일 비활성화 (Gini 발견)

`/etc/nginx/sites-enabled/`에 `aims.bak.*` 파일이 동시 로드 중 → 설정 충돌 가능성

---

## 7. 테스트 커버리지 현황 (Gini 분석)

| 테스트 파일 | 내용 | 이 버그 감지 |
|---|---|---|
| `useBatchUpload.test.ts` | 초기 상태, reset, 취소, 일시정지 | 불가 |
| `useBatchUpload.duplicate.test.ts` | 중복 검사, handleDuplicateAction | 불가 |
| `useBatchUpload.advanced.test.ts` | 동시 업로드, 재시도, 진행률 (5개 파일) | 불가 |

**감지 불가 이유:**
1. `checkDuplicateFile`이 항상 mock → `calculateFileHash` throw 미테스트
2. 대량 파일(70개+) 테스트 없음
3. 워커 크래시 → `Promise.all` reject 전파 미테스트
4. `duplicateResolverRef` 동시 접근(데드락) 미테스트
5. **워커 조기종료 시나리오** (재시도 대기 중 다른 워커 종료) 미테스트

---

## 8. 검증 방법

수정 후 다음 시나리오를 테스트:

1. **대량 파일 업로드** (100개 이상) — 전체 완료 확인
2. **중복 파일 포함** — 다이얼로그 표시 + 자동 스킵 동작 확인
3. **손상된 파일 포함** — 해시 계산 실패 시 해당 파일만 실패, 나머지 계속 처리
4. **동시 중복 감지** — 2개 이상 워커가 동시에 중복 발견 시 데드락 없이 처리
5. **연속 실패 후 재시도** — 3개 파일 연속 실패 → 재시도 → 워커 조기 종료 없이 완료
6. **업로드 중 페이지 이동 후 복귀** — 상태 유지 확인

---

## 9. 실행 계획

### 작업 순서

```
Phase 0. 디버깅 로그 보강 → 재현 테스트 1회로 원인 확정
Phase 1. 재현 테스트 작성 (수정 전 FAIL 확인)
Phase 2. 근본 원인 제거 (3건 병렬 가능)
Phase 3. 방어책 추가
Phase 4. 회귀 + E2E 검증
Phase 5. (후순위) 백엔드 자기 호출 제거
```

### Phase 0. 디버깅 로그 보강

**목적:** 다음 재현 테스트 1회로 정확한 원인을 확정하기 위해, 핵심 코드 경로에 상세 로그 추가.

현재 `processNextFile`에는 시작/종료 로그만 있고, 각 워커의 상태 전환/에러/종료 이유가 기록되지 않음.
한번의 재현으로 "워커 조기종료인지, hash throw인지, 데드락인지" 확정하려면 아래 로그가 필수.

**추가할 로그 (useBatchUpload.ts):**

| 위치 | 로그 내용 | 확정할 원인 |
|------|----------|------------|
| Line 363 (while 진입) | `[Worker-${i}] 루프 시작: pending=${count}` | 워커별 처리 파일 수 추적 |
| Line 382 (find 결과) | `[Worker-${i}] nextFile=${name\|null}, pending=${count}, checking=${count}, uploading=${count}` | 워커 종료 직전 큐 상태 |
| Line 385 (return) | `[Worker-${i}] 종료: 이유=할일없음, 큐상태={pending,checking,uploading,completed,failed}` | **워커 조기종료 확인** |
| Line 388 (checking) | `[Worker-${i}] checking: ${fileName}` | 어느 파일에서 멈추는지 |
| Line 400 (checkDuplicate 전후) | `[Worker-${i}] 해시 시작/완료: ${fileName}, ${ms}ms` | **hash throw 확인** |
| Line 408 (대기 루프 진입) | `[Worker-${i}] 중복 대기 시작: isPaused=${v}, resolver=${v!=null}` | **데드락 확인** |
| Line 428 (isPaused 설정) | `[Worker-${i}] 다이얼로그 표시 요청: ${fileName}` | 다이얼로그 표시 여부 |
| Line 510 (업로드 결과) | `[Worker-${i}] 업로드 결과: ${fileName}, success=${v}` | 실패 패턴 확인 |
| Line 533 (재시도) | `[Worker-${i}] 재시도 예정: ${fileName}, retry=${count}/${MAX}` | 재시도 파일 추적 |
| Line 577 (Promise.all 전후) | `[processQueue] Promise.allSettled 시작/완료` | 전체 종료 시점 |

**추가할 로그 (duplicateChecker.ts):**

| 위치 | 로그 내용 |
|------|----------|
| Line 153 (calculateFileHash 호출 전후) | `[duplicateChecker] 해시 계산: ${fileName}, size=${bytes}` |
| catch 블록 | `[duplicateChecker] 해시 실패: ${fileName}, error=${message}` |

**추가할 로그 (batchUploadApi.ts):**

| 위치 | 로그 내용 |
|------|----------|
| Line 147-182 (XHR 이벤트) | `[uploadFile] ${event}: ${fileName}, status=${xhr.status}` |

### Phase 1. 재현 테스트 — 수정 전 FAIL 확인

| # | 테스트 | 검증 포인트 |
|---|--------|------------|
| T1 | 재시도 대기 중 워커 조기 종료 | 10개 파일, 3개 첫 시도 실패 → 전체 처리 완료 여부 |
| T2 | calculateFileHash throw | 5개 파일, 1개 해시 실패 → 나머지 4개 완료 여부 |
| T3 | 두 워커 동시 중복 발견 | 3개 중복 파일 → 데드락 없이 전체 처리 여부 |

### Phase 2. 근본 원인 제거 (P0, 병렬 가능)

| # | 수정 | 파일:라인 | 복잡도 | 핵심 변경 |
|---|------|----------|--------|----------|
| Fix 1 | **워커 조기 종료 방지** | useBatchUpload.ts:382-385 | 보통 | `return` → 진행중 파일 있으면 500ms 대기 후 `continue` |
| Fix 2 | **Hash throw 흡수** | duplicateChecker.ts:152-153 | 간단 | try-catch + 중복 아님 fallback |
| Fix 3 | **Resolver 데드락 방지** | useBatchUpload.ts:406-446 | 보통 | `duplicateMutexRef`로 진입 직렬화 |

### Phase 3. 방어책 (P1)

| # | 수정 | 파일:라인 | 복잡도 |
|---|------|----------|--------|
| Fix 4 | processNextFile 전체 try-catch | useBatchUpload.ts:388~ | 간단 |
| Fix 5 | `Promise.all` → `Promise.allSettled` | useBatchUpload.ts:577 | 간단 |
| Fix 6 | startUpload try-catch | useBatchUpload.ts:616 | 간단 |

### Phase 4. 검증

- 재현 테스트 T1~T3 PASS 확인
- 기존 테스트 전체 회귀: `npx vitest run src/features/batch-upload`
- E2E: 100개 파일 일괄 업로드 → 전체 완료 확인

### Phase 5. (후순위) 백엔드 자기 호출 제거

| 수정 | 파일 | 복잡도 | 비고 |
|------|------|--------|------|
| FastAPI 모드에서 httpx 자기 호출 → 함수 직접 호출 | shadow_mode.py:155 | 복잡 | 이번 건 직접 원인 아님, 별도 작업 |

### 주의사항 (Gini)

> 워커 종료 조건 변경 시 **무한 루프 위험**. `hasActive` 조건에서 `failed` 상태 전이가 정확히 이루어지는지 반드시 테스트로 검증해야 함.

---

## 10. 부록

### A. 아키텍처 흐름

```
[프론트엔드]                          [백엔드]

FolderMapping (446파일)
  ↓
processQueue()
  ├─ 해시 캐시 사전 로딩              ← /api/customers/:id/documents
  │   (고객별 기존 문서 해시 조회)       /api/documents/:id/status
  │
  └─ Worker 3개 동시 실행 ──────────→ POST /shadow/docprep-main
       ├─ status='checking'              ↓
       │   ├─ calculateFileHash()     shadow_call() [timeout=60s]
       │   └─ checkDuplicateFile()       ↓ (자기 호출: localhost:8100)
       ├─ 중복 발견 시 → DuplicateDialog  _call_fastapi()
       │   (10초 후 자동 스킵)            ↓
       └─ status='uploading'          doc_prep_main 파이프라인
           └─ XHR 업로드 [timeout=5분]   ↓
               ↓                      파일저장 → OCR큐 등록 → 즉시응답(182B)
           status='completed'
```

### B. 확인한 소스 파일

| 파일 | 역할 |
|------|------|
| `frontend/.../hooks/useBatchUpload.ts` | 배치 업로드 핵심 로직 (워커, 큐, 중복 처리) |
| `frontend/.../components/DuplicateDialog.tsx` | 중복 파일 다이얼로그 (10초 자동 스킵, 정상) |
| `frontend/.../api/batchUploadApi.ts` | XHR 업로드 API (5분 타임아웃) |
| `frontend/.../components/UploadProgress.tsx` | 업로드 진행률 UI |
| `shared/lib/fileValidation/duplicateChecker.ts` | 해시 기반 중복 검사 |
| `features/customer/utils/fileHash.ts` | SHA-256 해시 계산 (의도적 throw) |
| `backend/.../middleware/shadow_mode.py` | 자기 호출 구조 (잠재 위험) |
| `backend/.../routers/shadow_router.py` | /shadow/docprep-main 엔드포인트 |
| `backend/.../routers/doc_prep_main.py` | 파이프라인 처리 (무거운 작업) |
| `backend/.../workers/upload_worker.py` | 업로드 큐 워커 (동시 3개) |
| `frontend/.../hooks/__tests__/useBatchUpload.*.ts` | 기존 테스트 (커버리지 부족) |
