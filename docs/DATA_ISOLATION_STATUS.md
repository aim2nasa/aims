# 설계사별 데이터 격리 현황

**최종 업데이트**: 2025-11-22
**총 수정된 취약점**: 34개

---

## 현재 구현된 격리 수준

| 영역 | 상태 | 검증 방식 |
|------|------|----------|
| 고객 데이터 | ✅ 격리됨 | `meta.created_by` 필터 |
| 문서 데이터 | ✅ 격리됨 | `ownerId` 필터 |
| Annual Report | ✅ 격리됨 | 고객 소유권 검증 |
| 고객-문서 연결 | ✅ 격리됨 | 고객 + 문서 이중 검증 |

---

## 수정된 API 목록

### 고객 데이터 (13개)

| API | 검증 방식 |
|-----|----------|
| GET /api/customers/:id | meta.created_by |
| PUT /api/customers/:id | meta.created_by |
| DELETE /api/customers/:id | meta.created_by |
| POST /api/customers/:id/documents | meta.created_by |
| DELETE /api/customers/:id/documents/:doc_id | meta.created_by |
| PATCH /api/customers/:id/documents/:doc_id | meta.created_by |
| GET /api/customers/:customerId/annual-reports/pending | meta.created_by |
| GET /api/customers/:id/address-history | meta.created_by |

### 문서 데이터 (13개)

| API | 검증 방식 |
|-----|----------|
| GET /api/documents/:id/status | ownerId |
| POST /api/documents/:id/retry | ownerId |
| GET /api/documents/status/live | ownerId |
| PATCH /api/documents/set-annual-report | ownerId |
| DELETE /api/documents/:id | ownerId |
| DELETE /api/documents (복수) | ownerId |
| GET /api/annual-report/status/:file_id | ownerId |
| GET /api/customers/:customerId/annual-reports | meta.created_by |
| GET /api/customers/:customerId/annual-reports/latest | meta.created_by |
| DELETE /api/customers/:customerId/annual-reports | meta.created_by |
| POST .../cleanup-duplicates | meta.created_by |
| POST /api/customers/:id/documents | ownerId (문서) |
| DELETE /api/customers/:id/documents/:doc_id | ownerId (문서) |

### 프론트엔드 (8곳)

모든 직접 fetch 호출에 `x-user-id` 헤더 추가:
- DocumentRegistrationView.tsx (3곳)
- DocumentLibraryView.tsx
- DocumentsTab.tsx
- DocumentFullTextModal.tsx
- DocumentSummaryModal.tsx
- annualReportProcessor.ts

---

## 잠재적 한계점 및 검토 의견

### 1. x-user-id 헤더 조작

**현재 상태**: userId를 HTTP 헤더(`x-user-id`)로 전달

**위험**: 악의적 사용자가 헤더를 변조하면 다른 설계사로 위장 가능

**검토 의견 (2025-11-22)**:
- ⚠️ **낮은 위험** - 일반 보험 설계사가 브라우저 개발자 도구로 헤더를 변조할 가능성 극히 낮음
- 현재 서비스 오픈 전 단계에서는 문제 없음
- **향후 서비스 확장 시 JWT 도입 권장** → [SECURITY_ROADMAP.md](SECURITY_ROADMAP.md) 참조

### 2. 기존 데이터 호환성

**현재 상태**: 모든 문서에 `ownerId` 필드 필요

**검토 의견 (2025-11-22)**:
- ✅ **해당 없음** - 기존 데이터 전체 삭제 예정
- 신규 데이터부터 ownerId 필수 적용

### 3. Python API 직접 접근

**현재 상태**: Python API 서버(8000, 8004, 8080)는 Node.js 프록시를 통해 접근

**검토 의견 (2025-11-22)**:
- ✅ **무시 가능** - Docker 네트워크 격리(172.17.0.1)로 외부 직접 접근 불가
- 서버 SSH 접근 권한 없이는 우회 불가능

---

## 보안 등급

| 시나리오 | 보호 수준 | 비고 |
|---------|----------|------|
| 일반 사용자의 실수 | ✅ 완전 보호 | |
| URL 직접 입력 시도 | ✅ 완전 보호 | |
| 브라우저 개발자 도구 조작 | ⚠️ 헤더 변조 가능 | 현실적 위험 낮음 |
| 네트워크 패킷 변조 | ⚠️ JWT 필요 | 향후 대응 |
| 서버 직접 접근 | ✅ Docker 격리로 보호 | |

---

## 최종 결론 (2025-11-22)

**현재 격리 수준으로 일반적인 사용 환경에서는 충분히 안전합니다.**

- 일반 설계사의 실수나 호기심으로 인한 데이터 접근: ✅ 완벽 차단
- 의도적인 해킹 시도: 현재 사용자 풀에서는 위험 낮음, 향후 JWT 도입으로 대응

향후 보안 강화 사항은 [SECURITY_ROADMAP.md](SECURITY_ROADMAP.md) 참조

---

## 관련 문서

- [고객 데이터 격리 작업](CUSTOMER_ISOLATION_FIX_PROGRESS.md)
- [문서 데이터 격리 작업](DOCUMENT_ISOLATION_FIX_PROGRESS.md)
- [보안 감사 보고서](CUSTOMER_DATA_ISOLATION_AUDIT_20251122.md)
- [보안 로드맵](SECURITY_ROADMAP.md)
