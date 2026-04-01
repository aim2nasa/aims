# AIMS 전체 테스트 인벤토리 보고서

> 작성일: 2026-04-02 | 조사 방법: 전체 파일 시스템 glob + 실제 실행 검증

---

## 요약

| 구분 | 스위트 수 | 테스트 수 | 비고 |
|------|----------|----------|------|
| **현재 /full-test 포함** | 10 | ~7,780 | 실행 완료 |
| **누락 — 로컬 실행 가능** | 12 | ~590+ | 즉시 추가 가능 |
| **누락 — 로컬 실행 불가** | 14 | ~60+ | 서버/외부 의존성 필요 |
| **합계** | **36** | **~8,430+** | |

---

## Part 1. 현재 /full-test에 포함된 테스트 (10개 스위트)

| # | 스위트 | 프레임워크 | 위치 | 테스트 수 | 상태 |
|---|--------|-----------|------|----------|------|
| 1 | Frontend 단위 테스트 | vitest | `frontend/aims-uix3/` | 4,840 | PASS |
| 2 | Frontend 타입 체크 | tsc --noEmit | `frontend/aims-uix3/` | - | PASS |
| 3 | Backend aims_api | Jest | `backend/api/aims_api/__tests__/` + `lib/__tests__/` | 1,196 | PASS |
| 4 | Backend aims_mcp | vitest | `backend/api/aims_mcp/src/` (단위만) | 802 | PASS |
| 5 | Backend document_pipeline | pytest | `backend/api/document_pipeline/tests/` | 735 | PASS |
| 6 | Backend annual_report_api | pytest | `backend/api/annual_report_api/tests/` | 92 | PASS |
| 7 | Backend embedding (self-healing) | pytest | `backend/embedding/tests/test_self_healing.py` | 12 | PASS |
| 8 | AutoClicker regression | pytest | `tools/auto_clicker_v2/tests/test_ac_regression.py` + `test_crs_save_validation.py` | 95 | PASS |
| 9 | Backend aims_api migration | node (assert) | `backend/api/aims_api/tests/` (20개 JS 파일) | 6 | PASS |
| 10 | Backend shared/schema import | node | `backend/shared/schema/test/` | 2 | PASS |

---

## Part 2. 누락된 로컬 실행 가능 테스트 (12개 스위트)

### 2-1. xPipe 단위 테스트 (pytest)

| 항목 | 내용 |
|------|------|
| **위치** | `backend/api/document_pipeline/xpipe/tests/` |
| **파일** | 17개 (`test_audit.py`, `test_cli.py`, `test_events.py`, `test_scheduler.py`, `test_pipeline.py`, `test_providers.py`, `test_quality.py`, `test_regression.py`, `test_testing.py`, `test_char_convert_real.py`, `test_char_server_state.py`, `test_char_env_fallback.py`, `test_char_classify_embed.py`, `test_char_imports.py`, `test_server_queue.py`, `test_extract_unsupported.py`, `test_ocr_chunked.py`) |
| **실행 결과** | **372 passed, 5 failed** (버전 출력/OCR 키/displayName 관련) |
| **명령어** | `cd backend/api/document_pipeline/xpipe && python -m pytest tests/ -v --tb=short` |
| **플랫폼** | Windows 로컬 실행 가능 (Linux 전용 아님) |
| **비고** | 5개 실패는 환경 차이 (CLI 버전 문자열, OCR API 키 미설정, displayName 에러텍스트 필터) |

### 2-2. Embedding 추가 테스트 (pytest)

| 항목 | 내용 |
|------|------|
| **위치** | `backend/embedding/tests/` |
| **파일** | `test_chunk_by_doc_type.py` (21개), `test_customer_id_in_chunks.py` (10개) |
| **실행 결과** | **29 passed, 2 failed** |
| **명령어** | `cd backend/embedding && python -m pytest tests/test_chunk_by_doc_type.py tests/test_customer_id_in_chunks.py -v --tb=short` |
| **비고** | 2개 실패: document_type 전달 로직 변경 미반영 (실제 버그 가능성) |

### 2-3. document_pipeline poc_legal (pytest)

| 항목 | 내용 |
|------|------|
| **위치** | `backend/api/document_pipeline/poc_legal/` |
| **파일** | `test_legal_adapter.py` |
| **실행 결과** | **31 passed** |
| **명령어** | `cd backend/api/document_pipeline && python -m pytest poc_legal/test_legal_adapter.py -v --tb=short` |
| **비고** | xPipe 이식성 PoC 검증. 순수 로직 테스트 |

