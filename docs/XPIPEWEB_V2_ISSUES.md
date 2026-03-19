# xPipeWeb v2 — 수정 사항 목록

**작성일**: 2026-03-19
**상태**: 18건 일괄 수정 완료 (테스트 254개 ALL PASS)

---

## 수정 완료 목록

### 버그 수정 (1~4)

| # | 항목 | 파일 | 상태 |
|---|------|------|------|
| 1 | 이중 실행 루프 삭제 — 가짜 stage_start + sleep 15행 제거 | server.py | **완료** |
| 2 | pipeline.py에 stage_start 이벤트 추가 — execute() 직전 발행 | pipeline.py | **완료** |
| 3 | _track_stage_start 리스너 추가 + finally off() | server.py | **완료** |
| 4 | selectedDocId 방어 — 문서 없으면 null 초기화 + 패널 닫기 | app.js | **완료** |

### 기능 누락 (5~8)

| # | 항목 | 파일 | 상태 |
|---|------|------|------|
| 5 | 모든 문서에 삭제 버튼 — processing은 disabled | app.js | **완료** |
| 6 | 전체 초기화 — DELETE /api/documents + 필터 바 버튼 | server.py, app.js, index.html | **완료** |
| 7 | OCR 모델 목록 수정 — PaddleOCR/Upstage/Tesseract, 기본값 PaddleOCR | server.py, index.html | **완료** |
| 8 | CSV 다운로드 버튼 — 벤치마크 모달 푸터 | app.js, index.html | **완료** |

### UX 개선 (9~14)

| # | 항목 | 파일 | 상태 |
|---|------|------|------|
| 9 | SSE 인디케이터 텍스트 — "연결됨"/"끊김" | app.js, index.html, style.css | **완료** |
| 10 | 설정 패널 2그룹 — "엔진 설정" + "모델 설정" | index.html, style.css | **완료** |
| 11 | compact 복원 — 문서 0건이면 compact 클래스 제거 | app.js | **완료** |
| 12 | 빈 상태 메시지 통일 — "[항목]이 없습니다." 패턴 | app.js, index.html | **완료** |
| 13 | stub 부연 — "stub (시뮬레이션)" | app.js | **완료** |
| 14 | 벤치마크 0건 disabled — 완료 문서 없으면 비활성화 | app.js | **완료** |

### 안정성 (15~18)

| # | 항목 | 파일 | 상태 |
|---|------|------|------|
| 15 | stage_data 이중 기록 정리 — 리스너 기록 제거, pipeline.run() 결과만 사용 | server.py | **완료** |
| 16 | SSE + 폴링 중복 방지 — SSE 연결 시 폴링 중지, 끊김 시 fallback | app.js | **완료** |
| 17 | 처리 중 삭제 시 cancellation — _cancelled 플래그 + 스테이지 전 체크 | server.py | **완료** |
| 18 | stage_start 테스트 3건 추가 | test_pipeline.py | **완료** |

---

## 기존 이슈 해결 상태

### 사용자 직접 지적

| # | 이슈 | 상태 |
|---|------|------|
| U1 | 품질 칼럼 의미 없는 값 | **코드상 정상** — stub 시 quality=None, "-" 표시 |
| U2 | 추출 텍스트 로드 실패 404 | **수정 완료** — #1(이중 루프 제거) + #4(selectedDocId 방어) |
| U3 | 처리 결과 삭제 기능 없음 | **수정 완료** — #5(모든 문서 삭제 버튼) + #6(전체 초기화) |
| U4 | stages_data 빈 dict | **수정 완료** — #1(이중 루프 제거) + #2(pipeline stage_start) + #15(이중 기록 정리) |
| U5 | 모델 표시/변경 | **정상** |
| U6 | OCR 모델/confidence 미표시 | **정상** |
| U7 | AIMS 정보 전부 제공 | 부분 반영 |

### Gini 검증 지적

| # | 이슈 | 상태 |
|---|------|------|
| G1 | provider → mode KeyError | **해결** |
| G2 | stage_complete SSE에 stage_data 포함 | **정상** |
| G3 | adapter_name 취득 불안정 | **해결** |
| G4 | AIMS 정보 8개 항목 | 부분 반영 |
| G5 | 테스트 계획 없음 | **해결** — #18 stage_start 테스트 3건 추가 (총 254개 PASS) |
| G6 | EventBus 리스너 누적 | **해결** — stage_start/stage_complete 양쪽 off() |

---

## 검증 결과

- **테스트**: 254개 ALL PASS (기존 251 + 신규 3)
- **코어 변경**: pipeline.py에 stage_start 이벤트 8행만 추가 (최소 변경)
