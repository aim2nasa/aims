# ClamAV 바이러스 스캔 시스템

> **상태**: ✅ 구현 완료
> **작성일**: 2025.12.13
> **최종 업데이트**: 2025.12.30
> **목적**: tars 서버 부하 문제 해결을 위한 ClamAV 전용 서버 분리

---

## 1. 시스템 개요

### 1.1 아키텍처

```
┌─────────────────────────────────────────────────────────────────────┐
│                        aims-admin (5178)                            │
│              /system/virus-scan - 관리자 UI                          │
└─────────────────────────────┬───────────────────────────────────────┘
                              │ API 호출 / SSE 실시간 알림
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    tars.giize.com (100.110.215.65)                  │
│  ┌─────────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   aims_api      │  │   MongoDB   │  │  /data/files            │  │
│  │   (3010)        │  │   (27017)   │  │  파일 저장소             │  │
│  │                 │  │             │  │                         │  │
│  │ /api/admin/     │  │ files       │  │ /data/files/users/...   │  │
│  │ virus-scan/*    │  │ virus_scan_ │  │                         │  │
│  │                 │  │ logs        │  │                         │  │
│  └────────┬────────┘  └──────▲──────┘  └───────────┬─────────────┘  │
│           │ 스캔 요청         │ 결과 저장            │ SSHFS Export  │
└───────────┼─────────────────┼───────────────────────┼───────────────┘
            │                 │                       │
            │ POST /scan      │ POST /result          │ 읽기 전용
            ▼                 │                       ▼
┌───────────────────────────────────────────────────────────────────────┐
│                      yuri (100.120.196.45)                           │
│  ┌─────────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │
│  │  scan-service   │  │   clamd     │  │  /mnt/tars-files        │   │
│  │  FastAPI (8100) │──┤   (3310)    │  │  (SSHFS Mount)          │   │
│  │                 │  │             │  │                         │   │
│  │ /scan           │  │ ClamAV      │  │ tars:/data/files        │   │
│  │ /scan/full      │  │ 1.0.9       │  │                         │   │
│  │ /health         │  │ 3.62M sigs  │  │                         │   │
│  └─────────────────┘  └─────────────┘  └─────────────────────────┘   │
│                                                                       │
│  - Raspberry Pi 5, 8GB RAM                                           │
│  - ClamAV 전용 서버 (tars 부하 분리)                                   │
└───────────────────────────────────────────────────────────────────────┘
```

### 1.2 서버 정보

| 서버 | IP (Tailscale) | 역할 | 주요 포트 |
|------|----------------|------|----------|
| tars | 100.110.215.65 | 메인 서버 (API, DB, 파일 저장) | 3010 (API) |
| yuri | 100.120.196.45 | ClamAV 스캔 전용 서버 | 8100 (scan-service), 3310 (clamd) |

---

## 2. 구현 컴포넌트

### 2.1 yuri - FastAPI 스캔 서비스

**위치**: `backend/services/virus-scan-service/`

| 파일 | 설명 |
|------|------|
| `main.py` | FastAPI 앱, API 엔드포인트 정의 |
| `scanner.py` | ClamAV 래퍼 (clamdscan/clamscan) |
| `config.py` | 설정 (pydantic-settings) |
| `deploy.sh` | systemd 서비스 배포 스크립트 |
| `requirements.txt` | Python 의존성 |
| `scripts/freshclam_update.sh` | DB 업데이트 cron 스크립트 |
| `scripts/full_scan.sh` | 전체 스캔 cron 스크립트 |

**API 엔드포인트**:

| Method | Endpoint | 용도 |
|--------|----------|------|
| GET | `/health` | 헬스체크 (clamd 상태 포함) |
| POST | `/scan` | 단일 파일 스캔 요청 |
| POST | `/scan/full` | 전체 파일 스캔 시작 |
| GET | `/scan/progress` | 전체 스캔 진행률 조회 |
| POST | `/freshclam/update` | ClamAV DB 수동 업데이트 |

### 2.2 tars - aims_api 라우트

**위치**: `backend/api/aims_api/routes/virus-scan-routes.js`

**API 엔드포인트** (`/api/admin/virus-scan/*`):

| Method | Endpoint | 용도 |
|--------|----------|------|
| GET | `/status` | yuri 서비스 상태 조회 |
| GET | `/stats` | 스캔 통계 (컬렉션별) |
| GET | `/settings` | 스캔 설정 조회 |
| PUT | `/settings` | 스캔 설정 수정 |
| GET | `/logs` | 스캔 로그 목록 (페이지네이션) |
| GET | `/infected` | 감염/삭제 파일 목록 |
| POST | `/scan-file/:collection/:id` | 단일 파일 수동 스캔 |
| POST | `/scan-all` | 전체 스캔 시작 |
| POST | `/result` | yuri→tars 스캔 결과 수신 |
| GET | `/stream` | SSE 실시간 알림 스트림 |