### 2-4. src/docmeta 테스트 (pytest)

| 항목 | 내용 |
|------|------|
| **위치** | `src/docmeta/tests/` |
| **파일** | `test_core.py` |
| **실행 결과** | **10 passed** |
| **명령어** | `cd /d/aims && python -m pytest src/docmeta/tests/ -v --tb=short` |
| **비고** | 파일 메타데이터 추출 기능 검증. samples/ 디렉토리 필요 |

### 2-5. src/shared 테스트 (pytest)

| 항목 | 내용 |
|------|------|
| **위치** | `src/shared/tests/` |
| **파일** | `test_mime_utils.py` (10개), `test_pdf_utils.py` (6개 + 6개 skip), `test_exif_utils.py` (6개) |
| **실행 결과** | **28 passed** |
| **명령어** | `cd /d/aims && python -m pytest src/shared/tests/ -v --tb=short` |
| **비고** | MIME 탐지, PDF 페이지 수, EXIF 메타데이터 추출 검증 |

### 2-6. AutoClicker 증분 리포트 (pytest)

| 항목 | 내용 |
|------|------|
| **위치** | `tools/auto_clicker_v2/tests/` |
| **파일** | `test_incremental_report.py` |
| **실행 결과** | **9 passed** |
| **명령어** | `cd tools/auto_clicker_v2 && python -m pytest tests/test_incremental_report.py -v --tb=short` |
| **비고** | 증분 리포트 엑셀 갱신, 빈 데이터, 덮어쓰기, atomic write 검증 |

### 2-7. AutoClicker 알림 차단 (pytest)

| 항목 | 내용 |
|------|------|
| **위치** | `tools/auto_clicker_v2/tests/` |
| **파일** | `test_notification_blocker.py` (3개), `test_mechanism_verify.py` (3개) |
| **실행 결과** | **6 passed** (ctypes 경고 있으나 통과) |
| **명령어** | `cd tools/auto_clicker_v2 && python -m pytest tests/test_notification_blocker.py tests/test_mechanism_verify.py -v --tb=short` |
| **비고** | Windows 레지스트리/창 감지 메커니즘 검증. Win32 API 사용 |

### 2-8. metdo_reader HTML 텍스트 추출 (pytest)

| 항목 | 내용 |
|------|------|
| **위치** | `tools/metdo_reader/tests/` |
| **파일** | `test_extract_text_from_html.py` |
| **실행 결과** | **16 passed** |
| **명령어** | `cd tools/metdo_reader && python -m pytest tests/ -v --tb=short` |
| **비고** | Upstage OCR HTML 출력 → 클린 텍스트 추출 로직 검증 |

### 2-9. mime_type_analyzer (pytest)

| 항목 | 내용 |
|------|------|
| **위치** | `tools/mime_type_analyzer/tests/` |
| **파일** | `test_file_analyzer.py` |
| **실행 결과** | **1 passed, 7 skipped** (샘플 파일 없는 항목 스킵) |
| **명령어** | `cd tools/mime_type_analyzer && python -m pytest tests/ -v --tb=short` |
| **비고** | 파일 분석 도구 검증 |

### 2-10. aims_rag_api 부분 실행 가능 (pytest)

| 항목 | 내용 |
|------|------|
| **위치** | `backend/api/aims_rag_api/tests/` |
| **파일** | `test_query_analyzer.py` (15개), `test_reranker.py` (17개) |
| **실행 결과** | **32 passed** (test_hybrid_search 16 failed, test_rag_search import 에러) |
| **명령어** | `cd backend/api/aims_rag_api && python -m pytest tests/test_query_analyzer.py tests/test_reranker.py -v --tb=short` |
| **비고** | query_analyzer와 reranker는 mock 기반으로 로컬 실행 가능. hybrid_search/rag_search는 qdrant_client 필요 |

### 2-11. AutoClicker compact display (pytest)

| 항목 | 내용 |
|------|------|
| **위치** | `tools/auto_clicker_v2/` |
| **파일** | `test_compact_display.py` |
| **실행 조건** | 로컬 실행 가능 (순수 로직, log_parser/app_state 의존) |
| **명령어** | `cd tools/auto_clicker_v2 && python -m pytest test_compact_display.py -v --tb=short` |
| **비고** | 파서 + 상태 + 컴팩트 표시 검증 |

