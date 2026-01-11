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

## 외부 노출 서비스 위험 분석

### 공격 표면

| 구분 | 노출 여부 | 보호 수단 |
|------|:--------:|----------|
| Nginx (80/443) | ⚠️ 공개 | fail2ban, 보안 스니펫 |
| AIMS Frontend | ⚠️ 공개 | Nginx 뒤에서 정적 파일 제공 |
| AIMS Admin | ⚠️ 공개 | Nginx 뒤에서 정적 파일 제공 |
| aims_api (3010) | 🔒 차단 | UFW + Nginx 프록시 |
| MongoDB (27017) | 🔒 차단 | UFW |

### 가능한 공격 벡터 및 현재 방어 상태

| 공격 유형 | 위험도 | 현재 방어 | 상태 |
|----------|:------:|----------|:----:|
| **DDoS** | 높음 | 없음 (Cloudflare 미사용) | ⚠️ |
| **취약점 스캔** | 중간 | fail2ban (2회 → 1주 차단) | ✅ |
| **SSH 무차별 대입** | 중간 | Tailscale 전용 + fail2ban | ✅ |
| **.env 파일 탈취** | 중간 | Nginx 404 반환 | ✅ |
| **SQL Injection** | 중간 | MongoDB (NoSQL) + 입력 검증 | ✅ |
| **XSS** | 중간 | React 자동 이스케이프 | ✅ |
| **CSRF** | 낮음 | SameSite 쿠키 | ✅ |
| **WordPress 공격** | 낮음 | WordPress 미사용, 경로 차단 | ✅ |

### 미적용 보안 조치

| 항목 | 효과 | 필요성 | 비고 |
|------|------|:------:|------|
| Cloudflare | DDoS 방어, WAF | 중간 | 대규모 공격 시 필요 |
| Rate Limiting | API 남용 방지 | 낮음 | 현재 트래픽 수준에선 불필요 |
| 보안 헤더 | XSS/Clickjacking 방어 | 낮음 | CSP, X-Frame-Options 등 |
| WAF (ModSecurity) | 웹 공격 차단 | 낮음 | 과도한 오버헤드 |

### 위험 평가

**현재 위험 수준: 낮음~중간**

- 대부분의 일반적인 공격은 차단됨
- **DDoS 공격에 대한 방어 부재**가 가장 큰 취약점
- 실제 공격 시도는 모두 자동화된 봇 스캔 수준

### 권장 사항

1. **단기**: 현재 상태 유지 (충분한 보안)
2. **중기**: 서비스 성장 시 Cloudflare 도입 검토
3. **장기**: 정기적 보안 점검 및 로그 모니터링

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
