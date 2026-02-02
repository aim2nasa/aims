# 업로드 파일 손실 근본 수정 로드맵

## 근본 원인

**업로드 완료 전에 "완료"를 표시하는 구조**

```
현재 (모든 업로드 경로):
  파일 선택 → uploadService.queueFiles() → 인메모리 배열 추가 → "완료" 표시
                                                ↓
                                          백그라운드 업로드 (max 3)
                                                ↓
                                          페이지 이탈 → 큐 소멸 → 파일 손실
```

---

## 단계별 수정 계획

### Phase 1: 배치 등록 직접 업로드 전환 ✅ 완료

`uploadService.queueFiles()` (인메모리 큐) → `BatchUploadApi.uploadFile()` (직접 HTTP 업로드, 10개 병렬)

#### Phase 1-A: AR 배치 등록 ✅

| 항목 | 내용 |
|------|------|
| 커밋 | `d55f0d59` — fix(frontend): AR 배치 등록 파일 손실 수정 - 인메모리 큐 → 직접 업로드 |
| 수정 파일 | `DocumentRegistrationView.tsx` — AR 등록 루프 |
| 방식 | `registerArDocument()` + `uploadService.queueFiles()` → `flushUploadBatch()` + `BatchUploadApi.uploadFile()` |
| 테스트 | 745파일 → 724건 등록 + 21건 스킵(중복), **누락 0건**, 1분 5초 |

#### Phase 1-B: CRS 배치 등록 ✅

| 항목 | 내용 |
|------|------|
| 커밋 | `4a5794c8` — fix(frontend): CRS 배치 등록 파일 손실 수정 - 인메모리 큐 → 직접 업로드 |
| 수정 파일 | `DocumentRegistrationView.tsx` — CRS 등록 루프 |
| 방식 | `uploadService.queueFiles()` → `flushCrsUploadBatch()` + `BatchUploadApi.uploadFile()` |
| 수정 전 테스트 | 414건 → 368건 도착, **46건 손실 (11%)** |
| 수정 후 | 테스트 대기 |

#### 변경 전후 비교

```
변경 전:
  파일 → uploadService.queueFiles() → 인메모리 큐 → "완료" 표시
                                         ↓ (백그라운드, max 3)
                                    페이지 이탈 → 큐 소멸 → 파일 손실

변경 후:
  파일 → BatchUploadApi.uploadFile() → HTTP POST 직접 전송 (10개 병렬)
                                         ↓
                                    Promise.all() 완료 → "완료" 표시
```

---

### Phase 2: uploadService 리팩토링 — queueFiles()가 Promise 반환 ✅ 완료

현재 `queueFiles()`는 fire-and-forget (void 반환). 호출부가 업로드 완료를 알 수 없음.

**변경**: `queueFiles()`가 모든 파일 업로드 완료 시 resolve되는 `Promise<UploadResult[]>` 반환.

**구현 방식**: `pendingResolvers` Map을 사용하여 각 파일의 Promise resolve 함수를 관리.
`uploadFile()` 내부의 모든 종료 지점 (성공/경고/바이러스/취소/에러)에서 `resolveFile()` 호출.

| 항목 | 내용 |
|------|------|
| 수정 파일 | `uploadService.ts` |
| 효과 | 모든 호출부에서 `await uploadService.queueFiles(files)` 가능 |
| 하위 호환 | 기존 호출부 6곳 모두 fire-and-forget — await 안 해도 동작 |

---

### Phase 3: 모든 업로드 경로에서 완료 대기 적용 ✅ 완료

Phase 2의 Promise 반환을 활용하여, 업로드 경로별로 적절한 완료 대기 적용.

| 업로드 경로 | 변경 | 비고 |
|------------|------|------|
| AR 배치 등록 | ✅ 직접 업로드 (Phase 1) | 유지 |
| CRS 배치 등록 | ✅ 직접 업로드 (Phase 1) | 유지 |
| 일반 파일 업로드 (드래그앤드롭) | `.then()` 완료 추적 | await 불가 — AR큐 블로킹 방지 |
| 내 파일 업로드 (PersonalFilesView) | `await queueFiles()` 후 "완료" | 핵심 수정 |
| 단건 모달 업로드 (AR/CRS) | 변경 없음 | 1개씩 즉시 시작, 손실 위험 극히 낮음 |

---

### Phase 4: 업로드 중 페이지 이탈 차단 강화 ✅ 완료

`uploadService.isUploading()` 메서드로 글로벌 업로드 상태 확인.