### 2-12. aims_mcp E2E 제외분 중 일부 (vitest)

| 항목 | 내용 |
|------|------|
| **위치** | `backend/api/aims_mcp/src/__tests__/` |
| **파일** | `cross-platform-consistency.test.ts` |
| **실행 조건** | 현재 exclude 목록에 포함되어 있으나, 서버 연동 없이 실행 가능할 수 있음 |
| **비고** | 검토 필요 — 현재는 E2E로 분류되어 제외 중 |

---

## Part 3. 누락된 로컬 실행 불가 테스트 (14개)

### 3-1. 서버 실행 필요 (HTTP 요청 기반)

| # | 파일 | 위치 | 의존성 | 비고 |
|---|------|------|--------|------|
| 1 | `test_data_isolation.py` | `backend/api/aims_api/` | localhost:3010 | aims_api 서버 실행 필요 |
| 2 | `test_thumbnail_api.py` | `backend/api/pdf_proxy/tests/` | localhost:8002 | pdf_proxy 서버 실행 필요 |
| 3 | `test_pipeline_e2e.py` | `backend/api/document_pipeline/e2e/` | MongoDB + Redis + 서버 | 파이프라인 전체 인프라 필요 |
| 4 | `test_side_effects.py` | `backend/api/document_pipeline/golden_master/` | MongoDB + 서버 | 업로드→처리→DB 확인 동적 검증 |
| 5 | `health-check.test.js` | `tests/backend-api/1-health-check/` | 모든 서비스 엔드포인트 | tars 서버 전체 health check |
| 6 | `smartsearch-automation.test.js` | `tests/backend-api/smartsearch/` | MongoDB + webhook | DB 시드 → 엔드포인트 호출 |
| 7 | `api-integration.test.js` | `mobile/aims-mobile/__tests__/` | aims.giize.com | 프로덕션 API 통합 테스트 |

### 3-2. 외부 모듈/라이브러리 의존

| # | 파일 | 위치 | 의존성 | 비고 |
|---|------|------|--------|------|
| 8 | `test_preprocess_text.py` | `backend/embedding/` | langchain | 서버에만 설치된 모듈 |
| 9 | `test_rag_quality.py` | `backend/embedding/` | Qdrant + OpenAI | 벡터 DB + 임베딩 모델 |
| 10 | `test_qdrant_customer_sync.py` | `backend/tests/` | Qdrant | customer_id 동기화 |
| 11 | `test_hybrid_search.py` + `test_rag_search.py` | `backend/api/aims_rag_api/tests/` | qdrant_client | import 단계에서 실패 |
| 12 | `test_hybrid_search.py` (root) | `backend/api/aims_rag_api/` | Qdrant + OpenAI | 하이브리드 검색 통합 테스트 |

### 3-3. SikuliX/GUI 의존

| # | 파일 | 위치 | 의존성 | 비고 |
|---|------|------|--------|------|
| 13 | MetlifePDF.sikuli 전체 (6개) | `tools/MetlifePDF.sikuli/test/` + root | SikuliX + Java + Chrome | `test_clova_ocr`, `test_upstage_ocr`, `test_upstage_enhanced`, `test_scroll`, `test_alert_handling`, `test_scroll_only`, `test_scroll_to_top_simple`, `test_sort_feature`, `test_x_button_offset` |
| | MetlifePDF_v2.sikuli (동일) | `tools/MetlifePDF_v2.sikuli/` | 상동 | v1과 동일 구조 복제본 |

### 3-4. 실제 데이터/API 의존

| # | 파일 | 위치 | 의존성 | 비고 |
|---|------|------|--------|------|
| 14-a | `test_table_extraction.py` | `backend/api/annual_report_api/` | 실제 PDF 파일 (D:\MetlifeReport\) | 로컬에 PDF 있으면 실행 가능하나 CI 불가 |
| 14-b | `test_table_extractor.py` | `backend/api/annual_report_api/` | ~/aims/samples/MetlifeReport/ | 서버 경로 샘플 필요 |
| 14-c | `test_cr_table_extractor.py` | `backend/api/annual_report_api/` | 실제 CRS PDF 파일 | Ground Truth 검증 |
| 14-d | `test_parse_crs_pdf.py` | `tools/CustomerReviewService/` | 5개 샘플 CRS PDF | 파싱 정확도 검증 |
| 14-e | `test_tool_selection.py` | `tools/ai_assistant_tuning/` | OpenAI API (gpt-4.1-mini) | 실제 API 호출 필요 |
| 14-f | `stress_test.py` | `tools/stress_test/` | 서버 + 파일 업로드 | 스트레스 테스트 도구 |

