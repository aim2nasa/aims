# Document Pipeline 3-Phase 방어 시스템

> 문서 파이프라인의 기능 안정성을 보장하기 위한 다계층 품질 방어 체계.
> 코드 변경 ~ 배포 ~ 운영 전 단계에서 이상을 자동 감지한다.

---

## 1. 도입 배경

### 문제

문서 파이프라인은 10종 파일 형식 x 3개 처리 경로 x 5개 외부 의존성이 결합된 복합 시스템이다. 한 곳의 변경이 다른 경로를 침묵 파손(silent breakage)시킬 수 있으며, 기존에는 이를 감지할 자동화 수단이 없었다.

| 장애 유형 | 기존 감지 방식 | 문제 |
|-----------|--------------|------|
| 코드 변경으로 인한 로직 파손 | 수동 테스트 | 394개 경로를 매번 수동 확인 불가능 |
| 배포 후 파일 형식 처리 실패 | 사용자 신고 | 사용자가 발견할 때까지 장애 지속 |
| 운영 중 의존성 다운 (MongoDB, pdf_converter 등) | `/health` 체크 | uvicorn alive만 확인, 기능 장애 미감지 |

### 해결 전략

3개 Phase로 계층화하여, 코드 ~ 배포 ~ 운영 전 단계를 자동 방어한다.

```
Phase 1: 회귀 테스트 ─── 코드 변경 시점 ─── "로직이 깨졌는가?"
Phase 2: 스모크 테스트 ─── 배포 시점 ──── "실제로 동작하는가?"
Phase 3: 런타임 모니터링 ── 운영 중 ──── "지금도 정상인가?"
```

---

## 2. 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────────┐
│                     Document Pipeline                          │
│                                                                 │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐                   │
│  │ Path 1   │   │ Path 2   │   │ Path 3   │                   │
│  │ 직접파서  │   │ PDF변환   │   │ OCR      │                   │
│  │ PDF/DOCX │   │ HWP/DOC  │   │ 스캔PDF  │                   │
│  │ XLSX/PPTX│   │ PPT/RTF  │   │ JPG      │                   │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘                   │
│       │              │              │                           │
│       └──────┬───────┴──────────────┘                           │
│              ▼                                                  │
│     ┌────────────────┐    ┌──────────────────┐                 │
│     │ MongoDB        │    │ pipeline_metrics │                  │
│     │ (files 컬렉션)  │    │ (인메모리 수집)   │                  │
│     └────────────────┘    └────────┬─────────┘                 │
│                                    │                            │
│  ┌──────────────────────────────────┴───────────────────────┐  │
│  │                  /health/deep                             │  │
│  │  MongoDB ✓  pdf_converter ✓  Disk ✓  Worker ✓  Queue ✓  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────┬───────────────────────────────────┘
                              │ 60초 주기
                    ┌─────────▼─────────┐
                    │ aims_health_      │
                    │ monitor (:3012)   │
                    │ + serviceHealth   │
                    │   Monitor (aims_api)│
                    └───────────────────┘
```

### 방어 계층 흐름

```
코드 수정
   │
   ▼
┌──────────────────────────────────────────┐
│ Phase 1: 회귀 테스트 (403개)              │  ← git commit 전
│ pytest tests/ --ignore=smoke_test.py     │
│ FAIL → 코드 수정 (배포 차단)              │
└──────────────────┬───────────────────────┘
                   │ ALL PASS
                   ▼
┌──────────────────────────────────────────┐
│ Phase 2: 스모크 테스트 (8/8 파일)         │  ← 배포 직후
│ deploy_document_pipeline.sh 내장          │
│ FAIL → 경고 로그 (운영자 확인)             │
└──────────────────┬───────────────────────┘
                   │ ALL PASS
                   ▼
