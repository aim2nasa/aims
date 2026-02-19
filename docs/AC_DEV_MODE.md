# AC v2 개발 모드 (DEV_MODE)

## 개요

AC v2는 출력 디렉토리를 **프로덕션**과 **개발** 모드로 분리합니다.

- **프로덕션**: 최종 결과물만 생성 (설계사가 사용하는 깔끔한 출력)
- **개발**: 디버그 파일 포함 (`dev/` 폴더에 저장)

## 자동 판별 규칙

| 실행 방식 | `AC_EXE_PATH` | 기본 모드 |
|-----------|--------------|----------|
| 패키징된 exe (인스톨러 설치) | 설정됨 | **프로덕션** |
| 소스 직접 실행 (SikuliX/Python) | 미설정 | **개발** |

> **주의**: `sys.frozen`은 SikuliX Jython에서 항상 `False`이므로 사용 불가.
> gui_main.py가 설정하는 `AC_EXE_PATH` 환경변수로 패키징 여부를 판별합니다.

## 환경변수 오버라이드 (`AC_DEV_MODE`)

어떤 실행 방식이든 환경변수로 강제 전환 가능:

| `AC_DEV_MODE` | 동작 |
|---------------|------|
| `1` | 강제 개발 모드 (프로덕션 exe에서도 dev 폴더 생성) |
| `0` | 강제 프로덕션 모드 (소스 실행에서도 dev 폴더 미생성) |
| 미설정 | `AC_EXE_PATH` 기반 자동 판별 |

## 프로덕션 exe에서 개발 모드로 전환하는 방법

### 방법 1: 명령 프롬프트

```cmd
set AC_DEV_MODE=1
AutoClicker.exe
```

### 방법 2: PowerShell

```powershell
$env:AC_DEV_MODE = "1"
.\AutoClicker.exe
```

### 방법 3: Windows 시스템 환경변수

1. 설정 > 시스템 > 고급 시스템 설정 > 환경변수
2. 사용자 변수에 `AC_DEV_MODE` = `1` 추가
3. 이후 어디서 실행하든 개발 모드

원복: `AC_DEV_MODE` 삭제 또는 `0`으로 변경

## 출력 디렉토리 구조

### 프로덕션 모드

```
output/ㅍ/
  pdf/                          # AR, CRS PDF 파일
  customer_import.xlsx          # AIMS 고객일괄등록 엑셀
  customer_import.json          # 동일 내용 JSON
  execution_report.xlsx         # 고객별 실행결과 엑셀
```

### 개발 모드

```
output/ㅍ/
  pdf/                          # AR, CRS PDF 파일
  customer_import.xlsx          # AIMS 고객일괄등록 엑셀
  customer_import.json          # 동일 내용 JSON
  execution_report.xlsx         # 고객별 실행결과 엑셀
  dev/                          # 개발 전용 (프로덕션에서는 미생성)
    run_*.log                   # 실행 로그
    debug_log.txt               # 디버그 로그
    customer_results_*.json     # 초성별 고객 결과 JSON
    checkpoint.json             # 체크포인트
    detail_*.png                # metdo_reader 스크린샷
    page_*_*.png                # OCR 페이지 캡처
    page_*_*_cropped.*          # OCR 크롭 이미지/JSON
    DIAG_*.png                  # 진단 캡처
    CRASH_*.png                 # 크래시 캡처
    diagnostic/                 # 클릭 진단 스크린샷
    screenshots/                # 단계별 스크린샷
    errors/                     # 에러 스크린샷
    logs/                       # OCR API 로그
    scroll_test/                # 스크롤 테스트 (SCROLL_TEST 모드)
```

## 코드 내 판별 로직

```python
import os

# AC_EXE_PATH: gui_main.py(패키징 exe)가 SikuliX 실행 시 설정하는 환경변수
# sys.frozen은 SikuliX Jython에서 항상 False이므로 사용 불가!
_is_packaged = bool(os.environ.get("AC_EXE_PATH", ""))
DEV_MODE = not _is_packaged
if os.environ.get("AC_DEV_MODE", "").strip() == "1":
    DEV_MODE = True
elif os.environ.get("AC_DEV_MODE", "").strip() == "0":
    DEV_MODE = False
```
