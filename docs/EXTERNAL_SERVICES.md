# AIMS 외부 서비스 현황

> 최종 업데이트: 2026-02-13
> 데이터 출처: 프로덕션 MongoDB `system_settings.ai_models` (2026-02-02 갱신)

## 유료 서비스 (API 사용량 기반 과금)

### 1. OpenAI API

AIMS의 AI 서비스. 월 예산 $10 설정.

| 모델 (실제 운영) | 용도 | 관련 서비스 | 과금 |
|------------------|------|-------------|------|
| `gpt-4.1-mini` | AI 채팅 + MCP 40개 도구 호출 | aims_api | 토큰 기반 |
| `gpt-4.1-nano` | RAG 답변 생성 | aims_rag_api | 토큰 기반 |
| `gpt-4o-mini` | RAG 쿼리 의도 분석 | aims_rag_api | 토큰 기반 |
| `gpt-4o-mini` | 문서 요약 (Summary) | document_pipeline | 토큰 기반 |
| `text-embedding-3-small` | 문서/쿼리 임베딩 (1536차원) | embedding (크론), aims_rag_api | 토큰 기반 |
| `whisper-1` | 음성 텍스트 변환 (한국어 STT) | aims_api | $0.006/분 |

> AR/CRS 파싱은 `pdfplumber_table` 파서를 사용하며 **OpenAI를 사용하지 않음**.
> annualReport/customerReview에 모델 설정이 있으나 파서가 `pdfplumber_table`이므로 AI 호출 없음.

**관련 파일:**
- `backend/api/aims_api/lib/chatService.js` - 채팅 + MCP 도구 호출
- `backend/api/aims_api/lib/aiModelSettings.js` - 모델 설정 (MongoDB 오버라이드)
- `backend/api/aims_api/lib/transcribeService.js` - 음성 인식
- `backend/api/aims_rag_api/rag_search.py` - RAG 답변 + 쿼리 임베딩
- `backend/api/aims_rag_api/query_analyzer.py` - 쿼리 의도 분석
- `backend/embedding/create_embeddings.py` - 문서 임베딩 생성
- `backend/api/document_pipeline/services/openai_service.py` - 문서 요약

**모델 설정 위치:**
- MongoDB: `docupload.system_settings` (`_id: "ai_models"`)
- 코드 기본값: `backend/api/aims_api/lib/aiModelSettings.js` (MongoDB 설정이 우선)
- 월 예산: $10 / 알림: 90%

---

### 2. Upstage API

문서 OCR(디지타이제이션) 전용.

| 엔드포인트 | 용도 |
|------------|------|
| `https://api.upstage.ai/v1/document-digitization` | PDF 텍스트 추출, OCR |

**관련 파일:**
- `backend/api/document_pipeline/services/upstage_service.py` - OCR 서비스
- `backend/api/annual_report_api/services/parser_upstage.py` - Upstage 기반 AR 파서 (현재 미사용, 대안으로 존재)

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

## 사용하지 않는 서비스 (코드 존재, 실제 미사용)

| 서비스 | 비고 |
|--------|------|
| Anthropic Claude API | `anthropic_service.py` 존재하나 import/호출 없음 (dead code) |
| OpenAI AR 파싱 (`parser.py`) | 코드 존재하나 현재 `pdfplumber_table` 파서로 대체됨 |
| Upstage AR 파서 (`parser_upstage.py`) | 코드 존재하나 현재 `pdfplumber_table` 파서로 대체됨 |
| AWS (S3, CloudFront 등) | 미사용 |
| MongoDB Atlas | 미사용 (자체 호스팅) |
| Redis Cloud | 미사용 (자체 호스팅) |
| Stripe / SendGrid / Twilio | 미사용 |

---

## 비용 요약

```
실질 과금 서비스 (월 예산 $10):
  1. OpenAI API
     - gpt-4.1-mini   ← 채팅 + MCP 도구 호출 (가장 큰 비중)
     - gpt-4.1-nano   ← RAG 답변
     - gpt-4o-mini    ← 쿼리 분석 + 문서 요약
     - text-embedding-3-small ← 임베딩
     - whisper-1      ← 음성 인식
  2. Upstage API     ← OCR 처리량에 비례

인프라:
  3. 서버 호스팅     ← tars 서버 (MongoDB, Qdrant, Redis, 백엔드 전체)
  4. 도메인          ← aims.giize.com, tars.giize.com
```
