# AIMS 외부 서비스 현황

> 최종 업데이트: 2026-02-13

## 유료 서비스 (API 사용량 기반 과금)

### 1. OpenAI API

AIMS의 핵심 AI 서비스. 비용 비중이 가장 크다.

| 모델 | 용도 | 관련 서비스 |
|------|------|-------------|
| `gpt-4o` | AI 채팅 어시스턴트 (고객/문서/계약 관리 대화형 인터페이스) | aims_api |
| `gpt-4.1` | Annual Report 테이블 파싱 | annual_report_api |
| `text-embedding-3-small` | 문서 임베딩 생성 (1536차원) | embedding (크론탭) |
| `gpt-4o` | 문서 요약 (Summary) | document_pipeline |

**관련 파일:**
- `backend/api/aims_api/lib/chatService.js` - 채팅 로직
- `backend/api/annual_report_api/services/parser.py` - AR 파싱
- `backend/embedding/create_embeddings.py` - 임베딩 생성
- `backend/api/document_pipeline/services/openai_service.py` - 문서 요약

**크레딧 관리:**
- `backend/api/aims_api/lib/storageQuotaService.js` - 사용자별 크레딧 정책
- `docs/EMBEDDING_CREDIT_POLICY.md` - 크레딧 정책 문서

---

### 2. Upstage API

문서 OCR(디지타이제이션) 전용.

| 엔드포인트 | 용도 |
|------------|------|
| `https://api.upstage.ai/v1/document-digitization` | PDF 텍스트 추출, OCR |

**관련 파일:**
- `backend/api/document_pipeline/services/upstage_service.py` - OCR 서비스
- `backend/api/annual_report_api/services/parser_upstage.py` - Upstage 기반 AR 파서

---

## 무료 서비스

### 3. Kakao API

| 기능 | 용도 | 과금 |
|------|------|------|
| OAuth 2.0 | 카카오 소셜 로그인 | 무료 |
| Local API | 주소 검색 (`/v2/local/search/address`) | 무료 (일 쿼터 존재) |

**관련 파일:**
- `backend/api/aims_api/config/passport.js` - 로그인 전략
- `backend/api/aims_api/routes/address-routes.js` - 주소 검색 프록시

---

### 4. Naver API

| 기능 | 용도 | 과금 |
|------|------|------|
| OAuth 2.0 | 네이버 소셜 로그인 | 무료 |
| Cloud Maps | 지도 서비스 | 무료 쿼터 (초과 시 과금) |

**관련 파일:**
- `backend/api/aims_api/config/passport.js` - 로그인 전략

---

### 5. Google OAuth

| 기능 | 용도 | 과금 |
|------|------|------|
| OAuth 2.0 | 구글 소셜 로그인 | 무료 |

**관련 파일:**
- `backend/api/aims_api/config/passport.js` - 로그인 전략

---

### 6. Slack Webhook

| 기능 | 용도 | 과금 |
|------|------|------|
| Incoming Webhook | 문서 처리 에러 알림 발송 | 무료 |

**관련 파일:**
- `backend/api/document_pipeline/workers/error_logger.py` - 알림 발송

---

### 7. Tailscale VPN

| 기능 | 용도 | 과금 |
|------|------|------|
| Mesh VPN | 개발 환경 → 백엔드 서버 보안 접속 | Free Tier |

- Tailscale IP: `100.110.215.65` (tars 서버)
- 상세: `docs/NETWORK_SECURITY_ARCHITECTURE.md`

---

## 자체 호스팅 (서버 비용만 발생)

| 서비스 | 버전 | 위치 | 용도 |
|--------|------|------|------|
| MongoDB | - | `tars:27017` (네이티브) | 메인 DB (`docupload`) |
| Qdrant | v1.9.0 | `localhost:6333` (Docker) | 벡터 DB (RAG 검색) |
| Redis | - | `127.0.0.1:6379` (네이티브) | 큐/캐싱 (OCR 워커) |

---

## 사용하지 않는 서비스

| 서비스 | 비고 |
|--------|------|
| Anthropic Claude API | `anthropic_service.py` 파일 존재하나 실제 호출 없음 (dead code). n8n Shadow Mode용으로 작성되었으나 n8n 제거로 폐기됨 |
| AWS (S3, CloudFront 등) | 미사용 |
| MongoDB Atlas | 미사용 (자체 호스팅) |
| Redis Cloud | 미사용 (자체 호스팅) |
| Stripe / SendGrid / Twilio | 미사용 |

---

## 비용 요약

```
실질 과금 서비스:
  1. OpenAI API      ← 가장 큰 비용 (채팅 + 임베딩 + AR파싱 + 요약)
  2. Upstage API     ← OCR 처리량에 비례

인프라:
  3. 서버 호스팅     ← tars 서버 (MongoDB, Qdrant, Redis, 백엔드 전체)
  4. 도메인          ← aims.giize.com, tars.giize.com
```
