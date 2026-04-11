# 문서 일괄등록 — 폴더 분석 진행률 표시 + 추가 병렬화

- **일자**: 2026-04-11
- **작업 유형**: feature 수정 (UX + 성능)
- **프로세스**: Compact Fix
- **브랜치**: `feat/batch-upload-progress`

---

## 1. 배경

사용자 피드백:
> "폴더를 선택할때 시간이 너무 많이 걸려 여젼히. 좀 더 빠르게 할 수 없어?"
> "지금 느린것은 폴더 클릭일때이지만, 둘다 빨라야돼. 진행률 표시를 해야 그나마 느린 것을 참을 수 있어. ... 반드시 진행률이 수치로 표시가 되어야 무작정 기다리지 않을 수 있어. 처리 과정을 자세하게 보여주면 더 좋아."

---

## 2. 진단 요약

### 회귀 여부 — 없음
- 병렬화 도입 커밋 `903e6461` (2026-04-09) 이후 `FolderDropZone.tsx` 수정 0건
- 코드는 그대로 살아 있음

### 코드 측면 미세 병목
- 같은 디렉토리 안 50개 배치들끼리는 `for` 루프로 순차 (예: 1000개 파일 → 20개 배치 순차)
- 서브디렉토리 간 병렬은 정상

### 후처리 단계 (`handleFilesSelected`)
- O(N) ~ O(N×M), 전체 수십~수백 ms — 병목 아님
- SHA-256 해시는 분석 단계에 없음 (업로드 시점만)

### 가장 큰 문제 (사용자 명시)
- **진행률 표시 부재** — 고정 텍스트 "폴더 분석 중..." 만, 멈춘 건지 진행 중인지 알 수 없음
- 체감 지연이 실제보다 훨씬 크게 느껴짐

---

## 3. 합의된 작업 (3가지)

### 3.1 진행률 표시 (수치 + 단계명) — **핵심**

`isProcessing: boolean` → `progress: { stage, current, total } | null` 객체로 확장.

| Stage | 표시 텍스트 |
|-------|-----------|
| `reading` | "파일 목록 읽는 중... {current}개" (총계 미지수) |
| `validating` | "파일 검증 중... {current} / {total}" |
| `matching` | "고객 매칭 중... {current} / {total} 폴더" |
| `checking-storage` | "용량 확인 중..." |

스피너 + 단계 텍스트 + 수치를 함께 표시.

### 3.2 같은 디렉토리 내 배치 병렬화 (`for` → `Promise.all`)

`FolderDropZone.tsx` `readDir`의 50개 배치 순차 처리를 전체 병렬로 변경. 단, 메모리 안전을 위해 청크 동시성 제한 (예: 한번에 10개 배치 = 500개 파일 동시) 검토.

### 3.3 webkitdirectory fallback 경로에도 동일 진행률 적용

`handleInputChange` 경로(`webkitdirectory` input)도 같은 progress 콜백 적용.

---

## 4. 수정 범위

| 파일 | 변경 |
|------|------|
| `frontend/aims-uix3/src/features/batch-upload/components/FolderDropZone.tsx` | `isProcessing` state 확장, `onProgress` prop, readDir 진행률 보고, 배치 병렬화, fallback 경로 진행률 |
| `frontend/aims-uix3/src/features/batch-upload/components/FolderDropZone.css` (또는 inline) | 진행률 텍스트 스타일 |
| `frontend/aims-uix3/src/features/batch-upload/BatchDocumentUploadView.tsx` | `handleFilesSelected` 후처리 단계마다 progress 업데이트 |
| `frontend/aims-uix3/src/features/batch-upload/types.ts` (또는 새 파일) | `BatchUploadProgress` 타입 정의 |

### 변경 없음
- 백엔드
- `useBatchUpload.ts`의 업로드 로직 (분석 단계만 손댐)
- 이미 머지된 분류 트리/툴바 작업

---

## 5. 검증 계획 (Phase 3)

| 시나리오 | 기대 |
|---------|------|
| 폴더 선택(showDirectoryPicker) | 진행률이 단계별로 변하며 수치 카운트 표시 |
| 큰 폴더(1000+ 파일) | 배치 병렬화로 체감 빨라짐 (스피너만 보다가 끝나는 게 아니라 카운트가 빠르게 올라감) |
| webkitdirectory fallback | 진행률 표시 동일 동작 |
| 작은 폴더(10개) | 즉시 완료, 진행률 잠깐 깜빡 |
| 빌드/typecheck | exit 0 |

---

## 6. Out of Scope

- OS 레벨 병목(Defender, OneDrive) — 코드로 해결 불가
- 백엔드 변경
- 업로드 단계 자체 (해시, 동시 업로드 등)
