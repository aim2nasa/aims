---
name: health-check
description: tars 서비스 전수 점검. 리부팅 후, 배포 후, 장애 의심 시 자동 사용
user-invocable: true
---

# AIMS 서비스 헬스체크

tars 서버의 모든 AIMS 관련 서비스 상태를 점검한다.

## 트리거

- `/health-check` (사용자 호출)
- "서비스 점검", "서비스 상태", "헬스체크", "리부팅 후 확인"

## 사전 조건

- SSH 접속: `ssh rossi@100.110.215.65`
- Tailscale VPN 연결 필요

## 점검 스크립트

**한 번의 SSH 호출로 모든 점검을 수행한다.** 아래 명령을 그대로 실행:

```bash
ssh rossi@100.110.215.65 'bash ~/aims/scripts/health-check.sh'
```

## 점검 항목 (6개 카테고리)

### 1. Systemd 서비스 (6개)
| 서비스 | 역할 | 정상 |
|--------|------|:----:|
| mongod | MongoDB 27017 | active |
| redis-server | Redis 6379 | active |
| nginx | 웹서버 80/443 | active |
| tailscaled | Tailscale VPN | active |
| teamviewerd | TeamViewer | active |
| docker | Docker 엔진 | active |

### 2. Docker 컨테이너 (4개)
| 이름 | 포트 | 정상 |
|------|------|:----:|
| aims-api | 3010 | Up + healthy |
| aims-rag-api | 8000 | Up |
| qdrant | 6333 | Up |
| portainer | 9000 | Up |

### 3. PM2 프로세스 (8개)
| 이름 | 포트 | 정상 |
|------|------|:----:|
| aims-mcp | 3011 | online |
| aims-health-monitor | 3012 | online |
| pdf_proxy | 8002 | online |
| pdf_converter | 8005 | online |
| annual_report_api | 8004 | online |
| document_pipeline | 8100 | online |
| xpipe-web | 8200 | online |
| rustdesk-service | 3015 | online |

### 4. Health Endpoint (4개)
| URL | 정상 |
|-----|:----:|
| http://localhost:3010/api/health | 200 |
| http://localhost:8000/health | 200 |
| http://localhost:8004/health | 200 |
| http://localhost:8100/health | 200 |

### 5. 데이터 서비스 (3개)
| 서비스 | 확인 방법 | 정상 |
|--------|----------|:----:|
| MongoDB | `mongosh --eval "db.adminCommand({ping:1})"` | { ok: 1 } |
| Redis | `redis-cli ping` | PONG |
| Qdrant | `curl localhost:6333/collections/docembed` | points > 0, status=green |

### 6. 인프라 (3개)
| 항목 | 확인 |
|------|------|
| 크론 | crontab에 임베딩 크론 존재 |
| 디스크 | 사용률 < 90% |
| 메모리 | 여유 메모리 > 1GB |

## 결과 보고 형식

```
## tars 헬스체크 결과

| 카테고리 | 항목 | 상태 |
|---------|------|:----:|
| Systemd | mongod | PASS/FAIL |
| ... | ... | ... |

FAIL 항목: N건
→ (FAIL 상세)
```

## FAIL 시 자동 복구 시도

| 증상 | 자동 복구 |
|------|----------|
| nginx failed | `sudo -n systemctl restart nginx` (sudoers 설정 필요) |
| PM2 프로세스 stopped | `pm2 restart <name>` |
| Docker 컨테이너 down | `docker start <name>` |

sudoers 미설정 시 사용자에게 수동 실행 안내.

## 주의사항

- SSH 연결 안 되면 Tailscale 상태부터 확인 (`tailscale status`)
- 이 PC(WonderCastle)의 Tailscale 세션이 만료될 수 있음 — `tailscale up` 실행
- 리부팅 직후에는 30초~1분 대기 후 점검 (서비스 올라오는 시간)