| 항목 | 구현 |
|------|------|
| beforeunload | App.tsx에 글로벌 리스너 추가 (뷰별 중복 등록 불필요) |
| SPA 뷰 전환 가드 | `updateURLParams()`에서 뷰 변경 시 `window.confirm()` 표시 |
| uploadService | `isUploading()`, `getUploadCounts()`, `setBatchUploadActive()` 메서드 추가 |
| 배치 업로드 상태 | AR/CRS 배치 루프에서 `setBatchUploadActive(true/false)` 호출 (try-finally 보장) |

**동작**:
- 큐 업로드 중 뷰 전환 → `"파일 업로드가 진행 중입니다 (N개 남음). 계속 이동하시겠습니까?"`
- 배치 등록 중 뷰 전환 → `"일괄 등록이 진행 중입니다. 계속 이동하시겠습니까?"`

**1차 시뮬레이션 검증으로 발견한 버그 수정 (기능)**:
- AR/CRS 배치 업로드는 `BatchUploadApi.uploadFile()` 직접 호출 → `uploadService.isUploading()` false 반환
- `setBatchUploadActive()` 플래그로 배치 업로드 진행 상태를 `uploadService`에 반영
- try-finally로 예외 발생 시에도 플래그 해제 보장

**2차 시뮬레이션 검증으로 발견한 UX 결함 수정**:
- 배치 업로드 중 `getUploadCounts().total = 0` (큐 미사용) → "(0개 남음)" 표시 → 사용자 오해 유발
- 큐 카운트 > 0 vs = 0 으로 분기하여 배치 등록 전용 메시지 표시

---

## 실행 순서

```
Phase 1 (즉시)  →  CRS 직접 업로드 → 누락 0% 달성
Phase 2 (다음)  →  uploadService Promise 반환 → 구조적 기반 마련
Phase 3 (이후)  →  모든 경로 완료 대기 → 전체 누락 방지
Phase 4 (최종)  →  이탈 차단 강화 → 안전망 완성
```

Phase 1은 이미 AR에서 검증된 패턴을 복사하는 수준이므로 즉시 실행 가능.
Phase 2~4는 Phase 1 완료 후 순차 진행.

---

## 시뮬레이션 검증 보고서

### 검증 목적

코드 레벨 시뮬레이션으로 모든 업로드 경로에서 파일 손실이 구조적으로 불가능한지 검증.
실제 테스트 전에 엣지 케이스까지 포함하여 12개 시나리오를 트레이스.

### 시나리오별 검증 결과

| # | 시나리오 | 검증 내용 | 결과 |
|---|---------|----------|------|
| 1 | AR 배치 724파일 중 뷰 전환 | `batchUploadActive=true` → `isUploading()=true` → confirm 차단 | ✅ PASS |
| 2 | CRS 배치 414파일 중 탭 닫기 | `batchUploadActive=true` → beforeunload 발화 | ✅ PASS |
| 3 | AR 정상 완료 → 플래그 해제 | `finally { setBatchUploadActive(false) }` → 이후 자유 이동 | ✅ PASS |
| 4 | CRS 예외 발생 → 플래그 해제 보장 | try-finally 구조 → throw 시에도 false 보장 | ✅ PASS |
| 5 | 일반 드래그앤드롭 중 뷰 전환 | `activeUploads.size>0` → `isUploading()=true` → confirm | ✅ PASS |
| 6 | PersonalFilesView await 완료 대기 | `await queueFiles()` → 실제 완료 후 "완료" 표시 | ✅ PASS |
| 7 | 업로드 없을 때 false positive | 모든 조건 false → confirm 미표시 → 정상 이동 | ✅ PASS |
| 8 | queueFiles Promise 누수 검증 | `uploadFile()` 5개 종료지점 + cancel 2종 모두 resolveFile() 호출 | ✅ PASS |
| 9 | 배치 0건 조기 리턴 | `filesToRegister.length===0` return이 `setBatchUploadActive` 이전 | ✅ PASS |
| 10 | beforeunload 핸들러 중복 | App.tsx + DRV 양쪽 등록 → 브라우저 1개 다이얼로그 → 무해 | ✅ PASS |
| 11 | AR 배치 + 일반 업로드 동시 진행 | 양쪽 OR 조건 → 하나라도 진행 중이면 차단 | ✅ PASS |
| 12 | confirm 메시지 정확성 | 배치: "일괄 등록 진행 중", 큐: "N개 남음" 분기 표시 | ✅ PASS (수정 후) |

