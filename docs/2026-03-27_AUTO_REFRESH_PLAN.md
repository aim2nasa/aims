# 문서 처리 완료 후 UI 자동 갱신 — 작업 계획

> 작성일: 2026-03-27 00:30 KST
> 최종 업데이트: 2026-03-27 02:30 KST
> 상태: **진행 중 — Step 1 완료, Step 2 진행 중**

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

### Step 2: 수동 테스트 — "F5하면 배지 정상 표시됨" 증명 ⏳ 진행 중

**추가 작업: 요약/전체텍스트 버튼 센서 구현**

Step 2 테스트 도중 사용자 요청으로 요약/전체텍스트 버튼 비활성화 기능 추가.
이 버튼이 활성화되면 텍스트 추출 완료 = PDF 변환 성공을 의미하므로, PDF 배지 상태를 관찰하는 센서 역할.

**구현 결과:**
- [x] 요약 버튼: `meta.summary || ocr.summary` 유무로 활성/비활성
- [x] 전체텍스트 버튼: `_hasMetaText || _hasOcrText` 유무로 활성/비활성
- [x] 6곳 전부 적용 (DocumentExplorerTree 2곳 + PersonalFilesView + DocumentSearchView + DocumentStatusList + DocumentStatusTable)
- [x] 테스트 PASS: BIN 파일 12건 disabled, TXT/OCR 파일 24건 enabled

**발견된 문제와 해결:**

| 문제 | 원인 | 해결 |
|------|------|------|
| disabled 안 됨 (1차) | `doc.summary` 접근 → API는 `meta.summary` | `doc.meta?.summary`로 수정 |
| disabled 안 됨 (2차) | 6곳 중 2곳만 적용 | 나머지 4곳에도 동일 적용 |
| disabled 안 됨 오판 | 초성 미선택 시 기존 문서(텍스트 있음)의 버튼 확인 | ㅋ 초성 선택 후 재확인 → 정상 동작 |

**커밋:**
- `b6e91e88` — DocumentExplorerTree 2곳 + CSS disabled 스타일
- `cc74421d` — meta.summary + ocr.summary 양쪽 확인
- `f6a2ab40` — 나머지 4곳 적용

**F5 증명: 미완료** — 버튼 센서 구현에 시간을 사용. Step 2 계속 진행 필요.

### Step 3: 불필요한 복잡 로직 삭제
- [ ] SSE 직접 수신 훅 제거 (코드 reset으로 이미 삭제됨, 재추가되지 않았으므로 확인만)
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

## 커밋 이력

| 커밋 | 내용 | Step |
|------|------|------|
| `b583e1fe` | F5 로그아웃 — PIN 세션 TTL 7일 | Step 1 |
| `b6e91e88` | 요약/전체텍스트 버튼 disabled (2곳) | Step 2 부가 |
| `cc74421d` | 요약 버튼 meta + ocr 양쪽 확인 | Step 2 부가 |
| `f6a2ab40` | 버튼 disabled 나머지 4곳 적용 | Step 2 부가 |

## 관련 문서

- [이슈 보고서](docs/2026-03-26_PREMATURE_COMPLETED_BUG.md)
- [F5 로그아웃 버그](docs/2026-03-27_F5_LOGOUT_BUG.md)
- [버튼 센서 보고서](docs/2026-03-27_BUTTON_SENSOR_SIMPLE.md)
- [테스트 절차서](docs/2026-03-26_STUCK_DOCUMENTS_TEST_PROCEDURE.md)