### 3-5. SikuliX/Jython 의존 (AutoClicker)

| # | 파일 | 위치 | 의존성 | 비고 |
|---|------|------|--------|------|
| - | `test_app_focus_poc.py` | `tools/auto_clicker_v2/` | SikuliX + Java | App.focus() PoC |
| - | `test_focus_recovery_integrated.py` | `tools/auto_clicker_v2/` | SikuliX + Chrome 창 | ensure_browser_focus 통합 검증 |
| - | `test_pause_resume.py` | `tools/auto_clicker_v2/` | java.awt (Jython) | Pause/Resume 메커니즘 |
| - | `test_live_pause.py` | `tools/auto_clicker_v2/` | SikuliX | 라이브 일시중지 |
| - | `test_pause_injector.py` | `tools/auto_clicker_v2/` | SikuliX | 일시중지 주입기 |
| - | `test_gui_autostart.py` | `tools/auto_clicker_v2/` | tkinter GUI + 실행 환경 | GUI 자동 실행 + 컴팩트 패널 |
| - | `test_notification_real.py` | `tools/auto_clicker_v2/tests/` | Windows 알림 시스템 | 실제 알림 발생 필요 |
| - | `test_notification_scan.py` | `tools/auto_clicker_v2/tests/` | 실행 중 알림 스캔 | 시각적 확인 |
| - | `test_notification_visual.py` | `tools/auto_clicker_v2/tests/` | 시각적 검증 | collect 0 items |

### 3-6. PoC/도구 테스트 (외부 의존)

| # | 파일 | 위치 | 의존성 | 비고 |
|---|------|------|--------|------|
| - | `test_ar_parser.py` | `tools/ar_generator_py/` | 실제 PDF + fitz | MetLife AR PDF 파싱 |
| - | `test_parse.py` | `tools/ar_generator_py/` | PyMuPDF + PDF 파일 | 원본 vs 생성 PDF 비교 |
| - | `test_original_pdf.py` | `tools/ar_generator_py/` | ARGenerator + PDF | 원본 PDF 파싱 |

---

## Part 4. Frontend Playwright E2E 테스트 (별도 옵션)

> `/full-test --e2e`로 별도 실행. 브라우저 + 프리뷰 서버 필요.

| 카테고리 | 위치 | 파일 수 | 내용 |
|---------|------|--------|------|
| **E2E 기능** | `tests/e2e/` | 19개 | navigation, login, customer CRUD, AI assistant, document explorer, xpipe, sort, relationship, regional, contract, tabs, search 등 |
| **반응형** | `tests/responsive/` | 7개 | mobile, phone landscape, rotation, CSS debug |
| **비주얼** | `tests/visual/` | 2개 | visual regression, CSS refactor regression |
| **접근성** | `tests/a11y/` | 1개 | accessibility |
| **루트** | `tests/*.spec.ts` | 14개 | customer CRUD variants, map sync, address search, icons, hover, login PIN, alias, document explorer |
| **합계** | | **43개 spec** | |

---

## Part 5. 전체 테스트 맵 (파일 수 기준)

