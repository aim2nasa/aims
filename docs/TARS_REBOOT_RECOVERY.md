# tars 서버 리부팅 시 AIMS 서비스 자동 복구

> 작성일: 2026-03-19
> 서버: tars.giize.com (100.110.215.65)

## 개요

tars 서버 리부팅 시 모든 AIMS 서비스가 **자동으로 복구**되도록 설정되어 있다.
별도의 수동 스크립트 실행 없이, Linux systemd가 의존성 순서에 따라 서비스를 자동 시작한다.

---

## 부팅 순서

```
OS 부팅
  │
  ├─ ① network-online.target (네트워크 준비)
  │
  ├─ ② mongod.service (MongoDB 시작)
  │     └─ systemd 자동 실행 (enabled)
  │
  ├─ ③ docker.service (Docker 시작)
  │     └─ 컨테이너 6개 자동 복구 (restart: unless-stopped)
  │        aims-api, aims-rag-api, qdrant, portainer, rustdesk-hbbs, rustdesk-hbbr
  │
  ├─ ④ pm2-rossi.service (PM2 시작)
  │     └─ mongod + docker 준비된 후 실행
  │     └─ pm2 resurrect → 저장된 6개 프로세스 복원
  │        aims-mcp, document_pipeline, pdf_converter,
  │        pdf_proxy, aims-health-monitor, rustdesk-service
  │
  ├─ ⑤ nginx.service (웹서버 시작)
  │
  ├─ ⑥ tailscaled.service (Tailscale VPN 시작)
  │
  └─ ⑦ cron (크론잡 시작 → 임베딩 파이프라인 등)
```

---

## 서비스별 자동시작 설정

### systemd 서비스 (OS 레벨)

| 서비스 | 상태 | 설명 |
|--------|------|------|
| `mongod` | enabled | MongoDB 데이터베이스 |
| `docker` | enabled | Docker 엔진 |
| `nginx` | enabled | 리버스 프록시 / 웹서버 |
| `tailscaled` | enabled | Tailscale VPN |
| `ufw` | enabled | 방화벽 |
| `pm2-rossi` | enabled | PM2 프로세스 매니저 |

### Docker 컨테이너 (Docker 레벨)

| 컨테이너 | restart 정책 | 설명 |
|-----------|-------------|------|
| `aims-api` | unless-stopped | AIMS 메인 API (포트 3010) |
| `aims-rag-api` | unless-stopped | RAG API |
| `qdrant` | unless-stopped | 벡터 DB (포트 6333-6334) |
| `portainer` | always | Docker 관리 UI (포트 9443) |
| `rustdesk-hbbs` | unless-stopped | RustDesk 시그널링 서버 |
| `rustdesk-hbbr` | unless-stopped | RustDesk 릴레이 서버 |

### PM2 프로세스 (pm2-rossi.service 레벨)

| 프로세스 | 인터프리터 | 설명 |
|----------|-----------|------|
| `aims-mcp` | node | MCP 서버 |
| `document_pipeline` | python (venv) | 문서 처리 파이프라인 (포트 8100) |
| `pdf_converter` | node | PDF 변환 서비스 |
| `pdf_proxy` | python (venv) | PDF 프록시 |
| `aims-health-monitor` | node | 헬스 모니터링 |
| `rustdesk-service` | node | RustDesk 서비스 |

### Cron 작업

| 주기 | 작업 |
|------|------|
| 매 1분 | 임베딩 파이프라인 (`run_pipeline.sh`, flock 보호) |
| 매 1분 | 백업 워처 (`backup_watcher.sh`) |
| 매주 일요일 자정 | cron.log 비우기 |
| 매월 1일 00:05 | credit_pending 문서 재처리 |

---

## PM2 systemd 서비스 상세

서비스 파일: `/etc/systemd/system/pm2-rossi.service`

```ini
[Unit]
Description=PM2 process manager
After=network-online.target mongod.service docker.service
Wants=network-online.target
Requires=mongod.service

[Service]
Type=forking
User=rossi
Restart=on-failure
RestartSec=10
ExecStart=/usr/lib/node_modules/pm2/bin/pm2 resurrect

[Install]
WantedBy=multi-user.target
```

핵심 설정:
- `Requires=mongod.service` — MongoDB가 시작되지 않으면 PM2도 시작하지 않음
- `After=mongod.service docker.service` — MongoDB, Docker가 준비된 후 PM2 시작
- `Restart=on-failure`, `RestartSec=10` — 실패 시 10초 후 자동 재시작

---

## 리부팅 후 확인 방법

### aims-admin (권장)

`https://admin.aims.giize.com` → **System Health** 페이지에서 모든 서비스 상태를 한눈에 확인할 수 있다.
각 서비스의 상태(healthy/unhealthy), 응답 시간, 업타임, 시스템 리소스(CPU/메모리/디스크)를 실시간으로 표시한다.

### 전체 한 번에 확인 (CLI)

```bash
ssh rossi@100.110.215.65 '\
  echo "=== systemd ===" && \
  for s in mongod docker nginx pm2-rossi tailscaled ufw; do \
    printf "%-15s %s\n" "$s" "$(systemctl is-active $s)"; \
  done && \
  echo "" && echo "=== Docker ===" && docker ps --format "{{.Names}}\t{{.Status}}" && \
  echo "" && echo "=== PM2 ===" && pm2 list && \
  echo "" && echo "=== Health ===" && \
  curl -s -o /dev/null -w "aims-api(3010): %{http_code}\n" http://localhost:3010/api/health && \
  curl -s -o /dev/null -w "doc_pipeline(8100): %{http_code}\n" http://localhost:8100/health'
```

### 개별 확인 (서버 내부)

```bash
# systemd 서비스 상태
systemctl status mongod docker nginx pm2-rossi

# PM2 프로세스
pm2 list

# Docker 컨테이너
docker ps

# AIMS API 헬스체크
curl -s http://localhost:3010/api/health
curl -s http://localhost:8100/health
```

---

## PM2 프로세스 변경 시 주의사항

PM2에 프로세스를 추가/삭제한 후에는 반드시 `pm2 save`를 실행해야 한다.
그래야 다음 리부팅 시 변경된 프로세스 목록이 복원된다.

```bash
# 프로세스 추가/삭제 후
pm2 save
```
