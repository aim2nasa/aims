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

### SSH 연결 안 될 때

1. 이 PC Tailscale 확인: `tailscale status` → WonderCastle이 `offline`이면 `tailscale up`
2. tars가 Tailscale에 안 보이면 → tars 물리 접근 필요
3. Tailscale에 보이는데 SSH 안 되면 → `tailscale ping 100.110.215.65`로 확인

## 점검 스크립트

**한 번의 SSH 호출로 모든 점검을 수행한다:**

```bash
ssh rossi@100.110.215.65 'bash ~/aims/scripts/health-check.sh'
```

리부팅 직후에는 SSH 연결까지 1-3분 소요. 연결 대기:
```bash
for i in $(seq 1 15); do sleep 30 && ssh -o ConnectTimeout=5 rossi@100.110.215.65 'uptime' && break || echo "체크 $i: OFFLINE"; done
```

## 점검 항목 (28개, 6개 카테고리)

### 1. Systemd 서비스 (6개)
| 서비스 | 역할 | 정상 | 리부팅 자동시작 |
|--------|------|:----:|:--------------:|
| mongod | MongoDB 27017 | active | enabled |
| redis-server | Redis 6379 | active | enabled |
| nginx | 웹서버 80/443 + Admin 8080 | active | enabled |
| tailscaled | Tailscale VPN | active | enabled |
| teamviewerd | TeamViewer | active | enabled (⚠️ ID 초기화됨, 수동 setup 필요) |
| docker | Docker 엔진 | active | enabled |

### 2. Docker 컨테이너 (4개)
| 이름 | 포트 | 정상 | restart policy |
|------|------|:----:|:--------------:|
| aims-api | 3010 | Up + healthy | unless-stopped |
| aims-rag-api | 8000 | Up | unless-stopped |
| qdrant | 6333 | Up | unless-stopped |
| portainer | 9000 | Up | always |

### 3. PM2 프로세스 (8개)
| 이름 | 포트 | 정상 | 자동시작 |
|------|------|:----:|:--------:|
| aims-mcp | 3011 | online | pm2-rossi.service |
| aims-health-monitor | 3012 | online | pm2-rossi.service |
| pdf_proxy | 8002 | online | pm2-rossi.service |
| pdf_converter | 8005 | online | pm2-rossi.service |
| annual_report_api | 8004 | online | pm2-rossi.service |
| document_pipeline | 8100 | online | pm2-rossi.service |
| xpipe-web | 8200 | online | pm2-rossi.service |
| rustdesk-service | 3015 | online | pm2-rossi.service |

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
| 항목 | 확인 | 정상 |
|------|------|:----:|
| 크론 | crontab에 임베딩 크론 존재 | 1개 이상 |
| 디스크 | df -h / | 사용률 < 90% |
| 메모리 | free -m | 여유 > 1GB |

## 외부 접근 점검 (헬스체크 스크립트 외 추가 확인)

FAIL 항목이 있거나 사용자가 요청하면 추가 확인:

```bash
ssh rossi@100.110.215.65 '
echo "aims.giize.com: $(curl -s -o /dev/null -w %{http_code} -k https://localhost -H "Host: aims.giize.com" --connect-timeout 3)"
echo "tars:8080 Admin: $(curl -s -o /dev/null -w %{http_code} http://100.110.215.65:8080 --connect-timeout 3)"
echo "tars:8200 xPipe: $(curl -s -o /dev/null -w %{http_code} http://localhost:8200 --connect-timeout 3)"
echo "API via Nginx: $(curl -s -o /dev/null -w %{http_code} -k https://localhost/api/health -H "Host: aims.giize.com" --connect-timeout 3)"
'
```

모두 200이어야 정상.

## FAIL 시 자동 복구 시도

| 증상 | 자동 복구 | sudoers |
|------|----------|:-------:|
| nginx failed | `sudo -n systemctl restart nginx` | 설정됨 |
| teamviewerd failed | `sudo -n systemctl restart teamviewerd` | 설정됨 |
| PM2 프로세스 stopped | `pm2 restart <name>` | 불필요 |
| Docker 컨테이너 down | `docker start <name>` | 불필요 |

sudoers 설정: `/etc/sudoers.d/aims-services`
미설정 시 tars에서 수동 실행 안내.

## 알려진 이슈 (2026-04-02)

### TeamViewer 리부팅 시 ID 초기화
- **원인**: TeamViewer 15.75.4 SEGV 버그로 종료 시 설정 파일 손상
- **증상**: 리부팅 후 TeamViewer ID 비어있음, 연결 불가
- **자동 복구 불가**: 설정 파일 복원해도 데몬이 덮어씀
- **수동 해결**: tars 모니터에서 `sudo teamviewer setup` (이메일/비밀번호 입력)
- **해결 시도 이력**: systemd restore 서비스, config 백업/복원 — 모두 실패

### Nginx Admin 바인딩
- **이전 설정**: `listen 100.110.215.65:8080` (Tailscale IP 직접 바인딩)
- **문제**: 리부팅 시 Tailscale IP 할당 전 Nginx 시작 → bind 실패
- **해결**: `listen 0.0.0.0:8080`으로 변경 (2026-04-02). UFW에서 8080 차단으로 보안 유지
- **설정 파일**: `/etc/nginx/sites-enabled/admin-aims-tailscale`

### Nginx 불필요 설정
- `anythingllm` (al.tars.giize.com): 비활성화됨 → `/etc/nginx/sites-available/anythingllm.disabled`
- `n8n` (n8nd.giize.com): 삭제 예정
- `.bak.*` 파일들: `/etc/nginx/sites-available/`로 이동 완료

### AIMS Admin "aims_api 연결 필요"
- **원인**: 리부팅 후 Admin 세션 토큰 만료
- **해결**: Admin 페이지에서 로그아웃 → 재로그인

## 주의사항

- SSH 연결 안 되면 Tailscale 상태부터 확인 (`tailscale status`)
- 이 PC(WonderCastle)의 Tailscale 세션이 만료될 수 있음 — Tailscale 트레이에서 재로그인
- 리부팅 직후에는 1-3분 대기 후 점검 (서비스 올라오는 시간)
- TeamViewer는 점검에서 PASS(데몬 active)여도 실제 연결 안 될 수 있음 (ID 초기화)