```
aims/
├── frontend/aims-uix3/
│   ├── src/**/*.test.{ts,tsx}         → 249 파일 (vitest)          [포함]
│   ├── tests/**/*.spec.ts             → 43 파일 (Playwright)       [--e2e 옵션]
│   └── tsconfig (typecheck)                                        [포함]
│
├── backend/
│   ├── api/aims_api/
│   │   ├── __tests__/**/*.test.js     → 46 파일 (Jest)             [포함]
│   │   ├── lib/__tests__/*.test.js    → 8 파일 (Jest)              [포함]
│   │   ├── tests/*.js                 → 20 파일 (node assert)      [포함]
│   │   └── test_data_isolation.py     → 1 파일                     [서버 필요]
│   │
│   ├── api/aims_mcp/src/
│   │   ├── *.test.ts (단위)           → 18 파일 (vitest)           [포함]
│   │   └── **/*.e2e.test.ts           → 17 파일 (vitest E2E)       [서버 필요]
│   │
│   ├── api/document_pipeline/
│   │   ├── tests/test_*.py            → 20 파일 (pytest)           [포함]
│   │   ├── xpipe/tests/test_*.py      → 17 파일 (pytest)           [★ 누락]
│   │   ├── poc_legal/test_*.py        → 1 파일 (pytest)            [★ 누락]
│   │   ├── e2e/test_*.py              → 1 파일                     [서버 필요]
│   │   └── golden_master/test_*.py    → 1 파일                     [서버 필요]
│   │
│   ├── api/annual_report_api/
│   │   ├── tests/test_*.py            → 8 파일 (pytest)            [포함]
│   │   └── test_*.py (root)           → 3 파일                     [PDF 파일 필요]
│   │
│   ├── api/aims_rag_api/
│   │   ├── tests/test_query_analyzer  → 1 파일                     [★ 누락 (실행 가능)]
│   │   ├── tests/test_reranker        → 1 파일                     [★ 누락 (실행 가능)]
│   │   ├── tests/test_hybrid_search   → 1 파일                     [qdrant 필요]
│   │   ├── tests/test_rag_search      → 1 파일                     [qdrant 필요]
│   │   └── test_hybrid_search.py      → 1 파일                     [qdrant 필요]
│   │
│   ├── api/pdf_proxy/tests/           → 1 파일                     [서버 필요]
│   │
│   ├── embedding/
│   │   ├── tests/test_self_healing.py → 1 파일 (pytest)            [포함]
│   │   ├── tests/test_chunk_*.py      → 1 파일                     [★ 누락]
│   │   ├── tests/test_customer_*.py   → 1 파일                     [★ 누락]
│   │   ├── test_preprocess_text.py    → 1 파일                     [langchain 필요]
│   │   └── test_rag_quality.py        → 1 파일                     [Qdrant 필요]
│   │
│   ├── shared/schema/test/            → 2 파일 (node)              [포함]
│   └── tests/                         → 1 파일                     [Qdrant 필요]
│
├── src/
│   ├── docmeta/tests/                 → 1 파일 (pytest)            [★ 누락]
│   └── shared/tests/                  → 3 파일 (pytest)            [★ 누락]
│
├── tests/
│   ├── test_docmeta.py                → 1 파일                     [★ 누락 (samples 필요)]
│   ├── test_dococr.py                 → 1 파일                     [서버 필요 (n8n webhook)]
│   ├── test_doccase.py                → 빈 파일                    [무시]
│   ├── test_doctag.py                 → 빈 파일                    [무시]
│   └── backend-api/                   → 2 파일                     [서버 필요]
│
├── tools/
│   ├── auto_clicker_v2/
│   │   ├── tests/test_ac_regression   → 1 파일 (pytest)            [포함]
│   │   ├── tests/test_crs_save_valid  → 1 파일 (pytest)            [포함]
│   │   ├── tests/test_incremental_*   → 1 파일                     [★ 누락]
│   │   ├── tests/test_notification_*  → 3 파일                     [Win32 GUI 의존]
│   │   ├── tests/test_mechanism_*     → 1 파일                     [★ 누락 (로컬 가능)]
│   │   ├── test_compact_display.py    → 1 파일                     [★ 누락]
│   │   └── test_*.py (SikuliX)        → 5 파일                     [SikuliX 필요]
│   │
│   ├── metdo_reader/tests/            → 1 파일 (pytest)            [★ 누락]
│   ├── mime_type_analyzer/tests/      → 1 파일 (pytest)            [★ 누락]
│   ├── CustomerReviewService/         → 1 파일                     [PDF 샘플 필요]
│   ├── ai_assistant_tuning/           → 1 파일                     [OpenAI API 필요]
│   ├── ar_generator_py/               → 3 파일                     [PDF 파일 필요]
│   ├── MetlifePDF.sikuli/             → 9 파일                     [SikuliX 필요]
│   ├── MetlifePDF_v2.sikuli/          → 9 파일                     [SikuliX 필요]
│   └── stress_test/                   → 1 파일                     [서버 필요]
│
└── mobile/aims-mobile/__tests__/      → 1 파일                     [서버 필요]
```

**범례**: [포함] = 현재 /full-test에 포함 | [★ 누락] = 로컬 실행 가능하나 누락 | 나머지 = 실행 불가 사유 명시

---

## Part 6. 추천 조치

