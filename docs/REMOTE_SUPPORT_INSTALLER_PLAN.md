# 원격 지원 설치형 전환 계획

> 작성일: 2026-03-18
> 상태: Phase 1~3 구현 완료, 테스트 필요

## 배경

SFX(자동 압축 해제) 방식의 문제:
- Windows SmartScreen / 호환성 관리자 경고 반복
- 매번 23MB 다운로드
- 설정 파일 별도 관리 필요

## 목표

AutoClicker와 동일한 방식으로 RustDesk를 설치형으로 전환:
1. **최초 1회 설치** — 인스톨러로 RustDesk + 설정 + URI Scheme 등록
2. **이후 사용** — 헤드셋 클릭 → URI Scheme으로 RustDesk 즉시 실행 (다운로드 없음)
3. **설치 시 relay 서버 자동 설정** — 별도 설정 불필요

## 구현 계획

### Phase 1: Inno Setup 인스톨러 제작

**인스톨러 포함 내용:**
- RustDesk 공식 exe (rustdesk-1.4.6-x86_64.exe)
- RustDesk2.toml (relay 서버 설정)
- Custom URI Scheme 등록 (`aims-rs://`)

**설치 경로:** `%LOCALAPPDATA%\AIMS\RustDesk\`

**URI Scheme:** `aims-rs://start`
- 레지스트리: `HKCU\Software\Classes\aims-rs\shell\open\command`
- → `%LOCALAPPDATA%\AIMS\RustDesk\rustdesk.exe "%1"`

**인스톨러 스크립트:** `tools/rustdesk_installer/installer.iss`

### Phase 2: 백엔드 API

AutoClicker ac-routes.js 패턴 참조:

| 엔드포인트 | 메서드 | 역할 |
|-----------|--------|------|
| `GET /api/rustdesk/download-installer` | GET | 인스톨러 다운로드 |
| `GET /api/rustdesk/latest-version` | GET | 최신 버전 정보 |
| `POST /api/rustdesk/support-request` | POST | 포트 열기 (기존) |
| `GET /api/rustdesk/status` | GET | 포트 상태 (기존) |
| `POST /api/rustdesk/close` | POST | 포트 닫기 (기존) |

### Phase 3: 프론트엔드 SupportMenu 수정

**최초 사용 (미설치):**
1. 헤드셋 클릭 → 인스톨러 다운로드 + 설치 안내 모달
2. 설치 완료 후 `localStorage.setItem('aims-rustdesk-installed', 'true')`

**이후 사용 (설치됨):**
1. 헤드셋 클릭
2. API로 포트 열기 (`POST /api/rustdesk/support-request`)
3. URI Scheme으로 RustDesk 실행 (`window.location.href = 'aims-rs://start'`)
4. 안내 모달: "프로그램에 표시된 ID를 관리자에게 알려주세요"

### Phase 4: 포트 제어

기존 구현 유지 (rustdesk_port.sh + rustdesk-service):
- 헤드셋 클릭 → API로 포트 열기
- RustDesk 종료 → 5초 이내 포트 자동 닫기
- 10분 대기 타임아웃, 30분 최대 개방

## AutoClicker와의 차이

| 항목 | AutoClicker | RustDesk |
|------|-------------|----------|
| URI Scheme | `aims-ac://` | `aims-rs://` |
| 설치 경로 | `%LOCALAPPDATA%\AIMS\AutoClicker` | `%LOCALAPPDATA%\AIMS\RustDesk` |
| 빌드 도구 | PyInstaller + Inno Setup | Inno Setup만 (공식 exe 래핑) |
| 토큰 인증 | 필요 (API 호출) | 불필요 (단순 실행) |
| 자동 업데이트 | 있음 | 없음 (버전 고정) |
| 포트 제어 | 없음 | 있음 (UFW) |

## 파일 구조

```
tools/rustdesk_installer/
├── installer.iss          ← Inno Setup 스크립트
├── RustDesk2.toml         ← relay 서버 설정
├── launcher.bat           ← 설정 복사 + RustDesk 실행
└── assets/
    └── rustdesk.ico       ← 아이콘
```
