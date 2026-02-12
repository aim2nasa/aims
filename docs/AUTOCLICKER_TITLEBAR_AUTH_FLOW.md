# AutoClicker 타이틀바 사용자 이름 표시 흐름

> 최종 업데이트: 2026-02-13

## 개요

AutoClicker 타이틀바에 사용자 이름이 표시되는 것은 **서버 인증이 성공했다는 증표**이다.

| 실행 방법 | 타이틀바 | 인증 |
|-----------|---------|------|
| AIMS 웹에서 실행 | `AutoClicker v0.1.43 — 곽승철` | 토큰 검증 성공 |
| 설치 폴더에서 직접 실행 | `AutoClicker v0.1.43` | 토큰 검증 없음 |

---

## Case 1: AIMS 웹에서 실행 (사용자 이름 표시)

```
[AIMS 웹] 실행 버튼 클릭
    │
    ▼
[Windows] aims-ac://start?token=1회용UUID&chosung=ㄴ
    │      레지스트리(HKCU\Software\Classes\aims-ac)에서 핸들러 찾음
    ▼
[AutoClicker.exe] "aims-ac://start?token=abc123&chosung=ㄴ" (실행 인자)
    │
    ▼
[gui_main.py:1288] sys.argv에서 "aims-ac://" 감지 → uri_handler로 분기
    │
    ▼
[uri_handler.py] parse_uri() → token 추출
    │
    ▼
[uri_handler.py:46] verify_token() → POST /api/ac/verify-token {"token": "abc123"}
    │
    ▼
[AIMS 서버] 1회용 nonce 토큰 검증
    │      성공: {"success": true, "user": {"id": "...", "name": "곽승철", "role": "..."}}
    │      실패: {"success": false, "message": "..."} → 에러 팝업 후 종료
    ▼
[uri_handler.py:157] app.title(f"{app.title()} — {user.get('name', '')}")
    │
    ▼
타이틀바: "AutoClicker v0.1.43 — 곽승철"
```

**핵심**: 사용자 이름은 실행 인자에 직접 포함되지 않는다. 실행 인자에는 1회용 nonce 토큰만 있고, 프로그램이 서버에 토큰을 보내서 사용자 정보를 받아오는 방식이다. 보안상 URI에 이름을 넣지 않고 토큰 검증을 거치도록 설계되었다.

---

## Case 2: 설치 폴더에서 직접 실행 (사용자 이름 미표시)

```
[사용자] C:\Users\{USERNAME}\AppData\Local\AIMS\AutoClicker\AutoClicker.exe 더블클릭
    │
    ▼
[gui_main.py:1288] sys.argv에 "aims-ac://" 없음 → 일반 CLI 모드
    │
    ▼
[gui_main.py:1296] argparse로 --chosung, --auto-start 등 파싱
    │              토큰 검증 과정 없음
    ▼
[gui_main.py:1304] AutoClickerApp(cli_args=cli_args)
    │              uri_handler.py 경유하지 않음 → 사용자 이름 설정 안 됨
    ▼
타이틀바: "AutoClicker v0.1.43"
```

---

## 관련 코드

| 파일 | 라인 | 역할 |
|------|------|------|
| `tools/auto_clicker_v2/gui_main.py` | 1288 | `aims-ac://` URI 감지 및 분기 |
| `tools/auto_clicker_v2/uri_handler.py` | 26 | `parse_uri()` — URI 파싱 |
| `tools/auto_clicker_v2/uri_handler.py` | 46 | `verify_token()` — 서버 토큰 검증 |
| `tools/auto_clicker_v2/uri_handler.py` | 157 | `app.title()` — 타이틀바에 사용자 이름 추가 |

## 설치 경로

```
C:\Users\{USERNAME}\AppData\Local\AIMS\AutoClicker\
```

Inno Setup 설정: `{localappdata}\AIMS\AutoClicker` (`PrivilegesRequired=lowest`, 관리자 권한 불필요)
