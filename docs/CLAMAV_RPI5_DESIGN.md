# ClamAV 분리 서버 설계 (Raspberry Pi 5)

> **상태**: 계획 단계
> **작성일**: 2025.12.13
> **목적**: tars 서버 부하 문제 해결을 위한 ClamAV 전용 서버 분리

---

## 1. 배경

### 1.1 현재 문제

| 항목 | tars 현황 | 문제점 |
|------|-----------|--------|
| RAM | 7.7GB (가용 274MB) | ClamAV 1.3GB 점유로 OOM 발생 |
| Swap | 0B | 메모리 초과 시 즉시 크래시 |
| CPU | i5-2400 (2011년) | 구형, 스캔 시 부하 과중 |
| 결과 | 시스템 다운 반복 | 서비스 불안정 |

### 1.2 해결 방향

ClamAV를 별도 하드웨어(RPi5)로 분리하여:
- tars 서버 안정성 확보
- 바이러스 검사 기능 유지
- Graceful Degradation (RPi5 다운 시 검사만 스킵)

---

## 2. 시스템 구성

### 2.1 하드웨어

| 서버 | 역할 | 사양 |
|------|------|------|
| tars | 메인 서버 (API, DB, 파일 저장) | i5-2400, 7.7GB RAM |
| rpi5 | ClamAV 전용 스캔 서버 | Raspberry Pi 5, 8GB RAM |

### 2.2 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                         사용자                               │
└─────────────────────────┬───────────────────────────────────┘
                          │ 파일 업로드
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    tars.giize.com                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  AIMS API   │  │   MongoDB   │  │  /uploads (NFS)     │  │
│  │  (3010)     │  │   (27017)   │  │  파일 저장소         │  │
│  └─────────────┘  └──────▲──────┘  └──────────┬──────────┘  │
│                          │                     │ NFS Export │
└──────────────────────────┼─────────────────────┼────────────┘
                           │                     │
                           │ 스캔 결과 저장       │ 파일 읽기
                           │                     │
┌──────────────────────────┼─────────────────────┼────────────┐
│                        rpi5                    │            │
│  ┌─────────────┐  ┌──────┴──────┐  ┌──────────▼──────────┐  │
│  │   clamd     │  │ Scan Agent  │  │  /mnt/tars-uploads  │  │
│  │  (3310)     │◄─┤ (스캔 데몬)  │──┤  (NFS Mount)        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                                                              │
│  - ClamAV 전용 서버                                          │
│  - 다운되어도 tars 서비스에 영향 없음                          │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. 동작 흐름

### 3.1 정상 동작

```
1. 사용자 → tars: 파일 업로드
2. tars: 파일 저장 (/uploads/userId/filename)
3. tars: 문서 레코드 생성 (scanStatus: 'pending')
4. rpi5 Scan Agent: 새 파일 감지 (inotify 또는 polling)
5. rpi5: clamdscan 실행
6. rpi5 → tars API: 스캔 결과 전송
7. tars: MongoDB 업데이트 (scanStatus, scanTime, clamVersion)
```

### 3.2 RPi5 다운 시 (Graceful Degradation)

```
1. 사용자 → tars: 파일 업로드
2. tars: 파일 저장, 문서 레코드 생성 (scanStatus: 'pending')
3. 스캔 없이 서비스 정상 운영
4. RPi5 복구 후 pending 파일들 일괄 스캔
```

---

## 4. 상세 설계

### 4.1 tars 측 설정

#### NFS Export 설정

```bash
# /etc/exports
/home/rossi/aims/uploads    rpi5.local(ro,sync,no_subtree_check)
```

- **읽기 전용(ro)**: RPi5는 파일 읽기만 가능
- 보안: 특정 IP만 허용

#### 스캔 결과 수신 API

```javascript
// POST /api/scan/result
{
  "filePath": "/uploads/userId/filename.pdf",
  "status": "clean" | "infected",
  "threatName": null | "Virus.Name",
  "scannedAt": "2025-12-13T10:30:00Z",
  "clamVersion": "ClamAV 1.4.3/27848",
  "scanDurationMs": 1234
}
```

#### MongoDB 스키마 확장

```javascript
// documents 컬렉션
{
  // 기존 필드...
  virusScan: {
    status: "pending" | "clean" | "infected" | "error",
    scannedAt: ISODate,
    clamVersion: String,
    threatName: String,      // infected인 경우
    scanDurationMs: Number
  }
}
```

### 4.2 RPi5 측 설정

#### ClamAV 설치

```bash
sudo apt update
sudo apt install clamav clamav-daemon

# 데이터베이스 업데이트
sudo freshclam

# 데몬 시작
sudo systemctl enable clamav-daemon
sudo systemctl start clamav-daemon
```

#### clamd.conf 최적화

