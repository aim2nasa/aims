# MetLife SikuliX 자동화 스크립트 (v2 - 로컬 실행 버전)

> **v2**: 로컬 PC에서 MetDO를 직접 실행하는 버전입니다.
> v1(`MetlifePDF.sikuli`)은 Chrome 원격 데스크탑 경유 버전이며, 별도로 유지됩니다.

## 사전 준비

### 한글 깨짐 방지 (필수)

PowerShell 프로필에 UTF-8 설정이 영구 적용되어 있어야 합니다.

**파일 위치**: `C:\Users\rossi\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1`

```powershell
chcp 65001 | Out-Null
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
```

> 새 PowerShell 창을 열면 자동 적용됩니다.

### Java 실행 시 필수 옵션

모든 Java 명령에 `"-Dfile.encoding=UTF-8"` 추가 (따옴표 필수):

```powershell
java "-Dfile.encoding=UTF-8" -jar 'C:\SikuliX\sikulixide-2.0.5.jar' -r ...
```

> PowerShell에서 `-D`가 PS 파라미터로 해석되므로 **반드시 따옴표**로 감싸야 합니다.

---

## 스크립트 목록

| 스크립트 | 설명 |
|----------|------|
| `MetlifeCustomerList.py` | 고객목록조회 - OCR 연동 PDF 자동 다운로드 |
| `verify_customer_integrated_view.py` | 고객통합뷰 진입/종료 검증 |

---

## 실행 방법

### 1. 고객목록조회 (MetlifeCustomerList.py)

**직접 실행:**

```powershell
cd D:\aims\tools\MetlifePDF_v2.sikuli

# 특정 초성 + 고객통합뷰
java "-Dfile.encoding=UTF-8" -jar 'C:\SikuliX\sikulixide-2.0.5.jar' -r 'MetlifeCustomerList.py' -- --chosung ㄴ --integrated-view

# 특정 초성만
java "-Dfile.encoding=UTF-8" -jar 'C:\SikuliX\sikulixide-2.0.5.jar' -r 'MetlifeCustomerList.py' -- --chosung ㄱ

# 전체 초성
java "-Dfile.encoding=UTF-8" -jar 'C:\SikuliX\sikulixide-2.0.5.jar' -r 'MetlifeCustomerList.py'
```

**래퍼 스크립트:**

```powershell
cd D:\aims\tools\MetlifePDF_v2.sikuli\scripts

# 기본 (전체 초성)
.\run_customerlist.ps1

# 특정 초성 + 종료일
.\run_customerlist.ps1 -Chosung ㄴ -EndDate 2025-01-31

# 도움말
.\run_customerlist.ps1 -Help
```

**옵션:**

| 옵션 | 설명 | 예시 |
|------|------|------|
| `--chosung` | 처리할 초성 | `--chosung ㄴ` |
| `--integrated-view` | 고객통합뷰 검증 포함 | `--integrated-view` |
| `--start-from` | 특정 고객부터 시작 | `--start-from 홍길동` |
| `--only` | 특정 고객만 처리 | `--only 홍길동` |

---

### 2. 고객통합뷰 검증 (verify_customer_integrated_view.py)

**직접 실행:**

```powershell
cd D:\aims\tools\MetlifePDF_v2.sikuli

java "-Dfile.encoding=UTF-8" -jar 'C:\SikuliX\sikulixide-2.0.5.jar' -r 'verify_customer_integrated_view.py'
```

**BAT 실행:**

```cmd
D:\aims\tools\MetlifePDF_v2.sikuli\run_verify_integrated_view.bat verify_customer_integrated_view.py
```

---

### 3. PDF 다운로드 (run.ps1)

```powershell
cd D:\aims\tools\MetlifePDF_v2.sikuli\scripts

# 기본 (오늘 날짜)
.\run.ps1

# 특정 종료일
.\run.ps1 -EndDate 2025-01-31

# 도움말
.\run.ps1 -Help
```

---

## 결과 확인

| 항목 | 경로 |
|------|------|
| 실행 로그 | `D:\aims\tools\MetlifePDF_v2.sikuli\debug_log.txt` |
| 스크린샷 | `D:\aims\tools\MetlifePDF_v2.sikuli\screenshots\` |
| OCR 캡처 | `D:\captures\metlife_ocr\{초성}\` |
| PDF 저장 | `D:\metpdf\` |

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| 한글이 `?????`로 표시 | Java 인코딩 미설정 | `"-Dfile.encoding=UTF-8"` 추가 |
| `ClassNotFoundException: /encoding=UTF-8` | PS에서 따옴표 누락 | `"-Dfile.encoding=UTF-8"` 따옴표 감싸기 |
| 한글이 부분적으로 깨짐 | PS 콘솔 인코딩 미설정 | PS 프로필에 UTF-8 설정 추가 |
| 이미지 찾기 실패 (ABORT) | 화면 해상도/줌 변경 | 100% 줌에서 이미지 재캡처 |
