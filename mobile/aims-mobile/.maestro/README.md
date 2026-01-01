# AIMS Mobile Maestro E2E Tests

## 테스트 결과 (2026-01-01)

```
12/12 Flows Passed in 2m 37s
```

| 테스트 | 설명 | 결과 |
|--------|------|------|
| 01-login | 로그인 상태 확인 | ✅ |
| 02-chat-basic | AI 어시스턴트 기본 채팅 | ✅ |
| 03-chat-customer-query | 고객 조회 기능 | ✅ |
| 04-chat-document-search | 문서 검색 기능 | ✅ |
| 05-file-attach-menu | 파일 첨부 메뉴 UI | ✅ |
| 06-chat-contract-query | 계약 조회 기능 | ✅ |
| 07-chat-statistics | 통계 조회 기능 | ✅ |
| 08-chat-customer-register | 고객 등록 기능 | ✅ |
| 09-navigation | 탭 네비게이션 | ✅ |
| 10-help-features | 도움말 기능 카드 UI | ✅ |
| 11-logout | 설정 화면 확인 | ✅ |
| 12-voice-input | 음성 입력 화면 | ✅ |

## 설치

### macOS / Linux
```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

### Windows (Git Bash)
```bash
# Java 설정 (Android Studio 번들 Java 사용)
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
export PATH="$JAVA_HOME/bin:$PATH"

# Maestro 설치
curl -Ls "https://get.maestro.mobile.dev" | bash

# PATH 추가
export PATH="$HOME/.maestro/bin:$PATH"
```

## 테스트 실행

### 사전 준비
1. Android Emulator 실행 또는 실제 기기 연결
2. AIMS Mobile 앱 설치

```bash
# 에뮬레이터 확인
adb devices

# 앱 설치 확인
adb shell pm list packages | grep aims
```

### 환경 변수 설정 (Windows)
```bash
export PATH="$HOME/.maestro/bin:/c/Users/$USER/AppData/Local/Android/Sdk/platform-tools:$PATH"
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
export PATH="$JAVA_HOME/bin:$PATH"
```

### 전체 테스트 실행
```bash
cd mobile/aims-mobile
maestro test .maestro/
```

### 개별 테스트 실행
```bash
# 로그인 테스트
maestro test .maestro/01-login.yaml

# 기본 채팅 테스트
maestro test .maestro/02-chat-basic.yaml

# 특정 패턴만
maestro test .maestro/0*.yaml
```

### 스튜디오 모드 (디버깅)
```bash
maestro studio
```

## 테스트 목록

| 파일 | 설명 | 검증 항목 |
|------|------|----------|
| 01-login.yaml | 로그인 상태 확인 | 로그인/비로그인 상태 처리 |
| 02-chat-basic.yaml | 기본 채팅 | 메시지 전송, AI 응답 |
| 03-chat-customer-query.yaml | 고객 조회 | 예시 버튼 클릭, AI 응답 |
| 04-chat-document-search.yaml | 문서 검색 | 기능 카드 확인 |
| 05-file-attach-menu.yaml | 파일 첨부 | 메뉴 열기/닫기 |
| 06-chat-contract-query.yaml | 계약 조회 | 기능 카드 확인 |
| 07-chat-statistics.yaml | 통계 조회 | 기능 카드 확인 |
| 08-chat-customer-register.yaml | 고객 등록 | 예시 버튼 클릭, AI 응답 |
| 09-navigation.yaml | 네비게이션 | 탭 전환 (채팅↔설정) |
| 10-help-features.yaml | 도움말 기능 | 환영 화면, 기능 카드 |
| 11-logout.yaml | 설정 화면 | 설정 항목 확인 |
| 12-voice-input.yaml | 음성 입력 | 음성 탭 전환 |

## 제한사항

### Maestro 유니코드 미지원
- `inputText` 명령어는 ASCII 문자만 지원
- 한글 입력이 필요한 테스트는 환영 화면의 예시 버튼 클릭으로 대체
- 정규식 패턴 사용: `text: ".*최근 등록한 고객.*"`

### 에뮬레이터 제한
- 실제 음성 녹음 테스트 불가
- 카메라/갤러리 실제 동작 테스트 불가

## 사용 가능한 testID

| ID | 컴포넌트 | 설명 |
|----|----------|------|
| `dev-mode-toggle` | 로그인 화면 | 개발자 모드 토글 |
| `dev-login-button` | 로그인 화면 | 개발자 로그인 버튼 |
| `chat-input` | 채팅 화면 | 메시지 입력창 |
| `send-button` | 채팅 화면 | 전송 버튼 |
| `attach-button` | 채팅 화면 | 첨부 버튼 |

## 트러블슈팅

### 앱 로딩 타임아웃
```yaml
# 타임아웃 값 증가
- extendedWaitUntil:
    visible: "AI 어시스턴트"
    timeout: 30000  # 30초
```

### 요소를 찾을 수 없음
```bash
# Maestro Studio로 UI 요소 확인
maestro studio
```

### Windows에서 Java 못 찾음
```bash
# Android Studio 번들 Java 경로 확인
ls "/c/Program Files/Android/Android Studio/jbr/bin/java.exe"
```

## 커스텀 테스트 작성

```yaml
appId: com.aims.mobile
---
- launchApp

# 앱 로딩 대기
- extendedWaitUntil:
    visible: "AI 어시스턴트"
    timeout: 15000

# 버튼 클릭 (정규식 사용)
- tapOn:
    text: ".*검색.*"

# ID로 요소 찾기
- assertVisible:
    id: "chat-input"

# 조건부 실행
- runFlow:
    when:
      visible: "로그인"
    commands:
      - tapOn: "개발자 모드"
```

## 참고
- [Maestro 공식 문서](https://maestro.mobile.dev/)
- [YAML 명령어 레퍼런스](https://maestro.mobile.dev/api-reference/commands)
- [Maestro GitHub Issues](https://github.com/mobile-dev-inc/maestro/issues)
