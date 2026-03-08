# 캐치업코리아 파이프라인 처리 완료 요약

> **날짜**: 2026-03-08
> **처리 시간**: 18:17 ~ 18:34 KST (약 17분)
> **목적**: v4 분류 체계 튜닝용 샘플 업로드 및 파이프라인 처리

---

## 1. 파일 수 흐름

| 단계 | 건수 | 비고 |
|------|------|------|
| 로컬 샘플 | **446** | `C:\Users\rossi\캐치업코리아\` |
| DB 도착 (최대) | ~415 | 업로드 직후 |
| DB 최종 | **387** | 중복 해시 cleanup으로 **59건 탈락** |

---

## 2. 최종 상태 (387건)

| status | overallStatus | 건수 | 비고 |
|--------|---------------|------|------|
| completed | completed | **317** | 정상 완료 |
| processing | completed | **70** | ISSUE-4: status 미전환 |

---

## 3. 확장자별 분포

| 확장자 | 로컬 | DB | 탈락 |
|--------|------|-----|------|
| PDF | 249 | 202 | -47 |
| JPG/JPEG | 94 | 87 | -7 |
| XLSX | 42 | 41 | -1 |
| HWP | 17 | 15 | -2 |
| PPTX | 13 | 12 | -1 |
| PNG | 9 | 8 | -1 |
| XLS | 6 | 6 | 0 |
| DOCX | 6 | 6 | 0 |
| ZIP | 5 | 5 | 0 |
| PPT | 3 | 3 | 0 |
| DOC | 1 | 1 | 0 |
| AI | 1 | 1 | 0 |
| **합계** | **446** | **387** | **-59** |

---

## 4. v3 분류 결과 (baseline)

| v3 코드 | 건수 | v4 매핑 |
|---------|------|---------|
| **general** | **88** | general (67건은 ISSUE-4 — 실제 분류 아닌 fallback) |
| unclassifiable | 41 | unclassifiable |
| medical_receipt | 32 | medical_receipt |
| hr_document | 30 | hr_document |
| policy | 27 | policy |
| coverage_analysis | 25 | coverage_analysis |
| application | 22 | application |
| proposal | 15 | → plan_design (v4 흡수) |
| claim_form | 12 | claim_form |
| tax_document | 12 | → corp_tax (v4 이동) |
| pension | 10 | → hr_document (v4 흡수) |
| financial_statement | 9 | → asset_document (v4 흡수) |
| plan_design | 9 | plan_design |
| corp_registry | 8 | → corp_basic (v4 흡수) |
| diagnosis | 7 | diagnosis |
| change_request | 5 | → insurance_etc (v4 흡수) |
| legal_document | 5 | legal_document |
| vehicle_registry | 4 | → asset_document (v4 흡수) |
| id_card | 4 | id_card |
| bank_account | 4 | → personal_docs (v4 흡수) |
| business_plan | 3 | → legal_document (v4 흡수) |
| transaction_proof | 3 | → asset_document (v4 흡수) |
| employment_cert | 3 | → asset_document (v4 흡수) |
| business_registry | 2 | → asset_document (v4 흡수) |
| surrender | 2 | → insurance_etc (v4 흡수) |
| hospital_cert | 1 | → diagnosis (v4 흡수) |
| contract | 1 | → legal_document (v4 흡수) |
| medical_record | 1 | → diagnosis (v4 흡수) |
| shareholder | 1 | → corp_basic (v4 흡수) |
| consent_form | 1 | → consent_delegation (v4 흡수) |
| **합계** | **387** | |

---

## 5. 발견된 이슈 (4건)

| # | 이슈 | 심각도 | 영향 | 상태 |
|---|------|--------|------|------|
| **[ISSUE-1](2026-03-08_PIPELINE_ISSUE-1_PROGRESS_BAR.md)** | 업로드 프로그레스바 미표시 | Minor | UX — 처리 진행률 확인 불가 | 미해결 |
| **[ISSUE-2](2026-03-08_PIPELINE_ISSUE-2_DUPLICATE_HASH.md)** | 중복 파일 업로드 UX 개선 (59건 건너뜀 미표시) | Minor (UX) | 사용자가 중복 처리 결과를 인지하지 못함 | 미해결 |
| **[ISSUE-3](2026-03-08_PIPELINE_ISSUE-3_ORPHAN_DATA.md)** | 중복 에러 후 고아 데이터 가능성 | Warning | customers.documents 배열 정합성 확인 필요 | 확인 필요 |
| **[ISSUE-4](2026-03-08_PIPELINE_ISSUE-4_STATUS_STUCK.md)** | status=processing인데 완료된 문서 70건 | **Major** | confidence=0, general로 잘못 분류 + UI "처리 중" 고착 | 미해결 |

### ISSUE-2 상세: 중복 파일 업로드 UX 개선

- **설계 의도**: 해시 동일 파일의 중복 등록 방지 → 정상 동작
- **UX 문제**: 59건이 중복으로 건너뛰어졌으나 사용자에게 명확히 전달되지 않음
- **모달 동작**: 첫 중복 발견 시 DuplicateDialog 표시, 10초 자동 타이머로 나머지 자동 스킵
- **개선 필요**: 업로드 완료 요약에 중복 통계 + 건너뛴 파일 목록 표시

### ISSUE-4 상세: status 미전환 70건

- `status=processing`, `overallStatus=completed`, `meta_status=done`
- `confidence=0`, `document_type=general` (정상 분류가 아닌 fallback)
- 메타 추출은 완료되었으나 status가 completed로 전환되지 않음
- v3 baseline에서 general 88건 중 67건은 이 이슈에 해당 (실제 general은 21건)

---

## 6. 다음 작업

파이프라인 이슈 해결 후 v4 마이그레이션 본 작업 진행 (TAXONOMY_V4_MIGRATION.md 섹션 8 참조)

> 상세 모니터링 로그: `2026-03-08_PIPELINE_MONITORING.md`