┌──────────────────────────────────────────┐
│ Phase 3: 런타임 모니터링 (24/7)           │  ← 운영 중 상시
│ /health/deep + pipeline_metrics          │
│ 장애 → 503 + Slack 알림                   │
└──────────────────────────────────────────┘
```

---

## 3. Phase 1: 회귀 테스트

### 목적
코드 변경이 기존 기능을 파손하는지 **배포 전에** 자동 감지한다.

### 규모
- **테스트 파일:** 24개
- **테스트 케이스:** 403개
- **코드량:** 11,037줄
- **실행 시간:** ~6분

### 커버리지 영역

| 영역 | 테스트 파일 | 케이스 수 | 검증 내용 |
|------|-----------|----------|----------|
| 파일 서비스 | `test_file_service.py` | 19 | 저장, 읽기, 메타정보 추출, MIME 감지 |
| 메타데이터 | `test_doc_meta.py`, `test_meta_service.py`, `test_meta_service_exif.py` | 25 | PDF/이미지 메타, EXIF, GPS |
| OCR | `test_doc_ocr.py`, `test_upstage_service.py` | 22 | Upstage API, 에러 처리, 타임아웃 |
| PDF 변환 | `test_pdf_conversion_text_service.py` | 12 | LibreOffice 변환, 텍스트 추출 |
| AR/CRS 감지 | `test_ar_crs_detection.py` | 6 | 연간보고서/CRS 자동 판별, DB 업데이트 |
| 크레딧 | `test_credit_check_flow.py` | 5 | 크레딧 체크, fail-open, 타임아웃 |
| 해시/중복 | `test_file_hash_duplicate.py` | 3 | SHA-256 해시, 중복 파일 감지 |
| 큐잉 | `test_queueing_mode.py`, `test_upload_queue_service.py`, `test_upload_worker.py` | 26 | 비동기 큐, 워커, 상태 전이 |
| 알림 | `test_progress_notifications.py` | 3 | SSE 진행률 알림 |
| 라우팅 | `test_pipeline_routing.py`, `test_doc_prep_main.py` | 7 | MIME별 경로 분기, 엔드포인트 |
| Shadow Mode | `test_shadow_router.py` | 7 | n8n 호환성 비교 |
| 메트릭 | `test_pipeline_metrics.py` | 9 | 인메모리 메트릭, p95, 에러율 |
| 통합 | `test_integration.py` | 5 | End-to-end 파이프라인 |

### 실행 방법
```bash
cd ~/aims/backend/api/document_pipeline
python -m pytest tests/ -v --tb=short \
  --ignore=tests/smoke_test.py \
  --ignore=tests/generate_fixtures.py
```

### 실행 시점
- 개발자: 코드 수정 후 수동 실행
- CI: pre-commit hook에서 aims_api 테스트 자동 실행 (912개)

---

## 4. Phase 2: 스모크 테스트

### 목적
배포 후 **실제 서버에서** 10종 파일 형식이 정상 처리되는지 end-to-end 검증한다.
Mock이 아닌 실제 업로드 → MongoDB 저장 → 텍스트 추출 전체 경로를 테스트한다.

### 테스트 대상

#### Path 1: 직접 파서 (비용 0, AI 불필요)

| 파일 | 파서 | 검증 |
|------|------|------|
| sample.pdf | PyMuPDF | `meta.full_text`에 `AIMS_SMOKE_TEST` 포함 |
| sample.docx | python-docx | 동일 |
| sample.xlsx | openpyxl | 동일 |
| sample.pptx | python-pptx | 동일 |

#### Path 2: PDF 변환 후 텍스트 추출 (비용 0, LibreOffice)

| 파일 | 변환 경로 | 검증 |
|------|----------|------|
| sample.hwp | LibreOffice → PDF → PyMuPDF | `meta.full_text`에 텍스트 존재 확인 |
| sample.doc | LibreOffice → PDF → PyMuPDF | `meta.full_text`에 `AIMS_SMOKE_TEST` 포함 |
| sample.ppt | LibreOffice → PDF → PyMuPDF | 동일 |
| sample.rtf | LibreOffice → PDF → PyMuPDF | 동일 |

#### Path 3: OCR (AI 크레딧 소모, 기본 스킵)

| 파일 | 처리 | 검증 |
|------|------|------|
| sample_scan.pdf | Upstage OCR | `ocr.full_text`에 `AIMS_SMOKE_TEST` 포함 |
| sample.jpg | Upstage OCR | 동일 |

### 판정 기준

| 결과 | 조건 |
|------|------|
| **PASS** | 기대 필드에 키워드 존재 (또는 텍스트 추출 확인) |
| **FAIL** | 키워드 미존재, 빈 텍스트, 잘못된 경로로 처리 |
| **ERROR** | 업로드 실패, 타임아웃, 서비스 미응답 |
| **SKIP** | OCR 스킵 모드, fixture 파일 미존재 |

### 배포 스크립트 통합

`deploy_document_pipeline.sh`에 내장되어 배포마다 자동 실행:

```bash
# 배포 스크립트 내 (줄 57~63)
if [ -f "$SERVICE_DIR/tests/smoke_test.py" ]; then
    echo "Running smoke test (--skip-ocr)..."
    "$VENV_DIR/bin/python" "$SERVICE_DIR/tests/smoke_test.py" --skip-ocr --timeout 120 || {
        echo "Smoke test failed (non-blocking)"
    }
fi
```

- **비차단 실행:** 스모크 실패 시 경고만 출력, 배포는 계속 진행
- **OCR 기본 스킵:** 크레딧 소모 방지 (`--skip-ocr`)
- **자동 정리:** 테스트 문서 및 큐 엔트리 삭제

### 실행 방법
```bash
# 서버에서 직접 실행
cd ~/aims/backend/api/document_pipeline
./venv/bin/python tests/smoke_test.py --skip-ocr

