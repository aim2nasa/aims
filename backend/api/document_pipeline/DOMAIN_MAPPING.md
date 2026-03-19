# 보험 도메인 코드 매핑 — Phase 2 이동 대상

Phase 1에서 식별한 보험 도메인 특화 코드 목록.
Phase 2에서 InsuranceDomainAdapter로 이동할 대상.

## 요약

| 파일 | 보험 코드 줄 수 | 주요 내용 | 이동 대상 메서드 |
|------|---------------|---------|-----------------|
| `routers/doc_prep_main.py` | ~300줄 | AR/CRS 감지, 크레딧 체크, 표시명 | detect_special_documents, resolve_entity, generate_display_name, on_stage_complete |
| `services/openai_service.py` | ~270줄 | 22개 분류 체계, 150+ 규칙, 별칭 | get_classification_config |
| `routers/doc_display_name.py` | ~50줄 | AR/CRS 표시명 규칙 | generate_display_name |
| `embedding/full_pipeline.py` | ~200줄 | 크레딧 재확인, displayName 트리거 | on_stage_complete |

## 상세 매핑

### 1. get_classification_config() ← openai_service.py
- L83-98: 22개 분류 체계 정의
- L103-179: 150+ 분류 규칙 (혼동 방지, 우선순위)
- L439-460: 별칭 생성 규칙

### 2. detect_special_documents() ← doc_prep_main.py
- L639-828: `_detect_and_process_annual_report()` — AR 패턴 매칭 + 고객명/발행일 추출
- L832-1042: `_detect_and_process_customer_review()` — CRS 패턴 매칭 + 메타 추출

### 3. resolve_entity() ← doc_prep_main.py
- L733-764: AR 고객 검색 (aims_api /api/customers 호출)
- L959-987: CRS 고객 검색 (동일 패턴)

### 4. extract_domain_metadata() ← doc_meta.py + doc_prep_main.py
- 보험 특화 메타 (계약자, 피보험자, 증권번호 등)

### 5. generate_display_name() ← doc_prep_main.py + doc_display_name.py
- L1501-1550: AI 제목 → sanitize → displayName
- doc_display_name.py L139-150: AR/CRS 판별 후 스킵

### 6. on_stage_complete() ← 여러 파일
- 크레딧 체크: doc_prep_main.py L126-176
- SSE 알림: doc_prep_main.py AR/CRS 감지 후 webhook
- 바이러스 스캔: embedding/full_pipeline.py 완료 후 트리거

## 이동하지 않는 코드 (AIMS 인프라)
- `embedding/process_credit_pending.py` — 크레딧 월별 재처리 (AIMS 비즈니스)
- `tests/test_ar_crs_detection.py` — 회귀 테스트 (유지)
