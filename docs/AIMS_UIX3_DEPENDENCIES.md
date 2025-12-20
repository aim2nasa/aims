# AIMS UIX-3 의존성 요약

## Quick Reference

| 카테고리 | 서비스 |
|----------|--------|
| Backend API | `tars.giize.com:3010` (aims_api) |
| RAG API | `tars.giize.com:8001` (aims_rag_api) |
| Search API | `tars.giize.com/search_api` |
| PDF Proxy | `tars.giize.com:8004` |
| Annual Report | `tars.giize.com:8002` |
| N8N Webhook | `n8nd.giize.com` |
| SSE 스트리밍 | 6개 엔드포인트 |
| 외부 서비스 | Naver Maps, OAuth |

---

## Backend API (tars.giize.com)

| 서비스 | 포트 | 용도 |
|--------|------|------|
| aims_api | 3010 | 메인 API (고객, 문서, 계약, 인증) |
| aims_rag_api | 8001 | RAG 검색, 벡터 DB |
| annual_report_api | 8002 | 연간보고서 생성 |
| pdf_proxy | 8004 | PDF 메타데이터 수정 |
| search_api | /search_api | 문서 키워드/시맨틱 검색 |

## SSE 스트리밍 엔드포인트

| 엔드포인트 | 용도 |
|------------|------|
| `/api/documents/sse/search` | 실시간 검색 |
| `/api/documents/sse/status` | 문서 처리 상태 |
| `/api/notifications/sse/user/:userId` | 사용자 알림 |

## 외부 서비스

| 서비스 | URL | 용도 |
|--------|-----|------|
| N8N Webhook | n8nd.giize.com | 파일 업로드 처리 |
| Naver Maps | openapi.map.naver.com | 지도 표시 |
| OAuth | Google/Naver/Kakao | 소셜 로그인 |

## 인프라

- **Database**: MongoDB (tars:27017/docupload)
- **Vector DB**: Qdrant (시맨틱 검색)
- **Web Server**: Nginx (aims.giize.com)
- **Process Manager**: PM2

## 환경 변수 (필수)

```env
VITE_API_BASE_URL=https://tars.giize.com
VITE_NAVER_CLIENT_ID=...
```