# OCR 포함 전체 테스트
./venv/bin/python tests/smoke_test.py --timeout 180
```

### Fixture 파일

`tests/fixtures/` 디렉토리에 10개 샘플 파일 저장.
`tests/generate_fixtures.py`로 프로그래밍 생성 (HWP 제외).

---

## 5. Phase 3: 런타임 모니터링

### 목적
운영 중 의존성 장애, 성능 저하, 연속 에러를 **실시간으로** 감지한다.
기존 `/health`(uvicorn alive 체크)의 한계를 보완한다.

### 5.1 /health/deep 엔드포인트

6개 의존성을 개별 검증하여 **기능적 건강 상태**를 판단한다.

| # | 체크 항목 | 방법 | 실패 시 | 임계값 |
|---|----------|------|---------|--------|
| 1 | MongoDB | `ping` + `files.find_one()` | 503 unhealthy | 3초 타임아웃 |
| 2 | pdf_converter | GET `/health` | 503 unhealthy | 5초 타임아웃 |
| 3 | 디스크 공간 | `shutil.disk_usage()` | 503 unhealthy | 1GB 미만 |
| 4 | Upload Worker | `worker.get_status()` | 503 unhealthy | running=False |
| 5 | 업로드 큐 | `queue.get_queue_stats()` | 200 warning | pending > 50 |
| 6 | 처리 메트릭 | `pipeline_metrics.get_summary()` | 200 정보성 | - |

**응답 예시 (정상):**
```json
{
  "status": "healthy",
  "checks": {
    "mongodb": {"status": "ok", "latency_ms": 2},
    "pdf_converter": {"status": "ok", "latency_ms": 44},
    "disk": {"status": "ok", "free_gb": 1633.63, "usage_percent": 5.8},
    "upload_worker": {"status": "ok", "active_tasks": 0},
    "queue": {"status": "ok", "pending": 0, "processing": 0, "failed": 0}
  },
  "metrics": {
    "window": "1h",
    "total_processed": 8,
    "total_errors": 0,
    "recent": {"count": 8, "success": 8, "errors": 0, "error_rate_pct": 0.0},
    "duration_sec": {"avg": 2.94, "max": 4.17, "p95": 4.17},
    "error_breakdown": {},
    "consecutive_errors": 0,
    "uptime_sec": 47
  },
  "totalLatency": 48,
  "version": "1.0.0"
}
```

### 5.2 처리 메트릭 수집기 (pipeline_metrics.py)

외부 의존성(Prometheus 등) 없이 인메모리로 처리 통계를 수집한다.

**설계 원칙:**
- **인메모리 deque:** `maxlen=10000`, 외부 DB 불필요
- **슬라이딩 윈도우:** 최근 1시간만 보관 (메모리 효율)
- **전역 싱글턴:** `from workers.pipeline_metrics import pipeline_metrics`

**수집 지점 (doc_prep_main.py 내 6곳):**

```
process_document_pipeline() 진입
    │
    ├─ record_start(doc_id, mime_type, file_size)
    │
    ├─ [Path 1] 직접 파서 성공 → record_success()
    ├─ [text/plain] 텍스트 처리 성공 → record_success()
    ├─ [Unsupported MIME] 처리 완료 → record_success()
    ├─ [Path 3] OCR 큐 등록 성공 → record_success()
    │
    └─ 예외 발생 → record_error(error_type)
