# yuri ↔ tars 바이러스 스캔 연동 가이드

## 개념 요약

```
사용자가 파일 업로드
       ↓
  tars (메인 서버)         ←── 결과 콜백 ──→    yuri (라즈베리파이5)
  aims_api:3010                                  ClamAV 스캔:8100
  "이 파일 스캔해줘"  ───── Tailscale VPN ─────→ "OK, 스캔할게"
                                                     ↓
                                              /mnt/tars-files (SSHFS)
                                              tars의 파일을 직접 읽음
```

**왜 이런 구조인가?**
- ClamAV(바이러스 엔진)는 CPU를 많이 씀 → 메인 서버 부하 분리
- yuri(RPi5)가 전담 스캐너 역할
- Tailscale VPN으로 안전하게 통신

---

## 네트워크 구성

| 장비 | 역할 | Tailscale IP | 포트 |
|------|------|-------------|------|
| **tars** | 메인 서버 (aims_api) | 100.110.215.65 | 3010 |
| **yuri** | 바이러스 스캐너 (ClamAV) | 100.120.196.45 | 8100 |

**통신 방향:**
- tars → yuri: "이 파일 스캔해줘" (`POST /scan`)
- yuri → tars: "스캔 결과야" (`POST /api/admin/virus-scan/result`)

---

## 파일 접근: SSHFS 마운트

yuri가 tars의 파일을 스캔하려면 파일에 접근해야 합니다.
**SSHFS**로 tars의 파일 디렉토리를 yuri에 마운트합니다.

```
tars: /data/files/users/xxx/file.pdf    (원본)
                  ↕ SSHFS
yuri: /mnt/tars-files/users/xxx/file.pdf (읽기 전용)
```

### fstab 설정 (yuri의 /etc/fstab)

```
rossi@100.110.215.65:/data/files /mnt/tars-files fuse.sshfs defaults,allow_other,_netdev,IdentityFile=/home/gls/.ssh/id_ed25519_tars,reconnect,ServerAliveInterval=15,ServerAliveCountMax=3 0 0
```

| 옵션 | 의미 |
|------|------|
| `fuse.sshfs` | SSH 기반 파일시스템 마운트 |
| `IdentityFile=...` | 비밀번호 없이 SSH 키로 인증 |
| `reconnect` | 연결 끊김 시 자동 재연결 시도 |
| `ServerAliveInterval=15` | 15초마다 keepalive 패킷 전송 |
| `allow_other` | root 외 사용자도 접근 가능 |
| `_netdev` | 네트워크 준비 후 마운트 |

### 마운트 복구 (끊어졌을 때)

```bash
# yuri에서 실행
sudo mount /mnt/tars-files

# 확인
ls /mnt/tars-files/users/ | head -3
```

### 자동 복구 크론 (1분마다 체크)

```bash
# yuri의 root crontab (sudo crontab -e)
* * * * * mountpoint -q /mnt/tars-files || mount /mnt/tars-files
```

---

## 스캔 흐름

### 1. 실시간 스캔 (파일 업로드 시)

```
1. 사용자가 파일 업로드
2. tars: virusScan.status = 'pending' 설정
3. tars → yuri: POST http://100.120.196.45:8100/scan
   body: { file_path: "/data/files/users/.../file.pdf", document_id: "xxx" }
4. yuri: /data/files/... → /mnt/tars-files/... 경로 변환
5. yuri: ClamAV로 스캔 실행
6. yuri → tars: POST http://100.110.215.65:3010/api/admin/virus-scan/result
   body: { status: "clean", scanDurationMs: 548 }
7. tars: virusScan.status = 'clean' 업데이트
```

### 2. 전체 재스캔 (관리자 수동)

Admin 페이지 → "전체 재스캔" 버튼 → 모든 파일을 yuri에 배치 전송

### 3. 자동 미스캔 감지

aims_api가 3~60초 간격으로 스캔 안 된 파일을 자동 감지하여 yuri에 요청

---

## 서비스 관리

### yuri 스캔 서비스

```bash
# 서비스 상태 확인
sudo systemctl status aims-virus-scan

# 서비스 재시작
sudo systemctl restart aims-virus-scan

# 로그 확인
sudo journalctl -u aims-virus-scan -f
```

- **서비스 경로**: `/home/gls/aims-virus-scan/`
- **Python 가상환경**: `/home/gls/aims-virus-scan/venv/`
- **설정 파일**: `/home/gls/aims-virus-scan/config.py`

### 헬스체크

```bash
# yuri 서비스 상태
curl http://100.120.196.45:8100/health

# yuri 시스템 정보 (CPU 온도, 메모리 등)
curl http://100.120.196.45:8100/system

# yuri → tars 연결 테스트 (yuri에서 실행)
curl http://100.110.215.65:3010/api/health
```

---

## 트러블슈팅

### 증상: 스캔이 전혀 안 됨 (모든 파일 pending)

```
원인 1: SSHFS 마운트 끊김 (가장 흔함)
  확인: yuri에서 ls /mnt/tars-files/users/
  해결: sudo mount /mnt/tars-files

원인 2: yuri 서비스 다운
  확인: curl http://100.120.196.45:8100/health
  해결: sudo systemctl restart aims-virus-scan

원인 3: ClamAV 데몬 다운
  확인: 헬스체크 응답의 clamd_running 필드
  해결: sudo systemctl restart clamav-daemon
```

### 증상: 스캔은 되는데 결과가 안 옴

```
원인: yuri → tars 콜백 실패
  확인: yuri에서 curl http://100.110.215.65:3010/api/health
  해결: Tailscale 연결 확인, aims_api Docker 컨테이너 상태 확인
```

### 증상: Admin 페이지 통계가 모두 0

```
원인: 파일이 모두 pending 상태 (clean이 아님)
  해결: SSHFS 마운트 복구 후 Admin에서 "전체 재스캔"
```

---

## 설정 파일 위치

| 항목 | 위치 | 서버 |
|------|------|------|
| yuri 서비스 코드 | `/home/gls/aims-virus-scan/` | yuri |
| yuri 설정 | `/home/gls/aims-virus-scan/config.py` | yuri |
| yuri systemd | `/etc/systemd/system/aims-virus-scan.service` | yuri |
| SSHFS fstab | `/etc/fstab` | yuri |
| SSH 키 | `/home/gls/.ssh/id_ed25519_tars` | yuri |
| 마운트 자동복구 | `sudo crontab -l` | yuri |
| aims_api 스캔 서비스 | `backend/api/aims_api/lib/virusScanService.js` | tars |
| aims_api 스캔 라우트 | `backend/api/aims_api/routes/virus-scan-routes.js` | tars |
| Admin 페이지 | `frontend/aims-admin/src/pages/VirusScanPage/` | 로컬 |

---

## 인증

| 통신 | 인증 방식 |
|------|----------|
| tars ↔ yuri | `X-Scan-Secret` 헤더 (공유 시크릿) |
| Admin ↔ tars | JWT 토큰 + admin 역할 |
| SSHFS | SSH 키 (`id_ed25519_tars`) |
| Tailscale | 기기 인증 (자동) |
