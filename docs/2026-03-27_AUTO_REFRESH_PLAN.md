# 문서 처리 완료 후 UI 자동 갱신 — 작업 계획

> 작성일: 2026-03-27 00:30 KST
> 최종 업데이트: 2026-03-27 04:30 KST
> 상태: **완료 — 5단계 전체 완료, 3건 이슈 해결**

---

## 목표

HWP/PPTX 등 변환 대상 파일의 처리 완료 후, **새로고침 없이** 배지(BIN→TXT)·문서유형·PDF 배지가 자동 갱신되도록 한다.

## 핵심 전략

**복잡한 SSE/폴링 로직 대신, "처리 완료 시 데이터 재조회(fetch)" 1회로 해결한다.**

---

## 작업 순서

### Step 1: F5 로그아웃 버그 수정 ✅ 완료
- [x] 원인: `SESSION_TOKEN_TTL_MS` 1시간 vs JWT TTL 7일 불일치
- [x] 수정: `auth.js` L17 — 1시간 → 7일 (커밋 `b583e1fe`)
- [x] F5 눌러도 로그인 유지됨 확인

### Step 2: 수동 테스트 — "F5하면 배지 정상 표시됨" 증명 ✅ 완료
- [x] F5 후 배지 정상 표시 확인
- [x] 요약/전체텍스트 버튼 센서 구현 (6곳)
- 커밋: `b6e91e88`, `cc74421d`, `f6a2ab40`

### Step 3: 불필요한 복잡 로직 삭제 ✅ 완료
- [x] SSE 직접 수신 훅 제거 확인
- [x] 빌드 확인

### Step 4: "처리 완료 시 자동 fetch" 구현 ✅ 완료
- [x] 3초 폴링 + wasProcessingRef 조건 단순화 (커밋 `eee35d55`)
- [x] 3건 이슈 일괄 수정 (커밋 `1cdfad79`)
  - 조기 completed: 일반 경로 conversion_pending 분기
  - ocr.summary: API 응답에 추가
  - 이미지 OCR 배지: badgeType에 image/* 추가
- [x] xPipe 경로 conversion_pending 분기 (커밋 `907133bc`)

### Step 5: 배포 → 자동 갱신 증명 ✅ 완료
- [x] 배포 (`deploy_all.sh`) — 13/13 전체 완료
- [x] DB 정리 → 36건 업로드 → 전체 문서 보기
- [x] **새로고침 없이** HWP가 BIN → TXT + 인사/노무로 자동 전환 확인
- [x] 안영미신분증.ppt → OCR 배지 + 신분증 + 요약 존재
- [x] 암검진067.jpg → OCR 배지
- [x] 스크린샷 증거: `D:/tmp/processing_1~5.png`, `D:/tmp/issue2_3_check.png`

---

## 커밋 이력

| 커밋 | 내용 | Step |
|------|------|------|
| `b583e1fe` | F5 로그아웃 — PIN 세션 TTL 7일 | Step 1 |
| `b6e91e88` | 요약/전체텍스트 버튼 disabled (2곳) | Step 2 |
| `cc74421d` | 요약 버튼 meta + ocr 양쪽 확인 | Step 2 |
| `5a43bba4` | 버튼 6곳 disabled + xPipe summary 누락 | Step 2 |
| `eee35d55` | 폴링 3초 + 조건 단순화 + 마지막 fetch | Step 4 |
| `1cdfad79` | 3건 이슈 일괄 수정 — 조기completed + ocr.summary + 이미지OCR배지 | Step 4 |
| `907133bc` | xPipe 경로 조기completed 방지 — conversion_pending 분기 | Step 4 |

## 관련 문서

- [이슈 보고서](docs/2026-03-26_PREMATURE_COMPLETED_BUG.md)
- [F5 로그아웃 버그](docs/2026-03-27_F5_LOGOUT_BUG.md)
- [버튼 센서 보고서](docs/2026-03-27_BUTTON_SENSOR_SIMPLE.md)
- [테스트 절차서](docs/2026-03-26_STUCK_DOCUMENTS_TEST_PROCEDURE.md)
- [남은 이슈 + 기술 부채](docs/2026-03-27_REMAINING_ISSUES.md)
- **결과 보고서**: [2026-03-27_AUTO_REFRESH_RESULT.md](docs/2026-03-27_AUTO_REFRESH_RESULT.md)
