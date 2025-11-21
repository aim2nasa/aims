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

## 잠재적 한계점

### 1. x-user-id 헤더 조작

**현재 상태**: userId를 HTTP 헤더(`x-user-id`)로 전달

**위험**: 악의적 사용자가 헤더를 변조하면 다른 설계사로 위장 가능

**권장 해결책**: JWT 토큰 기반 인증으로 전환
```
현재: x-user-id: "user123" (변조 가능)
권장: Authorization: Bearer <JWT> (서버에서 검증)
```

### 2. 기존 데이터 호환성

**현재 상태**: 모든 문서에 `ownerId` 필드 필요

**위험**: ownerId 없이 생성된 기존 문서는 접근 불가

**확인 필요**:
```javascript
// ownerId 없는 문서 확인
db.docupload.files.countDocuments({ ownerId: { $exists: false } })
```

### 3. Python API 직접 접근

**현재 상태**: Python API 서버(8000, 8004, 8080)는 Node.js 프록시를 통해 접근

**위험**: 직접 Python API 호출 시 검증 우회 가능

**현재 보호**: Docker 네트워크 격리 (172.17.0.1만 접근 가능)

---

## 보안 등급

| 시나리오 | 보호 수준 |
|---------|----------|
| 일반 사용자의 실수 | ✅ 완전 보호 |
| URL 직접 입력 시도 | ✅ 완전 보호 |
| 브라우저 개발자 도구 조작 | ⚠️ 헤더 변조 가능 |
| 네트워크 패킷 변조 | ⚠️ JWT 필요 |
| 서버 직접 접근 | ✅ Docker 격리로 보호 |

---

## 향후 보안 강화 권장사항

1. **JWT 인증 도입** (High Priority)
   - x-user-id 헤더 → JWT 토큰으로 전환
   - 서버 측 토큰 검증으로 위변조 방지

2. **기존 데이터 마이그레이션**
   - ownerId 없는 문서에 소유자 할당
   - 고아 데이터 정리

3. **감사 로그 추가**
   - 403 응답 발생 시 로깅
   - 의심스러운 접근 패턴 모니터링

---

## 관련 문서

- [고객 데이터 격리 작업](CUSTOMER_ISOLATION_FIX_PROGRESS.md)
- [문서 데이터 격리 작업](DOCUMENT_ISOLATION_FIX_PROGRESS.md)
- [보안 감사 보고서](CUSTOMER_DATA_ISOLATION_AUDIT_20251122.md)
