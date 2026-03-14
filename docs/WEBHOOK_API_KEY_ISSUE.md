# Webhook API Key 불일치 이슈

## 발견일: 2026-03-15

## 증상
`full_pipeline.py` 임베딩 처리 완료 후 바이러스 스캔 webhook 호출 시 **401 인증 실패**.
```
[VirusScan] 스캔 트리거 실패: 401
```

## 원인
파이프라인과 aims-api가 **서로 다른 환경변수/값**으로 인증하고 있었음.

| 구분 | 환경변수 | 값 | 출처 |
|------|---------|-----|------|
| 파이프라인 (보내는 쪽) | `N8N_WEBHOOK_API_KEY` | `aims_n8n_webhook_secure_key_...` | `.env.shared` |
| aims-api Docker (받는 쪽) | `N8N_API_KEY` | JWT 토큰 (`eyJhbGci...`) | `.env` + deploy 스크립트 |

- 변수명도 다르고 (`N8N_WEBHOOK_API_KEY` vs `N8N_API_KEY`)
- 값도 다름 (평문 키 vs JWT 토큰)
- deploy 스크립트가 `N8N_WEBHOOK_API_KEY`를 Docker 컨테이너에 전달하지 않았음

## 임시 수정 (2026-03-15)
- `deploy_aims_api.sh`: `N8N_WEBHOOK_API_KEY`, `INTERNAL_WEBHOOK_API_KEY` 환경변수 Docker에 추가
- `customers-routes.js` (3곳) + `auth.js` (2곳): `INTERNAL_WEBHOOK_API_KEY` 우선 체크, `N8N_API_KEY` fallback 허용

## 현재 상태: 키 2종류 공존

| 키 | 값 | 용도 |
|---|---|---|
| `INTERNAL_WEBHOOK_API_KEY` = `N8N_WEBHOOK_API_KEY` | `aims_n8n_webhook_secure_key_...` | 파이프라인 <-> aims-api 내부 통신 (활성) |
| `N8N_API_KEY` | JWT 토큰 | 레거시 n8n용 (미사용, 삭제 예정) |

## TODO: n8n 삭제 시 함께 정리

n8n 관련 구현 전체 삭제 시 아래 작업 필요:

1. **환경변수 통일**: `INTERNAL_WEBHOOK_API_KEY` 하나로 통일
   - `.env.shared`에서 `N8N_WEBHOOK_API_KEY` -> `INTERNAL_WEBHOOK_API_KEY`
   - `.env`에서 `N8N_API_KEY` 삭제
   - `deploy_aims_api.sh`에서 `N8N_API_KEY`, `N8N_WEBHOOK_API_KEY` 제거

2. **코드 정리**:
   - `full_pipeline.py`: `N8N_WEBHOOK_API_KEY` -> `INTERNAL_WEBHOOK_API_KEY`
   - `customers-routes.js` (3곳): fallback 제거, `INTERNAL_WEBHOOK_API_KEY`만 체크
   - `auth.js` (2곳): 동일
   - `admin-routes.js` (1곳): `N8N_API_KEY` 참조 제거

3. **삭제 대상**:
   - `backend/n8n_flows/` 디렉토리 전체
   - `backup_aims.sh`의 `N8N_API_KEY` 참조

## 관련 파일
- `backend/api/aims_api/deploy_aims_api.sh` — Docker 환경변수 전달
- `backend/api/aims_api/routes/customers-routes.js:3498,3689,3796` — webhook 인증
- `backend/api/aims_api/middleware/auth.js:175,213` — API key 미들웨어
- `backend/embedding/full_pipeline.py:26-28,97` — webhook 호출
- `.env.shared` — `N8N_WEBHOOK_API_KEY` 정의
- `backend/api/aims_api/.env` — `N8N_API_KEY` 정의
