# 파일 업로드 50MB 제한 UX 문제

**일자:** 2026-02-22
**상태:** Open
**영역:** 프론트엔드 - 문서 등록 (DocumentRegistrationView)

---

## 현상

55개 파일을 일괄 업로드할 때, 50MB를 초과하는 2개 파일이 실패 처리됨.

![업로드 결과 화면](assets/upload-50mb-limit-error.png)

- 업로드 결과: 53/55 성공, 2 실패
- 실패 파일:
  - `포트폴리오_구본미.pdf` (268.1 MB) — "파일 크기(260.1 MB)가 제한(50MB)을 초과합니다"
  - `서울중앙 2019가합585938 김보성.zip` (53.8 MB) — "파일 크기(53.8 MB)가 제한(50MB)을 초과합니다"

---

## 문제점

### 1. "재시도" 버튼이 의미 없음
파일 크기 초과는 **영구적 실패**로, 재시도해도 절대 성공할 수 없다. 그런데 "재시도" 버튼이 노출되어 사용자가 헛된 시도를 하게 만든다. 항상 실패할 행동을 유도하는 것은 UX 안티패턴이다.

### 2. 파일 크기 표시 불일치
파일명 옆에는 `268.1 MB`로 표시되지만, 에러 메시지에서는 `260.1 MB`로 표시된다. 같은 파일인데 크기가 다르게 보이면 시스템 신뢰도가 떨어진다.

### 3. 사용자에게 해결 방법이 없음
"파일 크기가 제한을 초과합니다"라는 사실만 알려줄 뿐, 사용자가 **무엇을 할 수 있는지** 안내가 전혀 없다. 막다른 길(dead-end)에 놓이는 경험이다.

### 4. 50MB 제한의 적절성 의문
보험 업무 특성상 포트폴리오, 청약서 등 대용량 파일이 흔하다. 53.8 MB처럼 제한을 겨우 넘는 파일도 일괄 차단되는 것이 업무 현실에 맞는지 검토 필요하다.

---

## 관련 코드

| 항목 | 파일 | 라인 |
|------|------|------|
| 50MB 제한 정의 | `frontend/aims-uix3/src/components/DocumentViews/DocumentRegistrationView/services/userContextService.ts` | 183 |
| 크기 검증 로직 | `frontend/aims-uix3/src/components/DocumentViews/DocumentRegistrationView/services/uploadService.ts` | 651-662 |
| 크기 초과 모달 | `frontend/aims-uix3/src/utils/appleConfirm.ts` | 248-407 |
| 검증 실패 처리 | `frontend/aims-uix3/src/components/DocumentViews/DocumentRegistrationView/DocumentRegistrationView.tsx` | 971-1007 |
| HTTP 413 에러 처리 | `frontend/aims-uix3/src/components/DocumentViews/DocumentRegistrationView/services/uploadService.ts` | 561-563 |
| 파일 목록 UI / 재시도 | `frontend/aims-uix3/src/components/DocumentViews/DocumentRegistrationView/FileList/FileList.tsx` | - |
| 백엔드 크기 제한 | Nginx `client_max_body_size` (코드 주석 참조) | - |

---

## 비고

- 50MB 제한은 Nginx의 `client_max_body_size`에 맞춘 프론트엔드 설정 (주석 근거)
- 백엔드(FastAPI)에는 명시적 크기 제한 코드 없음 — Nginx 프록시 레벨에서 차단
- 프론트엔드에서 파일 선택 시점에 사전 검증은 하고 있으나, 결과 화면의 실패 항목 처리가 부적절
