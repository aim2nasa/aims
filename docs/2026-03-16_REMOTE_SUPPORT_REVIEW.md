# 원격 지원 솔루션 검토

> 작성일: 2026-03-16
> 상태: 검토 완료 (미구현)
> 목적: AIMS 사용 설계사에게 원격 지원 제공

---

## 배경

AIMS를 사용하는 설계사가 원격 지원이 필요한 경우, 관리자가 설계사 PC에 원격 접속하여 도움을 주기 위한 솔루션 검토.

### 요구사항

- 설계사는 복잡한 설치 없이 최대한 간단히 접속 허용
- 오픈소스 사용, 라이선스 문제 없을 것
- AIMS와 연동하여 사용 중 바로 원격 지원 요청 가능
- 자체 화면 공유 프로그램 개발 불필요

---

## 솔루션 비교

### 검토 대상

| 솔루션 | 라이선스 | 방식 |
|--------|----------|------|
| **RustDesk** | AGPLv3 (서버) / GPLv3 (클라이언트) | 양쪽 클라이언트 + 자체 Relay 서버 |
| **MeshCentral** | Apache 2.0 | 웹 관리 + 에이전트 설치 |
| **Apache Guacamole** | Apache 2.0 | 웹 게이트웨이 (RDP/VNC 필요) |

### 상세 비교

| 기준 | RustDesk | MeshCentral | Guacamole |
|------|----------|-------------|-----------|
| 설계사 난이도 | ★★★★★ (exe 실행만) | ★★★★ (에이전트 설치) | ★★ (RDP 활성화 필요) |
| 관리자 편의 | ★★★★ (클라이언트 필요) | ★★★★★ (브라우저만) | ★★★★★ (브라우저만) |
| NAT/방화벽 통과 | 자체 Relay로 해결 | 에이전트가 해결 | 설계사 측 설정 필요 |
| 라이선스 자유도 | GPL 계열 | 완전 자유 | 완전 자유 |
| 서버 구축 난이도 | Docker 5분 | Docker 가능 | RDP/VNC 연동 설정 추가 |
| 파일 전송 | 지원 | 지원 | 지원 |

### 탈락 사유

- **Apache Guacamole**: 설계사 PC에 RDP 활성화 + 방화벽 포트 개방 + IP 확인 필요. Windows Home은 RDP 미지원. 비전문가 대상 원격 지원에 부적합.
- **MeshCentral**: 적합하나 에이전트 설치 과정이 RustDesk보다 한 단계 더 필요.

---

## 채택: RustDesk

### 라이선스 검토 결과

**AIMS 코드 공개 의무 없음.**

GPL/AGPL copyleft는 "파생 저작물(derivative work)"을 배포할 때만 발동한다.

| 구성요소 | 하는 일 | 파생 저작물 여부 |
|----------|---------|:---:|
| RustDesk Server (Docker) | tars 서버에서 독립 프로세스로 실행 | **아님** |
| RustDesk Client (exe) | 설계사 PC에서 독립 실행 | **아님** |
| AIMS 프론트엔드 | 다운로드 링크 + 안내 문구 표시 | **아님** |

근거:
- GNU GPL FAQ: "Mere aggregation of two programs on the same disk or server does not count as derivative work"
- AGPL 네트워크 조항: AGPL 소프트웨어 자체를 수정했을 때 그 수정본의 소스 공개 의무. AIMS 코드와 무관
- AIMS와 RustDesk 간 코드 결합(링킹, import) 없음

유일한 의무: RustDesk exe를 AIMS 서버에서 호스팅(재배포)하므로, RustDesk 소스코드 접근 경로 안내 필요.

```
본 프로그램은 RustDesk (GPLv3)입니다.
소스코드: https://github.com/rustdesk/rustdesk
```

---

## 연결 구조

