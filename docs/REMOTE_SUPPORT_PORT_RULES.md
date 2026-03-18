# 원격 지원 포트 제어 규칙

## 포트 목록

| 포트 | 프로토콜 | 용도 |
|------|----------|------|
| 21115 | TCP | NAT type test |
| 21116 | TCP/UDP | hbbs (ID 서버) |
| 21117 | TCP | hbbr (릴레이 서버) |
| 21118 | TCP | hbbs WebSocket |
| 21119 | TCP | hbbr WebSocket |

## 포트 제어 규칙

### 1. 포트 열기
- **트리거**: 설계사가 AIMS에서 원격지원 버튼 클릭
- **동작**: UFW에서 TCP 21115~21119 + UDP 21116 즉시 ALLOW
- **API**: `POST /api/rustdesk/support-request`

### 2. 연결 대기
- 포트 열린 후 **최대 10분** 동안 연결 대기
- 5초마다 릴레이 포트(21117) 및 시그널링 포트(21116)의 ESTABLISHED 연결 확인
- 10분 안에 연결 없으면 → **포트 자동 닫기**

### 3. 세션 감시
- 연결 감지 후 세션 감시 모드 전환
- 5초마다 연결 상태 확인
- RustDesk 종료(연결 끊김) 감지 → **즉시(5초 이내) 포트 닫기**

### 4. 최대 개방 시간
- 포트 열린 시점부터 **최대 30분**
- 30분 초과 시 연결 유무 관계없이 **강제 닫기**

### 5. 수동 닫기
- **API**: `POST /api/rustdesk/close`
- 비상 시 즉시 포트 차단 + 감시 프로세스 종료

## 상태 값

| 상태 | 의미 |
|------|------|
| `open` | 포트 열림, 연결 대기 중 |
| `connected` | 연결 감지, 세션 진행 중 |
| `disconnected` | 연결 종료, 포트 닫힘 |
| `timeout` | 10분 대기 초과, 포트 닫힘 |
| `max_time` | 30분 최대 시간 초과, 포트 닫힘 |
| `closed` | 수동 닫기 완료 |

## 스크립트 위치

- 포트 제어: `/home/rossi/aims/scripts/rustdesk_port.sh`
- 감시 프로세스: `/tmp/rustdesk_port_monitor.sh` (start 시 자동 생성)
- 상태 파일: `/tmp/rustdesk_port_status`
- 로그: `/tmp/rustdesk_port.log`
- PID: `/tmp/rustdesk_port_monitor.pid`

## 보안

- UFW 포트는 **평소 닫혀있음** — 원격지원 요청 시에만 열림
- 공유기 포트포워딩은 상시 설정 (UFW가 차단하므로 이중 방어)
- sudo NOPASSWD 설정: `rossi ALL=(ALL) NOPASSWD: /usr/sbin/ufw`