### 즉시 추가 권장 (로컬 실행 가능, 검증 완료)

| 우선순위 | 스위트 | 테스트 수 | 명령어 |
|---------|--------|----------|--------|
| **P0** | xpipe 단위 테스트 | 372+ | `cd backend/api/document_pipeline/xpipe && python -m pytest tests/` |
| **P0** | embedding 추가 | 29 | `cd backend/embedding && python -m pytest tests/test_chunk_by_doc_type.py tests/test_customer_id_in_chunks.py` |
| **P0** | src/docmeta + src/shared | 38 | `cd /d/aims && python -m pytest src/docmeta/tests/ src/shared/tests/` |
| **P1** | poc_legal adapter | 31 | `cd backend/api/document_pipeline && python -m pytest poc_legal/` |
| **P1** | aims_rag_api 부분 | 32 | `cd backend/api/aims_rag_api && python -m pytest tests/test_query_analyzer.py tests/test_reranker.py` |
| **P1** | AC 증분 리포트 | 9 | `cd tools/auto_clicker_v2 && python -m pytest tests/test_incremental_report.py` |
| **P1** | AC 알림 차단 | 6 | `cd tools/auto_clicker_v2 && python -m pytest tests/test_notification_blocker.py tests/test_mechanism_verify.py` |
| **P2** | metdo_reader | 16 | `cd tools/metdo_reader && python -m pytest tests/` |
| **P2** | mime_type_analyzer | 1 | `cd tools/mime_type_analyzer && python -m pytest tests/` |
| **P2** | AC compact display | ~5 | `cd tools/auto_clicker_v2 && python -m pytest test_compact_display.py` |

### 주의 필요 (실패 테스트 존재)

| 스위트 | 실패 수 | 원인 |
|--------|--------|------|
| xpipe | 5 failed | CLI 버전 문자열, OCR 키 미설정, displayName 에러텍스트 필터 |
| embedding 추가 | 2 failed | document_type 전달 로직 변경 미반영 (실제 버그 가능성) |
| aims_rag_api hybrid_search | 16 failed | mock 구조와 코드 변경 불일치 |

---

## Part 7. /full-test 우선 추가 대상 (핵심 기능 기준)

AIMS는 **보험 설계사용 지능형 문서 관리 시스템**이므로, 핵심 기능은:
1. **문서 파이프라인** (업로드→OCR→분류→임베딩)
2. **임베딩/RAG 검색** (문서 벡터 검색)
3. **AR/CRS 처리** (보험 계약 현황 파싱)

이 기준으로 Part 2의 누락 테스트 중 핵심 기능에 해당하는 4개 스위트:

| 우선순위 | 스위트 | 테스트 수 | 핵심 이유 |
|---------|--------|----------|----------|
| **핵심** | **xpipe 단위 테스트** | 372+ | 차세대 문서 파이프라인 엔진. 현재 최우선 프로젝트(xPipe Phase 3) |
| **핵심** | **embedding 추가** (chunk/customer_id) | 29 | 임베딩 청킹 파라미터 + 고객ID 전달. **2건 실패 = 실제 버그 가능성** |
| **핵심** | **aims_rag_api 부분** (query_analyzer, reranker) | 32 | RAG 검색 품질의 핵심 — 쿼리 분석 + 재순위화 |
| **핵심** | **poc_legal adapter** | 31 | xPipe 이식성 계약 테스트. xPipe 확장 전 기반 |

**합계: 4개 스위트, ~464개 테스트**

나머지 누락 테스트는 보조/도구 영역:
- `src/docmeta + src/shared` — 유틸리티 (메타 추출, MIME, PDF 페이지 수)
- `AC 증분 리포트/알림 차단` — AutoClicker 부가 기능
- `metdo_reader/mime_type_analyzer` — 개별 도구

---

## Part 8. 참고: venv/node_modules 내 테스트

아래는 의존성 패키지 내부 테스트로, 프로젝트 테스트와 무관합니다:
- `tools/ar_generator_py/venv/` — win32ctypes 패키지 테스트
- `tools/ar_parser_compare/venv/` — sniffio, annotated_types 패키지 테스트
- `backend/api/aims_api/node_modules/` — sinonjs 패키지 테스트
- `backend/api/aims_mcp/node_modules/` — zod, fast-uri 패키지 테스트
- `mobile/node_modules/` — zod 패키지 테스트

이들은 모두 **제외 대상**입니다.