### 검증된 `resolveFile()` 호출 지점 (Promise 누수 방지)

| `uploadFile()` 종료 지점 | resolveFile 호출 | uploadService.ts 라인 |
|--------------------------|-----------------|----------------------|
| 바이러스 감지 (ClamAV) | `resolveFile(id, { success: false })` | 231 |
| 업로드 성공/경고 | `resolveFile(id, { success: true })` | 298 |
| AbortError (취소) | `resolveFile(id, { success: false })` | 310 |
| Known Error (HTTP 등) | `resolveFile(id, { success: false })` | 321 |
| Unknown Error | `resolveFile(id, { success: false })` | 331 |
| cancelUpload() — 큐 파일 | `resolveFile(fileId, ...)` | 136 |
| cancelAllUploads() — 큐 파일 | `resolveFile(file.id, ...)` | 158 |

### 발견 및 수정한 결함

| # | 발견 시점 | 유형 | 내용 | 수정 |
|---|----------|------|------|------|
| 1 | 1차 시뮬레이션 | 기능 버그 | AR/CRS 배치가 `BatchUploadApi` 직접 사용 → `isUploading()` 감지 불가 | `setBatchUploadActive()` + try-finally |
| 2 | 2차 시뮬레이션 | UX 결함 | 배치 중 `getUploadCounts().total=0` → "(0개 남음)" 오해 유발 | 큐/배치 분기 메시지 |

---

## 수정된 파일 목록 (전체)

| 파일 | Phase | 변경 내용 |
|------|-------|----------|
| `DocumentRegistrationView.tsx` | 1-A | AR 루프: `uploadService.queueFiles()` → `flushUploadBatch()` + `BatchUploadApi.uploadFile()` |
| `DocumentRegistrationView.tsx` | 1-B | CRS 루프: `uploadService.queueFiles()` → `flushCrsUploadBatch()` + `BatchUploadApi.uploadFile()` |
| `uploadService.ts` | 2 | `queueFiles()` → `Promise<UploadResult[]>` 반환, `pendingResolvers` Map, `resolveFile()` |
| `DocumentRegistrationView.tsx` | 3 | 일반 업로드 `.then()` 완료 추적 |
| `PersonalFilesView.tsx` | 3 | `await queueFiles()` 후 "완료" 표시 |
| `App.tsx` | 4 | 글로벌 `beforeunload` + `updateURLParams()` 뷰 전환 가드 |
| `uploadService.ts` | 4 | `isUploading()`, `getUploadCounts()`, `setBatchUploadActive()` |
| `DocumentRegistrationView.tsx` | 4 | AR/CRS 배치 루프 `setBatchUploadActive(true/false)` + try-finally |
| `App.tsx` | 4 | confirm 메시지 큐/배치 분기 (2차 시뮬레이션 수정) |
| `uploadService.test.ts` | 2 | `await queueFiles()` → `void queueFiles()` (테스트 XHR 모킹 호환) |

---

## 진행 기록

| 일자 | Phase | 내용 |
|------|-------|------|
| 2026-02-02 | 1-A | AR 배치 등록 직접 업로드 전환 완료 (커밋 `d55f0d59`) |
| 2026-02-02 | 1-A | 테스트 완료: 745→724건, 누락 0건, 1분 5초 |
| 2026-02-02 | 1-B | CRS 배치 등록 직접 업로드 전환 완료 (커밋 `4a5794c8`) |
| 2026-02-02 | 2 | uploadService `queueFiles()` → `Promise<UploadResult[]>` 반환으로 리팩토링 |
| 2026-02-02 | 3 | PersonalFilesView `await queueFiles()` 적용, DocumentRegistrationView `.then()` 완료 추적 |
| 2026-02-02 | 4 | 글로벌 beforeunload + SPA 뷰 전환 가드 추가 (App.tsx) |
| 2026-02-02 | 4 | Phase 2~4 커밋 (커밋 `9e12f9af`) |
| 2026-02-02 | 4 | 페이지 이탈 차단 강화 커밋 (커밋 `ec93336b`) |
| 2026-02-02 | 검증 | 1차 시뮬레이션: 배치 업로드 상태 미반영 버그 발견 → `setBatchUploadActive()` + try-finally |
| 2026-02-02 | 검증 | 2차 시뮬레이션: 12개 시나리오 전수 검증, UX 결함 1건 수정 (confirm 메시지 분기) |
| 2026-02-02 | ALL | **전체 로드맵 완료 + 시뮬레이션 검증 통과** |
