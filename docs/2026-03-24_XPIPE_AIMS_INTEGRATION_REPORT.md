# xPipe × AIMS 통합 작업 보고서

**작성일**: 2026-03-24
**상태**: Phase 3 완료, 프로덕션 xPipe 모드 운영 중

---

## 1. 요약

AIMS의 문서 처리 엔진을 기존 document_pipeline에서 xPipe로 교체하는 작업을 수행했다.
교체 전후 동일 동작을 자동화 테스트로 증명하고, 환경변수 하나로 즉시 롤백 가능한 구조로 구현했다.

**현재 프로덕션**: `PIPELINE_ENGINE=xpipe` 활성, 실트래픽 정상 처리 확인.

---

## 2. 완료된 Phase

### Phase 0: 3계층 테스트 구축

| Layer | 도구 | 테스트 | 결과 |
|-------|------|--------|------|
| Layer 1 | `golden_master/verify.py` | 104건 스냅샷 비교 | 104/104 PASS |
| Layer 2 | `golden_master/test_side_effects.py` | 21건 부수 동작 | 21/21 PASS |
| Layer 3 | `tests/e2e/xpipe-integration.spec.ts` | 5건 브라우저 | 5/5 PASS |

### Phase 1: InsuranceAdapter 연결

- **Phase 1-A**: InsuranceAdapter의 AR/CRS 감지를 프로덕션 DB 텍스트로 검증 → 98 PASS / 0 FAIL / 6 SKIP
- **Phase 1-B**: xPipeWeb에 InsuranceAdapter를 연결하고 전체 파이프라인 Shadow 실행 → 93 PASS / 7 FAIL(AI 비결정성) / 4 ERROR(변환 타임아웃)
- 핵심 성과: xPipe `DetectSpecialStage`가 `_domain_adapter`를 인식하고 `detect_special_documents()`를 호출하는 **첫 연결** 완성

### Phase 2: 스테이지별 교체

- **Phase 2-1**: DetectSpecial → InsuranceAdapter + HookResult 실행기로 교체. Legacy 함수 호출 제거.
- **Phase 2-2**: Classify → InsuranceAdapter의 `get_classification_config()`를 OpenAIService에 전달. 어댑터가 분류 프롬프트의 Single Source of Truth.

### Phase 3: xPipe 엔진 전환

- `PIPELINE_ENGINE` 환경변수 스위치 구현 (`xpipe` / `legacy`)
- `_process_via_xpipe()`: xPipe Pipeline 조립 → 실행 → AIMS MongoDB 매핑
- xPipe 실패 시 자동 legacy fallback (안전장치)
- 기존 코드는 `_process_via_legacy()`로 분리, 삭제하지 않음
- **프로덕션 배포 + 실트래픽 5건 일반문서 + 1건 AR 문서 정상 처리 확인**
- UI 하단 바에 파이프라인 엔진 뱃지 표시 (보라색 "xPipe" / 회색 "Legacy")

---

## 3. 커밋 이력

| 커밋 | 내용 |
|------|------|
| `454a6b60` | 보너스 크레딧 사후 정산 연결 + race condition 해결 |
| `a1f70d7f` | 보너스 크레딧 정산 버그 보고서 |
| `v2026.03.23` | 태그 |
| `d1fcfb06` | xPipe × AIMS 통합 기획안 작성 |
| `e62ceb3e` | Phase 0: Golden Master 수집/검증 도구 (104/104 PASS) |
| `2c56d9d7` | Phase 0: Layer 2 (21/21) + Layer 3 (5/5) |
| `836fad77` | Phase 1-A: InsuranceAdapter Shadow 검증 (98/104) |
| `f1871fd8` | Phase 1-B: xPipe에 InsuranceAdapter 연결 |
| `2e3bf551` | Phase 1-B: Embed truncate + 전체 104건 완료 |
| `20c0d2e3` | Phase 2-1: DetectSpecial 어댑터+HookResult 교체 |
| `9c47352c` | Phase 2-2: Classify 어댑터 config 교체 |
| `fe54df8b` | Phase 3: PIPELINE_ENGINE 스위치 + xPipe 처리 경로 |
| `a9220d56` | 파이프라인 엔진 상태 UI 표시 |
| `eccf61c9` | 데스크톱 하단 바에 뱃지 추가 |
| `eabaf24a` | 뱃지 가시성 개선 |
| `abbda8dd` | xPipe 경로 파일 크기 누락 수정 |
| `3e120a3c` | Golden Master FAIL 시 aims-admin 에러 로그 등록 |
| `db388ac0` | SSE 웹훅 필드명 수정 (customerId → customer_id) |
| `798cc6ad` | AR/CRS 감지 시 document_type 이중 저장 버그 수정 |

---

## 4. 아키텍처 변경

```
문서 업로드
    │
    ▼
process_document_pipeline()
    │
    ├─ PIPELINE_ENGINE=xpipe  →  _process_via_xpipe()
    │   ├─ xPipe Pipeline (Extract → Classify → DetectSpecial → Complete)
    │   ├─ InsuranceAdapter (분류 config + AR/CRS 감지 + 표시명)
    │   ├─ HookResult 실행기 (DB 업데이트 + SSE 알림)
    │   └─ AIMS MongoDB 스키마 매핑
    │
    └─ PIPELINE_ENGINE=legacy  →  _process_via_legacy()
        └─ 기존 document_pipeline 코드 (그대로 보존)
```