### 2.3 aims-admin - 관리자 UI

**위치**: `frontend/aims-admin/src/pages/VirusScanPage/`

| 파일 | 설명 |
|------|------|
| `VirusScanPage.tsx` | 메인 페이지 컴포넌트 |
| `VirusScanPage.css` | 스타일시트 |
| `index.ts` | export |

**관련 파일**:
- `frontend/aims-admin/src/features/virus-scan/api.ts` - API 클라이언트
- `frontend/aims-admin/src/shared/hooks/useVirusScanSSE.ts` - SSE 훅

**라우트**: `/system/virus-scan`

**UI 구성**:
```
┌──────────────────────────────────────────────────────────────────────┐
│ 바이러스 검사                                  [전체 스캔] [설정]     │
│ 서비스 상태: ● 정상 (ClamAV 1.0.9)                                   │
├──────────────────────────────────────────────────────────────────────┤
│  [스캔됨: 1,234] [감염: 2] [삭제됨: 5] [대기: 10] [오늘 스캔: 50]     │
├──────────────────────────────────────────────────────────────────────┤
│  [탭: 감염 파일 | 스캔 로그 | 설정]                                   │
├──────────────────────────────────────────────────────────────────────┤
│  감염/삭제 파일 목록 테이블 (페이지네이션)                            │
├──────────────────────────────────────────────────────────────────────┤
│  실시간 이벤트 (SSE 연결)                                            │
│  - 12:30:45 scan-complete: document.pdf → clean                     │
│  - 12:30:40 virus-detected: malware.exe → Trojan.GenericKD          │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. 데이터 스키마

### 3.1 MongoDB 스키마 확장

**files, personal_files, inquiries 컬렉션**:

```javascript
{
  // 기존 필드...
  virusScan: {
    status: "pending" | "scanning" | "clean" | "infected" | "deleted" | "error",
    scannedAt: ISODate,
    requestedAt: ISODate,
    clamVersion: String,
    threatName: String,      // infected인 경우
    deletedAt: ISODate,      // deleted인 경우
    deletedReason: String,   // 삭제 사유
    scanType: "upload" | "manual" | "scheduled"
  }
}
```

### 3.2 신규 컬렉션

**virus_scan_logs**:
```javascript
{
  _id: ObjectId,
  documentId: String,
  collectionName: String,
  filePath: String,
  fileName: String,
  status: String,
  threatName: String,
  clamVersion: String,
  scanType: String,
  scannedAt: ISODate,
  createdAt: ISODate
}
```

**virus_scan_settings**:
```javascript
{
  _id: "default",
  scheduledScanEnabled: Boolean,
  scheduledScanTime: String,      // "04:00"
  autoDeleteInfected: Boolean,
  notifyOnDetection: Boolean,
  updatedAt: ISODate
}
```

---

## 4. 동작 흐름

### 4.1 파일 업로드 시 자동 스캔

```
1. 사용자 → tars: 파일 업로드
2. tars (aims_api): 파일 저장, MongoDB 레코드 생성
3. tars (virusScanService): yuri에 스캔 요청 (POST /scan)
   - virusScan.status = 'pending'
   - virusScan.requestedAt = new Date()
4. yuri (scan-service): 스캔 큐에 추가
5. yuri: clamdscan 실행
6. yuri → tars: 결과 전송 (POST /api/admin/virus-scan/result)
7. tars: MongoDB 업데이트
   - clean: virusScan.status = 'clean'
   - infected: 파일 삭제 → virusScan.status = 'deleted'
8. tars: SSE 브로드캐스트 (실시간 알림)
```

### 4.2 감염 파일 처리

감염 파일 발견 시:
1. 파일 즉시 삭제 (`fs.unlink`)
2. DB 상태 업데이트 (`virusScan.status = 'deleted'`)
3. 삭제 시간/사유 기록
4. SSE로 `virus-detected` 이벤트 브로드캐스트
5. virus_scan_logs에 기록

### 4.3 yuri 다운 시 (Graceful Degradation)

```
1. 사용자 → tars: 파일 업로드
2. tars: 파일 저장, 문서 레코드 생성 (virusScan.status: 'pending')
3. tars → yuri: 스캔 요청 실패 (로그만 기록, 에러 무시)
4. 서비스 정상 운영 (스캔 없이)
5. yuri 복구 후: 전체 스캔으로 pending 파일 처리
```

---

## 5. 정기 작업 (Cron)

### 5.1 yuri cron 설정

```bash
# /etc/cron.d/aims-virus-scan

# ClamAV DB 업데이트 (매일 새벽 3시)
0 3 * * * rossi /home/rossi/aims-virus-scan/scripts/freshclam_update.sh