```conf
# /etc/clamav/clamd.conf
MaxThreads 2
MaxScanSize 100M
MaxFileSize 50M
MaxRecursion 16
MaxFiles 10000

# RPi5는 전용 서버이므로 여유 있게 설정 가능
```

#### NFS 마운트

```bash
# /etc/fstab
tars.giize.com:/home/rossi/aims/uploads  /mnt/tars-uploads  nfs  ro,soft,timeo=10  0  0
```

- **soft**: 서버 응답 없으면 에러 반환 (hang 방지)
- **timeo=10**: 타임아웃 1초

#### Scan Agent (Python 예시)

```python
#!/usr/bin/env python3
"""
ClamAV Scan Agent for RPi5
새 파일 감지 → 스캔 → 결과 전송
"""

import os
import time
import subprocess
import requests
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

WATCH_DIR = "/mnt/tars-uploads"
TARS_API = "http://tars.giize.com:3010/api/scan/result"

class ScanHandler(FileSystemEventHandler):
    def on_created(self, event):
        if event.is_directory:
            return
        self.scan_file(event.src_path)

    def scan_file(self, file_path):
        start = time.time()

        # clamdscan 실행
        result = subprocess.run(
            ["clamdscan", "--no-summary", file_path],
            capture_output=True,
            text=True
        )

        duration_ms = int((time.time() - start) * 1000)

        # 결과 파싱
        if result.returncode == 0:
            status = "clean"
            threat = None
        elif result.returncode == 1:
            status = "infected"
            threat = self.parse_threat(result.stdout)
        else:
            status = "error"
            threat = None

        # ClamAV 버전
        version = subprocess.getoutput("clamdscan --version")

        # tars API로 결과 전송
        self.send_result(file_path, status, threat, version, duration_ms)

    def send_result(self, file_path, status, threat, version, duration_ms):
        try:
            requests.post(TARS_API, json={
                "filePath": file_path.replace("/mnt/tars-uploads", ""),
                "status": status,
                "threatName": threat,
                "clamVersion": version,
                "scanDurationMs": duration_ms
            }, timeout=5)
        except Exception as e:
            print(f"Failed to send result: {e}")

if __name__ == "__main__":
    observer = Observer()
    observer.schedule(ScanHandler(), WATCH_DIR, recursive=True)
    observer.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()
```

---

## 5. 보안 고려사항

| 항목 | 대책 |
|------|------|
| NFS 접근 | RPi5 IP만 허용, 읽기 전용 |
| API 인증 | 스캔 결과 API에 시크릿 키 적용 |
| 네트워크 | 같은 로컬 네트워크 내 통신 |
| 감염 파일 | tars에서 삭제/격리 처리 |

---

## 6. 모니터링

### 6.1 RPi5 상태 확인

```bash
# clamd 상태
systemctl status clamav-daemon

# 메모리 사용량
free -h

# 스캔 로그
tail -f /var/log/clamav/clamav.log
```

### 6.2 tars에서 RPi5 헬스체크

```javascript
// 주기적으로 RPi5 상태 확인
// GET http://rpi5:3310/health (별도 헬스체크 엔드포인트 구현)
// 실패 시 Admin UI에 경고 표시
```

---

## 7. 구현 작업 목록

### Phase 1: 인프라 설정

- [ ] RPi5 OS 설치 (Raspberry Pi OS 64-bit)
- [ ] RPi5 네트워크 설정 (고정 IP)
- [ ] tars NFS 서버 설정
- [ ] RPi5 NFS 클라이언트 마운트

### Phase 2: ClamAV 설정

- [ ] RPi5 ClamAV 설치
- [ ] clamd.conf 최적화
- [ ] freshclam 자동 업데이트 설정
- [ ] 스캔 테스트

### Phase 3: Scan Agent 개발

- [ ] Python Scan Agent 개발
- [ ] systemd 서비스 등록
- [ ] 에러 핸들링 및 로깅
- [ ] pending 파일 일괄 스캔 기능

### Phase 4: tars API 연동

- [ ] 스캔 결과 수신 API 개발
- [ ] MongoDB 스키마 확장
- [ ] 파일 업로드 시 scanStatus: pending 설정

### Phase 5: Admin UI

- [ ] RPi5 상태 표시
- [ ] 스캔 통계 대시보드
- [ ] 감염 파일 관리 기능

---

## 8. 롤백 계획

RPi5 구성 실패 시:
1. NFS export 제거
2. 현재 상태 유지 (ClamAV 비활성화)
3. 파일 업로드는 바이러스 검사 없이 진행

---

## 9. 참고

- [ClamAV Documentation](https://docs.clamav.net/)
- [Raspberry Pi NFS Setup](https://www.raspberrypi.com/documentation/)
- 현재 ClamAV 비활성화 커밋: `8063179b`