**전환 방법:**
```bash
# xPipe → legacy 롤백
ssh rossi@100.110.215.65
sed -i 's/PIPELINE_ENGINE=xpipe/PIPELINE_ENGINE=legacy/' ~/aims/.env.shared
cd ~/aims/backend/api/document_pipeline && bash deploy_document_pipeline.sh
```

---

## 5. 자동 모니터링

| 항목 | 설정 |
|------|------|
| Golden Master 자동 검증 | 크론: 매일 새벽 2시 |
| FAIL 시 알림 | aims-admin 시스템 로그에 에러 등록 (severity: high) |
| 로그 파일 | `/tmp/golden_master_cron.log` |

---

## 6. 발견된 버그 및 수정

| 버그 | 원인 | 수정 | 커밋 |
|------|------|------|------|
| 파일 크기 0 B 표시 | `_process_via_xpipe`에서 `meta.size_bytes` 미저장 | 파일 크기/이름/확장자 저장 추가 | `abbda8dd` |
| SSE 웹훅 400 에러 | `customerId`(camelCase) → aims_api는 `customer_id`(snake_case) 기대 | 필드명 수정 | `db388ac0` |
| SSE 웹훅 인증 누락 | `X-API-Key` 헤더 미포함 | settings 패턴 + 헤더 추가 | `20c0d2e3` |
| Embed 토큰 초과 | `text[:8000]` — 한국어 1문자≈2~3토큰 | `text[:3000]`으로 축소 | `2e3bf551` |
| 뱃지 안 보임 | 데스크톱 footer에 미적용 + CSS 변수 미동작 | 양쪽 적용 + 하드코딩 색상 | `eabaf24a` |
| AR document_type 이중 저장 | ClassifyStage("policy") 결과가 DetectSpecial 감지 후에도 덮어쓰이지 않음 | detections에서 AR/CRS 감지 시 doc_type 오버라이드 + HookResult에 document_type 추가 | `798cc6ad` |
| 임베딩 크론 실행 불가 | `run_pipeline.sh` 실행 권한 없음 (644). deploy 시 git checkout으로 권한 초기화 | `chmod +x` + git 권한 반영 (100755). 밀린 714건 자동 처리 | — |

---

## 7. 완료된 후속 작업 (2026-03-24)

### 우선순위 높음 — 전부 완료

| # | 항목 | 결과 |
|---|------|------|
| 1 | `document_type` 이중 저장 버그 | **수정 완료** (`798cc6ad`). ClassifyStage 결과를 DetectSpecial 감지 결과로 오버라이드. HookResult에도 `document_type` + `meta.document_type` 추가. 기존 영향받은 1건 DB 직접 수정. |
| 2 | SSE 프론트엔드 도달 확인 | **확인 완료**. `POST /api/webhooks/ar-status-change`, `cr-status-change` 양쪽 `success: true` 응답. |
| 3 | CRS 문서 업로드 실테스트 | **PASS**. xPipe 경로에서 CRS 문서 → `document_type: "customer_review"`, `is_customer_review: true`, `cr_parsing_status: "pending"`, `tags: ["CRS"]`, `displayName` 정상 생성, 고객 자동 연결 확인. |
| — | AR 문서 재검증 | **PASS**. 수정 후 AR 문서 → `document_type: "annual_report"`, `is_annual_report: true`, `ar_parsing_status: "pending"`, `tags: ["AR"]` 모두 정상. |

---

## 8. 다음에 해야 할 일

### 우선순위 중간 — 확인 완료

| # | 항목 | 결과 |
|---|------|------|
| 4 | credit_pending 경로 | **xPipe 무관** — 임베딩은 별도 크론(`full_pipeline.py`)이 처리. credit_pending 로직은 크론 내부에서 동일하게 동작. |
| 5 | 오류 처리 경로 | **안전장치 확인** — xPipe 처리 실패 시 자동 legacy fallback (`try/except` 래핑). 에러 경로는 legacy와 동일. |
| 6 | Embed 스테이지 xPipe 연동 | **현행 유지** — 크론 기반 임베딩이 xPipe 문서도 정상 처리 확인 (714건 밀린 문서 복구 후 정상 동작). |

### 추가 발견 및 수정

| # | 항목 | 설명 |
|---|------|------|
| — | 임베딩 크론 Permission denied | `run_pipeline.sh` 실행 권한 누락 (644→755). git 권한 반영 + 서버 직접 chmod. 밀린 714건 자동 복구 중. |

### 남은 작업

| # | 항목 | 설명 |
|---|------|------|
| 7 | Golden Master 크론 첫 실행 확인 | 2026-03-25 새벽 2시 결과 확인 필요 (현재 로그 비어있음) |
| 8 | 프로덕션 안정성 모니터링 | 무기한. aims-admin 시스템 로그에서 `xpipe_monitoring` 카테고리 관찰 |
| 9 | Legacy 코드 정리 시점 결정 | xPipe 안정 운영 확인 후 `_process_via_legacy()` 및 legacy 함수 제거 시점 결정 |

---

## 9. 참조 문서

- [xPipe × AIMS 통합 기획안](XPIPE_AIMS_INTEGRATION_PLAN.md)
- [xPipe 모듈화 전략](XPIPE_MODULARIZATION_STRATEGY.md)
- [보너스 크레딧 정산 버그 보고서](2026-03-23_BONUS_CREDIT_SETTLEMENT_BUG_REPORT.md)
