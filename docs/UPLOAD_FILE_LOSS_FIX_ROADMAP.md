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

### Phase 4: 업로드 중 페이지 이탈 차단 강화

현재 `beforeunload` 이벤트로 경고만 표시. 사용자가 무시하면 큐 소실.

**변경**: 업로드 진행 중이면 SPA 네비게이션도 차단.

| 항목 | 내용 |
|------|------|
| beforeunload | 유지 (브라우저 탭 닫기/새로고침 방지) |
| SPA 라우터 가드 | 추가 — 업로드 중 다른 View 이동 시 확인 다이얼로그 |
| 업로드 중 표시 | 글로벌 상태바에 "업로드 진행 중 (3/10)" 표시 |

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

## 진행 기록

| 일자 | Phase | 내용 |
|------|-------|------|
| 2026-02-02 | 1-A | AR 배치 등록 직접 업로드 전환 완료 (커밋 `d55f0d59`) |
| 2026-02-02 | 1-A | 테스트 완료: 745→724건, 누락 0건, 1분 5초 |
| 2026-02-02 | 1-B | CRS 배치 등록 직접 업로드 전환 완료 (커밋 `4a5794c8`) |
| 2026-02-02 | 2 | uploadService `queueFiles()` → `Promise<UploadResult[]>` 반환으로 리팩토링 |
| 2026-02-02 | 3 | PersonalFilesView `await queueFiles()` 적용, DocumentRegistrationView `.then()` 완료 추적 |
