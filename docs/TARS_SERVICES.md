# tars 서비스 전체 맵

> 최종 갱신: 2026-04-02 (5회 리부팅 테스트 완료)

## Docker 컨테이너 (4개)

| 이름 | 포트 | 역할 | Health URL | restart policy |
|------|------|------|-----------|:--------------:|
| aims-api | 3010 | 메인 API (Express) | http://localhost:3010/api/health | unless-stopped |
| aims-rag-api | 8000 | RAG 검색 API (FastAPI) | http://localhost:8000/health | unless-stopped |
| qdrant | 6333-6334 | 벡터 DB | http://localhost:6333/collections/docembed | unless-stopped |
| portainer | 9000/9443 | Docker 관리 UI | (점검 불필요) | always |

## PM2 프로세스 (8개)

| 이름 | 포트 | 역할 | 자동시작 |
|------|------|------|:--------:|
| aims-mcp | 3011 | MCP 서버 (Node) | pm2-rossi.service |
| aims-health-monitor | 3012 | 헬스 모니터 (Node) | pm2-rossi.service |
| pdf_proxy | 8002 | PDF 프록시 (Python) | pm2-rossi.service |
| pdf_converter | 8005 | PDF 변환 (Node) | pm2-rossi.service |
| annual_report_api | 8004 | AR/CRS API (uvicorn) | pm2-rossi.service |
| document_pipeline | 8100 | 문서 파이프라인 (uvicorn) | pm2-rossi.service |
| xpipe-web | 8200 | xPipe 웹 (uvicorn) | pm2-rossi.service |
| rustdesk-service | 3015 | 원격 지원 (Node) | pm2-rossi.service |

## Systemd 서비스 (6개)

| 이름 | 역할 | 자동시작 | 비고 |
|------|------|:--------:|------|
| mongod | MongoDB 27017 | enabled | |
| redis-server | Redis 6379 | enabled | |
| nginx | 웹서버 80/443 + Admin 8080 | enabled | `0.0.0.0:8080`으로 변경됨 |
| tailscaled | Tailscale VPN | enabled | |
| teamviewerd | TeamViewer | enabled | ⚠️ 리부팅 시 ID 초기화 (수동 setup 필요) |
| docker | Docker 엔진 | enabled | |

## Nginx 설정

| 파일 | 역할 | 상태 |
|------|------|------|
| `sites-enabled/aims` | aims.giize.com (80/443 → 프론트+API) | 활성 |
| `sites-enabled/tars` | tars.giize.com (80/443 → Redmine) | 활성 |
| `sites-enabled/admin-aims-tailscale` | Admin (0.0.0.0:8080) | 활성 |
| `sites-available/anythingllm.disabled` | al.tars.giize.com | 비활성 (502 유발하여 제거) |

## 크론 작업 (5개)

| 주기 | 역할 | 스크립트 |
|------|------|---------|
| */1 * * * * | 임베딩 크론 (flock) | run_pipeline.sh → full_pipeline.py |
| * * * * * | 백업 워처 | backup_watcher.sh |
| 5 0 1 * * | credit_pending 재처리 | process_credit_pending.py |
| 0 2 * * * | Golden Master 검증 | golden_master.verify |
| 0 4 * * * | 로그 로테이션 | rotate_logs.sh |

## 외부 접근 경로

| URL | 경유 | 목적지 |
|-----|------|--------|
| https://aims.giize.com | Nginx 443 | aims-uix3 dist + API proxy → 3010 |
| https://tars.giize.com | Nginx 443 | Redmine → 3000 |
| http://tars:8080 | Nginx 8080 (Tailscale) | aims-admin dist + API proxy → 3010 |
| http://tars:8200 | 직접 | xPipe 웹 |

## 점검 도구

| 도구 | 용도 | 실행 |
|------|------|------|
| `scripts/health-check.sh` | 28개 서비스 전수 점검 | `ssh rossi@100.110.215.65 'bash ~/aims/scripts/health-check.sh'` |
| `scripts/fix-boot-order.sh` | Nginx 부팅 순서 설정 (1회) | 적용 완료 |
| `scripts/fix-nginx-ssl.sh` | anythingllm 제거 (1회) | 적용 완료 |

## 알려진 이슈

### TeamViewer 리부팅 시 ID 초기화
- 원인: TeamViewer 15.75.4 SEGV 버그
- 해결: tars 모니터에서 `sudo teamviewer setup` (수동)
- 자동화 불가 (설정 파일 복원해도 데몬이 덮어씀)

### AIMS Admin 리부팅 후 "aims_api 연결 필요"
- 원인: 세션 토큰 만료
- 해결: Admin 로그아웃 → 재로그인