```

**연속 에러 알림:**
- 임계값: 5회 연속 에러
- 알림 채널: Slack (기존 error_logger 재사용)
- 중복 방지: 5분 쿨다운 (알림 전송 성공 시에만 타이머 갱신)

### 5.3 모니터링 서비스 연동

두 개의 독립적 모니터링 시스템이 `/health/deep`을 호출한다:

| 서비스 | 포트 | 체크 주기 | 역할 |
|--------|------|----------|------|
| aims_health_monitor | 3012 | 60초 | 전용 모니터링 (10개 서비스) |
| serviceHealthMonitor (aims_api 내장) | 3010 | 60초 | 백업 모니터링 |

**설정 (양쪽 동일):**
```javascript
{
  port: 8100,
  service: 'document_pipeline',
  healthEndpoint: '/health/deep',
  timeout: 10000  // 10초 (deep check는 여러 의존성 순차 검증)
}
```

**상태 변경 감지:** healthy ↔ unhealthy 전환 시 `service_health_logs` 컬렉션에 이벤트 기록.

---

## 6. 효과 요약

### 감지 가능한 장애 유형

| 장애 유형 | Phase 1 | Phase 2 | Phase 3 |
|-----------|---------|---------|---------|
| 코드 로직 버그 | O | - | - |
| MIME 라우팅 오류 | O | O | - |
| 텍스트 추출 실패 | O | O | - |
| PDF 변환 경로 파손 | - | O | - |
| MongoDB 연결 끊김 | - | - | O |
| pdf_converter 다운 | - | O | O |
| 디스크 부족 | - | - | O |
| 큐 적체 (pending > 50) | - | - | O |
| Worker 크래시 | - | - | O |
| 연속 에러 (5회+) | - | - | O |
| 성능 저하 (p95 증가) | - | - | O |
| 의존성 라이브러리 호환성 | O | - | - |

### 장애 인지 시간 (MTTD) 비교

| 장애 유형 | 기존 | 현재 |
|-----------|------|------|
| 코드 버그 | 사용자 신고 (~시간) | pytest 실행 즉시 (~6분) |
| 배포 후 파손 | 사용자 신고 (~시간) | 배포 스크립트 즉시 (~2분) |
| 의존성 다운 | 사용자 신고 (~시간) | 60초 이내 자동 감지 |

---

## 7. 파일 구조

```
backend/api/document_pipeline/
├── main.py                          # /health/deep 엔드포인트
├── deploy_document_pipeline.sh      # 배포 스크립트 (스모크 테스트 내장)
├── workers/
│   └── pipeline_metrics.py          # 인메모리 처리 메트릭 수집기
├── routers/
│   └── doc_prep_main.py             # 메트릭 기록 삽입 (6곳)
└── tests/
    ├── smoke_test.py                # Phase 2: 스모크 테스트
    ├── generate_fixtures.py         # fixture 파일 생성기
    ├── fixtures/                    # 10개 샘플 파일
    │   ├── sample.pdf
    │   ├── sample.docx / .xlsx / .pptx
    │   ├── sample.hwp / .doc / .ppt / .rtf
    │   ├── sample.jpg
    │   └── sample_scan.pdf
    ├── test_pipeline_metrics.py     # Phase 3: 메트릭 테스트 (9개)
    ├── test_doc_prep_main.py        # Phase 1: 코어 로직
    ├── test_file_service.py         # Phase 1: 파일 서비스 (19개)
    ├── test_ar_crs_detection.py     # Phase 1: AR/CRS 감지
    ├── test_credit_check_flow.py    # Phase 1: 크레딧 체크
    └── ... (24개 테스트 파일, 총 403 케이스)

backend/api/aims_health_monitor/
└── src/config.ts                    # document_pipeline → /health/deep

backend/api/aims_api/
└── lib/serviceHealthMonitor.js      # document_pipeline → /health/deep
```

---

## 8. 운영 가이드

### 일상 확인

```bash
# 전체 서비스 상태 확인
curl -s http://localhost:3012/api/health/current | python3 -m json.tool

# document_pipeline deep health 상세
curl -s http://localhost:8100/health/deep | python3 -m json.tool
```

### 장애 대응

| 상황 | 확인 방법 | 조치 |
|------|----------|------|
| `/health/deep` 503 | checks 항목별 status 확인 | 해당 의존성 복구 |
| 에러율 높음 | metrics.recent.error_rate_pct | error_breakdown으로 원인 파악 |
| 큐 적체 | checks.queue.pending > 50 | Worker 상태 확인, 필요시 재시작 |
| 디스크 부족 | checks.disk.free_gb < 1 | 로그/임시파일 정리 |
| Slack 알림 수신 | 연속 에러 5회 | 즉시 로그 확인 (`pm2 logs document_pipeline`) |

### 테스트 재실행

```bash
# Phase 1: 회귀 테스트
cd ~/aims/backend/api/document_pipeline
python -m pytest tests/ -v --tb=short \
  --ignore=tests/smoke_test.py --ignore=tests/generate_fixtures.py

# Phase 2: 스모크 테스트
./venv/bin/python tests/smoke_test.py --skip-ocr

# Phase 2: OCR 포함 전체
./venv/bin/python tests/smoke_test.py --timeout 180
```

---

## 9. 구현 이력

| 날짜 | Phase | 커밋 | 내용 |
|------|-------|------|------|
| 2026-02-22 | Phase 1 | `cf8f5649` | 회귀 테스트 76개 추가 |
| 2026-02-22 | Phase 1 | `7c6d8ce3` | 기존 테스트 수정, 394개 전체 PASS |
| 2026-02-23 | Phase 2 | `8b25a52f` | 스모크 테스트 구현, 8/8 PASS |
| 2026-02-23 | Phase 3 | `a332409f` | 런타임 모니터링, /health/deep, 403개 전체 PASS |
