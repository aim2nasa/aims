# AIMS 바이러스 스캔 서비스

RPi5(yuri)에서 실행되는 ClamAV 기반 바이러스 검사 서비스.

## 요구사항

- Raspberry Pi 5 (또는 Linux 서버)
- ClamAV 설치
- Python 3.9+
- SSHFS로 tars:/data/files 마운트

## 설치

### 1. ClamAV 설치 (yuri)

```bash
sudo apt update
sudo apt install clamav clamav-daemon
sudo systemctl enable clamav-daemon
sudo systemctl start clamav-daemon

# 바이러스 DB 업데이트
sudo freshclam
```

### 2. SSHFS 마운트 설정

```bash
# fstab에 추가
rossi@tars.giize.com:/data/files /mnt/tars-files fuse.sshfs defaults,_netdev,allow_other,IdentityFile=/home/rossi/.ssh/id_rsa 0 0

# 또는 수동 마운트
sshfs rossi@tars.giize.com:/data/files /mnt/tars-files
```

### 3. 서비스 배포

```bash
# 로컬에서 yuri로 복사
scp -r backend/services/virus-scan-service rossi@yuri:~/aims-virus-scan/

# yuri에서 배포
ssh yuri
cd ~/aims-virus-scan
chmod +x deploy.sh scripts/*.sh
./deploy.sh
```

### 4. cron 설정

```bash
cd ~/aims-virus-scan/scripts
./setup_cron.sh
```

## API 엔드포인트

| Method | Endpoint | 용도 |
|--------|----------|------|
| GET | `/health` | 헬스체크 |
| GET | `/version` | ClamAV 버전 |
| POST | `/scan` | 단일 파일 스캔 (비동기) |
| POST | `/scan/sync` | 단일 파일 스캔 (동기) |
| POST | `/scan/batch` | 배치 스캔 |
| POST | `/scan/full` | 전체 스캔 시작 |
| GET | `/scan/progress` | 전체 스캔 진행률 |
| POST | `/scan/stop` | 전체 스캔 중지 |
| POST | `/freshclam/update` | DB 업데이트 |
| GET | `/freshclam/status` | DB 상태 |

## 환경 변수

`.env` 파일 또는 환경 변수로 설정:

```bash
VIRUS_SCAN_HOST=0.0.0.0
VIRUS_SCAN_PORT=8100
VIRUS_SCAN_AIMS_API_URL=http://tars.giize.com:3010
VIRUS_SCAN_SECRET=your-secret-key
VIRUS_SCAN_MOUNT_PATH=/mnt/tars-files
```

## 로그 확인

```bash
# 서비스 로그
sudo journalctl -u aims-virus-scan -f

# cron 로그
tail -f /var/log/aims-virus-scan/freshclam.log
tail -f /var/log/aims-virus-scan/full_scan.log
```

## 테스트

```bash
# 헬스체크
curl http://localhost:8100/health

# EICAR 테스트 파일로 감염 테스트
echo 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > /tmp/eicar.txt
curl -X POST http://localhost:8100/scan/sync \
  -H "Content-Type: application/json" \
  -H "X-Scan-Secret: your-secret-key" \
  -d '{"file_path": "/tmp/eicar.txt", "document_id": "test", "collection_name": "test"}'
```
