# tars 서버 보안 상태 보고서

**작성일**: 2026.01.12
**서버**: tars.giize.com (100.110.215.65)

---

## 보안 점검 결과 요약

| 항목 | 상태 | 비고 |
|------|:----:|------|
| SSH 보안 | ✅ | 키 인증만 허용, Tailscale 전용 |
| 방화벽 (UFW) | ✅ | 80/443만 공개, 백엔드 포트 차단 |
| fail2ban | ✅ | SSH + 봇 스캔 자동 차단 |
| Nginx 보안 | ✅ | 민감 경로 차단 |
| 자동 업데이트 | ✅ | 보안 패치 매일 자동 적용 |

---

## 1. SSH 설정

```
PermitRootLogin: no
PasswordAuthentication: no
접근 인터페이스: tailscale0 (VPN 전용)
```

- Root 로그인 차단
- 패스워드 인증 비활성화 (키 인증만)
- Tailscale VPN 인증 기기만 SSH 접근 가능

---

## 2. 방화벽 (UFW)

### 공개 포트
| 포트 | 서비스 |
|------|--------|
| 80 | HTTP |
| 443 | HTTPS |

### Tailscale 전용
| 포트 | 서비스 |
|------|--------|
| 22 | SSH |
| 3389 | RDP |

### 차단된 백엔드 포트
- 3010 (aims_api), 3011 (aims_mcp), 3012 (aims_health_monitor)
- 8000 (aims_rag_api), 8002 (pdf_proxy), 8004 (annual_report_api), 8005 (pdf_converter)
- 27017 (MongoDB), 6333 (Qdrant)

---

## 3. fail2ban

| Jail | 조건 | 차단 기간 |
|------|------|----------|
| sshd | 3회 실패 | 24시간 |
| nginx-botsearch | 2회 탐지 | 1주일 |

**무시 IP**: localhost, Tailscale 대역 (100.64.0.0/10)

---

## 4. Nginx 보안

차단된 경로 (404 반환):
- `/.env`, `/.git`, `/.htaccess`
- `/wp-admin`, `/wp-login`, `/xmlrpc.php`
- `*.php` 파일 직접 접근

---

## 5. 자동 보안 업데이트

```
APT::Periodic::Update-Package-Lists "1"
APT::Periodic::Unattended-Upgrade "1"
```

매일 자동으로 보안 패치 적용

---

## 탐지된 공격 시도 (2026.01.12)

| 공격 IP | 위치 | 시도 | 결과 |
|---------|------|------|------|
| 185.177.72.61 | 프랑스 | 취약점 스캔 179회 | 404 차단 |
| 107.170.57.41 | 미국 | .env 탈취 시도 | 404 차단 |
| 45.139.104.171 | 독일 | .env 탈취 시도 | 404 차단 |

모든 공격 시도가 자동화된 봇 스캔이며, 방어 성공

---

## 결론

tars 서버의 보안 상태는 **양호**합니다.

- 웹 서비스(AIMS)는 Nginx를 통해 외부 공개 (80/443)
- 백엔드 API 포트는 방화벽으로 외부 차단
- 서버 관리(SSH/RDP)는 Tailscale VPN 필수
- 자동화된 공격 차단 시스템(fail2ban) 운영 중
- 보안 업데이트 자동 적용

---

*보고서 작성: Claude Code*