```
설계사 PC                    tars.giize.com                    관리자 PC
(RustDesk portable 실행)     (RustDesk Relay 서버)             (RustDesk 설치)

  ① 실행 → 서버에 등록        ┌──────────────┐
     (ID 발급) ──────────►   │  hbbs        │  ◄────────────── ④ ID 입력하여
                             │  (중개 서버)   │                   접속 요청
                             │              │
  ② ID + 비밀번호            │  ID ↔ IP     │
     관리자에게 전달 (전화)    │  매핑 관리    │
                             └──────┬───────┘
                                    │
  ③ P2P 연결 시도 ◄────────────────►│◄─────────────────────► P2P 연결 시도
     (직접 통신 가능하면       ┌──────┴───────┐
      서버 안 거침)           │  hbbr        │
                             │  (중계 서버)   │
  ⑤ P2P 불가 시              │              │
     화면 데이터 ──────────► │  암호화 중계   │ ──────────────► 화면 표시
                             └──────────────┘
```

### 역할

| 구성요소 | 역할 |
|----------|------|
| **hbbs** (중개 서버) | 설계사 PC와 관리자 PC가 서로를 찾게 해줌 (ID → IP 매핑) |
| **P2P** | 양쪽이 직접 연결 가능하면 tars를 거치지 않고 직접 통신 (가장 빠름) |
| **hbbr** (중계 서버) | 공유기/방화벽 때문에 P2P 불가 시 tars가 데이터를 대신 전달 |

### 특징

- 설계사 PC가 공유기 뒤에 있어도 네트워크 설정 불필요 (outbound 연결 방식)
- 모든 통신 E2E 암호화 (hbbr 중계 시에도 내용 열람 불가)
- tars 서버는 연결 중개/중계만 수행 (화면 데이터 저장 안 함)

---

## 설계사 사용 흐름 (처음 사용)

### 사전 조건

- tars 서버에 RustDesk Relay 서버 구동 중
- 관리자 PC에 RustDesk 설치 완료
- AIMS 서버에 RustDesk portable exe 호스팅 완료

### 설계사 측

1. **AIMS에서 원격 지원 요청**: 화면의 "원격 지원" 버튼 클릭 → 안내 모달 표시
2. **RustDesk 다운로드 + 실행**: 모달의 "다운로드" 클릭 → exe 다운로드 (~15MB) → 더블클릭 실행 (설치 없음)
   - Windows SmartScreen 경고 시: "추가 정보" → "실행" 클릭
3. **ID/비밀번호 확인**: RustDesk 창에 자동 표시됨 (예: `123 456 789` / `a1b2c3`)
4. **관리자에게 전달**: 전화 또는 카톡으로 ID 9자리 + 비밀번호 전달
5. **접속 승인**: 관리자가 접속 시도하면 확인 팝업 → "허용" 클릭
6. **종료**: RustDesk 창 닫으면 즉시 연결 종료. PC에 아무것도 남지 않음 (portable)

### 관리자 측

- 설계사가 알려준 ID 입력 → 비밀번호 입력 → 접속

### 2회차부터

- exe 보관해뒀다면 바로 실행 (다운로드 생략)
- 삭제했다면 AIMS에서 다시 다운로드

---

## 구현 계획 (미착수)

| 단계 | 작업 | 예상 소요 |
|------|------|-----------|
| 1 | tars 서버에 RustDesk Relay Docker 구성 | 30분 |
| 2 | RustDesk portable exe에 자체 서버 주소 사전 설정 후 AIMS 서버에 호스팅 | 30분 |
| 3 | 관리자 PC에 RustDesk 설치 + 자체 서버 연결 | 10분 |
| 4 | AIMS 프론트엔드에 "원격 지원" 버튼 + 안내 모달 추가 | 1시간 |

### Docker Compose (참고)

```yaml
# docker-compose.rustdesk.yml
services:
  hbbs:
    image: rustdesk/rustdesk-server:latest
    command: hbbs
    ports:
      - 21115:21115
      - 21116:21116
      - 21116:21116/udp
      - 21118:21118
    volumes:
      - ./rustdesk-data:/root
    restart: always

  hbbr:
    image: rustdesk/rustdesk-server:latest
    command: hbbr
    ports:
      - 21117:21117
      - 21119:21119
    volumes:
      - ./rustdesk-data:/root
    restart: always
```
