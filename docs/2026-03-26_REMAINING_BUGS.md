# 멈춘 문서 미션 — 남은 버그 (다음 세션 계속)

> 작성일: 2026-03-26 22:40 KST
> 상태: **진행 중 — 다음 세션에서 계속**

---

## 해결 완료된 버그 (이번 세션)

| # | 버그 | 커밋 | 상태 |
|---|------|------|------|
| 1 | 40%에서 멈춤 (11건 문제 파일) | `cfa262d9` | ✅ 해결 |
| 2 | MIME 타입 표시 (ZIP → X-ZIP-COMPRESSED) | `cfa262d9` | ✅ 해결 |
| 3 | HWP 임베딩 skipped (텍스트 있는데 누락) | `7befb869` | ✅ 해결 |
| 4 | progress 90% 고착 | `7befb869` | ✅ 해결 |
| 5 | HWP 변환 후 문서유형/배지 미반영 | `cfa262d9` | ✅ 해결 |

---

## 남은 버그: HWP/PPTX PDF 변환 배지 실시간 미갱신

### 현상
- HWP/PPTX 파일 업로드 후 전체 문서 보기 페이지에서 관찰
- 파이프라인이 먼저 "completed"로 마킹 → UI에 "✓ 완료" + BIN 배지 + 회색 PDF 표시
- 3~5분 후 변환 워커가 PDF 변환 + 텍스트 추출 완료
- **새로고침하면 정상 표시 (TXT 배지 + 녹색 PDF)**
- **새로고침 없이는 BIN 배지 + 회색 PDF로 남아있음**

### 영향
- 사용자가 변환 실패로 오해
- 불필요한 "PDF 변환 재시도" 클릭 유발

### 근본 원인 분석

```
타임라인:
0초   — 업로드 → 파이프라인 → xPipe → "completed" + "conversion_failed" 마킹
       → UI: BIN 배지, 미지정, 회색 PDF
       → 폴링 시작 (0 B 조건)

10초  — 폴링 갱신 → 크기 업데이트 (0 B → 1.23 MB)
       → 하지만 여전히 BIN 배지 (변환 아직 안 됨)
       → 폴링 조건: convertible + BIN → 계속 폴링

60초  — 변환 워커 완료 → 텍스트 추출 → overallStatus: "embed_pending"
       → SSE "document-list-change" 발송
       → 폴링 갱신 → embed_pending 감지 → 계속 폴링

120초 — 임베딩 크론 완료 → overallStatus: "completed"
       → 폴링 갱신 → "completed" + TXT 배지
       → ✅ 정상 표시되어야 함

문제: 위 타임라인이 이론상 맞지만, 실제로는 폴링 갱신 시점과
      데이터 업데이트 시점 사이의 레이스 컨디션으로 인해
      "completed" + "BIN" 상태를 캐치하는 경우가 발생
```

### 이미 적용된 수정 (부분 해결)

1. **10초 폴링** — `DocumentExplorerView.tsx`
   - 0 B 크기, BIN 배지 convertible 파일 감지 시 폴링
   - 대부분의 파일(PDF, ZIP 등)은 이것으로 해결됨

2. **SSE document-list-change** — `documents-routes.js`
   - 변환 워커가 완료 시 `notify-conversion` → `document-list-change` 이벤트
   - `useDocumentStatusListSSE.ts`에서 수신 → `refresh-document-library` 이벤트 dispatch
   - DocumentExplorerView가 이 이벤트로 자동 갱신

3. **문제**: 위 두 메커니즘이 동시에 작동하지만, 타이밍에 따라 누락 가능

### 제안 수정안 (다음 세션)

**방안 A: 시간 기반 폴링 (가장 단순)**
```javascript
// 페이지 로드 후 5분간 무조건 10초 폴링
const mountTime = useRef(Date.now())
useEffect(() => {
  const elapsed = Date.now() - mountTime.current
  if (elapsed > 5 * 60 * 1000) return // 5분 초과 시 중지
  const interval = setInterval(() => {
    fetchExplorerTree(selectedInitialRef.current)
  }, 10000)
  return () => clearInterval(interval)
}, [explorerData?.documents, fetchExplorerTree])
```

**방안 B: SSE 전용 (가장 정확)**
- DocumentExplorerView에 `useDocumentStatusListSSE` 훅 직접 통합
- SSE 이벤트 수신 시 `fetchExplorerTree()` 직접 호출
- 폴링 불필요

**방안 C: overallStatus 기반 (방안 A+B 결합)**
- 변환 워커가 문서를 `embed_pending`으로 변경할 때, 프론트엔드가 이를 "처리 중"으로 인식
- "embed_pending" 상태가 존재하면 폴링 유지
- 임베딩 완료 → "completed" → 폴링 중지

### 테스트 방법
1. DB 삭제 → 36건 일괄 업로드 → 전체 문서 보기 이동
2. **새로고침 없이** 대기
3. 모든 HWP/PPTX 파일이 TXT 배지 + 녹색 PDF로 자동 갱신되는지 확인
4. 약 5분 내에 모든 파일이 정상 표시되어야 함

### 테스트 파일 위치
- 정상: `D:\Users\rossi\Desktop\캐치업코리아\정상\` (25건)
- 멈춤: `D:\Users\rossi\Desktop\캐치업코리아\멈춤 파일들\` (11건)
- 임시 업로드: `D:\aims\_tmp_upload\캐치업코리아\` (정상+멈춤 합쳐서 사용)

---

## 이번 세션 커밋 이력

| 커밋 | 내용 |
|------|------|
| `cfa262d9` | PDF 변환 워커 상태 복원 + MIME 타입 매핑 보강 |
| `7befb869` | 임베딩 레이스 컨디션 해결 + progress 100% 미갱신 수정 |
| `062c5c50` | 전체 문서 보기 처리 중 자동 갱신 (10초 폴링) |
| `ad6d8462` | 전체 문서 보기 자동 갱신 조건 보강 |
| `8f45947f` | PDF 변환 완료 시 전체 문서 보기 SSE 자동 갱신 |
| `2fd942b1` | docs: 미션 완료 보고서 + 개선 이슈 목록 |

---

## 관련 파일

| 파일 | 수정 내용 |
|------|-----------|
| `backend/api/document_pipeline/workers/pdf_conversion_worker.py` | processingSkipReason 클리어, document_type 반영, docembed pending 리셋 |
| `backend/embedding/full_pipeline.py` | progress: 100 설정 |
| `backend/api/aims_api/routes/documents-routes.js` | notify-conversion에서 document-list-change SSE 추가 |
| `frontend/aims-uix3/src/entities/document/model.ts` | ZIP/AI MIME 매핑 |
| `frontend/aims-uix3/src/components/DocumentViews/DocumentExplorerView/DocumentExplorerView.tsx` | 10초 폴링 + 조건 보강 |
| `frontend/aims-uix3/src/shared/hooks/useDocumentStatusListSSE.ts` | refresh-document-library 이벤트 dispatch |