# 전체 파일 스캔 (매일 새벽 4시)
0 4 * * * rossi /home/rossi/aims-virus-scan/scripts/full_scan.sh
```

### 5.2 스크립트

**freshclam_update.sh**:
```bash
#!/bin/bash
sudo freshclam
curl -X POST http://localhost:8100/freshclam/update
```

**full_scan.sh**:
```bash
#!/bin/bash
curl -X POST http://localhost:8100/scan/full \
  -H "Content-Type: application/json" \
  -d '{"scan_type": "scheduled"}'
```

---

## 6. 환경 변수

### 6.1 tars (aims_api)

```bash
# .env
VIRUS_SCAN_SERVICE_URL=http://100.120.196.45:8100
VIRUS_SCAN_SECRET=aims-virus-scan-secret-key
VIRUS_SCAN_ENABLED=true
```

### 6.2 yuri (scan-service)

```bash
# .env
SCAN_SECRET=aims-virus-scan-secret-key
TARS_API_URL=http://100.110.215.65:3010
SCAN_BASE_PATH=/mnt/tars-files
CLAMD_SOCKET=/run/clamav/clamd.ctl
```

---

## 7. SSE 이벤트

| 이벤트 | 데이터 | 용도 |
|--------|--------|------|
| `virus-scan-init` | `{ stats }` | 초기 통계 데이터 |
| `virus-scan-complete` | `{ documentId, status, collectionName }` | 스캔 완료 |
| `virus-detected` | `{ documentId, threatName, fileName, owner }` | 바이러스 감지 알림 |
| `virus-file-deleted` | `{ documentId, reason }` | 파일 삭제됨 |
| `virus-scan-progress` | `{ total, scanned, infected }` | 전체 스캔 진행률 |

---

## 8. 보안

| 항목 | 대책 |
|------|------|
| SSHFS 접근 | yuri만 마운트, 읽기 전용 |
| API 인증 | `X-Scan-Secret` 헤더 검증 |
| 네트워크 | Tailscale VPN 내부 통신 |
| 감염 파일 | 즉시 삭제, 복구 불가 |

---

## 9. 배포

### 9.1 yuri 서비스 배포

```bash
# yuri에서 실행
cd /home/rossi/aims-virus-scan
./deploy.sh
```

### 9.2 aims_api 배포

```bash
# tars에서 실행
cd /home/rossi/aims/backend/api/aims_api
./deploy_aims_api.sh
```

### 9.3 aims-admin 배포

전체 배포 스크립트 사용:
```bash
ssh tars 'cd ~/aims && ./deploy_all.sh'
```

---

## 10. 모니터링

### 10.1 yuri 상태 확인

```bash
# systemd 서비스 상태
systemctl status aims-scan-service

# clamd 상태
systemctl status clamav-daemon

# API 헬스체크
curl http://100.120.196.45:8100/health

# 로그 확인
journalctl -u aims-scan-service -f
```

### 10.2 aims-admin에서 확인

- `/system/virus-scan` 페이지 접속
- 서비스 상태, 통계, 실시간 이벤트 확인

---

## 11. 트러블슈팅

### 11.1 yuri 서비스 응답 없음

```bash
# 1. 서비스 재시작
sudo systemctl restart aims-scan-service

# 2. clamd 재시작
sudo systemctl restart clamav-daemon

# 3. SSHFS 마운트 확인
mount | grep tars-files
```

### 11.2 스캔 결과 미수신

```bash
# tars에서 yuri 연결 확인
curl http://100.120.196.45:8100/health

# aims_api 로그 확인
pm2 logs aims-api
```

### 11.3 pending 파일 누적

전체 스캔 실행:
```bash
curl -X POST http://100.120.196.45:8100/scan/full \
  -H "Content-Type: application/json" \
  -d '{"scan_type": "manual"}'
```

---

## 12. 테스트

### 12.1 EICAR 테스트

```bash
# EICAR 테스트 파일 생성
echo 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > /tmp/eicar.txt

# 업로드 후 감지 확인
# aims-admin에서 virus-detected 이벤트 수신 확인
```

### 12.2 API 테스트

```bash
# 서비스 상태
curl http://tars.giize.com:3010/api/admin/virus-scan/status

# 통계
curl http://tars.giize.com:3010/api/admin/virus-scan/stats
```

---

## 구현 이력

| 날짜 | 커밋 | 내용 |
|------|------|------|
| 2025.12.30 | #1 | yuri FastAPI 스캔 서비스 구현 |
| 2025.12.30 | #2 | aims_api 바이러스 스캔 라우트 구현 |
| 2025.12.30 | #3 | aims-admin 바이러스 검사 페이지 구현 |
| 2025.12.30 | #4 | 실시간 스캔 연동 (파일 업로드 시 자동 스캔) |
| 2025.12.30 | #5 | 문서화 및 cron 설정 |
