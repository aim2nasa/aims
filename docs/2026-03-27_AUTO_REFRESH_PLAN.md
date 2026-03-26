# 문서 처리 완료 후 UI 자동 갱신 — 작업 계획

> 작성일: 2026-03-27 00:30 KST
> 상태: **진행 중**

---

## 목표

HWP/PPTX 등 변환 대상 파일의 처리 완료 후, **새로고침 없이** 배지(BIN→TXT)·문서유형·PDF 배지가 자동 갱신되도록 한다.

## 핵심 전략

**복잡한 SSE/폴링 로직 대신, "처리 완료 시 데이터 재조회(fetch)" 1회로 해결한다.**

---

## 작업 순서

### Step 1: F5 로그아웃 버그 수정
- [ ] 원인 조사 (세션/토큰 저장 방식)
- [ ] 수정
- [ ] F5 눌러도 로그인 유지됨 확인

### Step 2: 수동 테스트 — "F5하면 배지 정상 표시됨" 증명
- [ ] HWP 파일 업로드 → 전체 문서 보기 이동
- [ ] 변환 완료 대기 (BIN + 미지정 상태)
- [ ] F5 새로고침
- [ ] TXT 배지 + 문서유형 + 녹색 PDF 배지로 정상 표시 확인
- [ ] 전/후 스크린샷 비교

### Step 3: 불필요한 복잡 로직 삭제
- [ ] SSE 직접 수신 훅 제거 (커밋 786e6ec9에서 추가한 것)
  - `DocumentExplorerView.tsx`의 `useDocumentStatusListSSE` 훅 호출 제거
  - import 제거
- [ ] 관련 regression 테스트 제거/수정
- [ ] 빌드 확인

### Step 4: "처리 완료 시 자동 fetch" 구현
- [ ] 폴링 조건 단순화: `overallStatus !== 'completed'`인 문서가 있으면 폴링
- [ ] "처리중 → 처리 완료" 전환 감지 시 `fetchExplorerTree()` 1회 강제 호출
- [ ] 빌드 확인

### Step 5: 배포 → 자동 갱신 증명
- [ ] 배포 (`deploy_all.sh`)
- [ ] DB 정리 → HWP 파일 업로드 → 전체 문서 보기
- [ ] **새로고침 없이** HWP가 BIN → TXT + 인사/노무 + 녹색 PDF로 자동 전환 확인
- [ ] 스크린샷 증거

---

## 이전 세션 커밋 (참고)

| 커밋 | 내용 | 유지/삭제 |
|------|------|----------|
| `786e6ec9` | SSE 직접 수신 (useDocumentStatusListSSE) | **삭제 대상** |
| `3c2a2082` | conversion_pending 도입 + 문서유형 `-` 표시 | **유지** |

## 관련 문서

- [이슈 보고서](docs/2026-03-26_PREMATURE_COMPLETED_BUG.md)
- [F5 로그아웃 버그](docs/2026-03-27_F5_LOGOUT_BUG.md)
- [테스트 절차서](docs/2026-03-26_STUCK_DOCUMENTS_TEST_PROCEDURE.md)
