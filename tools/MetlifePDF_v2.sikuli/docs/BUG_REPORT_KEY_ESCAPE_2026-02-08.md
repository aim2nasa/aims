# BUG REPORT: Key.ESCAPE AttributeError (2026-02-08)

## 개요

| 항목 | 내용 |
|------|------|
| 발견일 | 2026-02-08 |
| 영향 범위 | v2 (MetlifePDF_v2.sikuli) - `verify_customer_integrated_view.py` |
| 심각도 | High - 고객통합뷰 처리 중단 |
| 상태 | **수정 완료** |
| 테스트 조건 | `--chosung ㅍ --integrated-view` (팽재남, AR 존재 고객) |

## 에러 메시지

```
type object 'Key' has no attribute 'ESCAPE'
```

## 근본 원인

SikuliX의 `Key` 클래스에서 ESC 키 속성은 **`Key.ESC`**이다.
코드에 `Key.ESCAPE`로 잘못 작성된 곳이 2곳 존재했다.

### 버그 위치

| 라인 | 함수 | 역할 |
|------|------|------|
| 1420 | `download_annual_report()` | AR PDF 뷰어 닫기 실패 시 다이얼로그 닫기 |
| 2000 | `save_report_pdf()` | 변액리포트 PDF 뷰어 닫기 실패 시 다이얼로그 닫기 |

동일 파일 내 13곳에서 `Key.ESC`를 올바르게 사용하고 있었으나, 위 2곳만 `Key.ESCAPE`로 잘못 작성된 오타.

## 재현 조건

이 버그는 **PDF 뷰어 닫기 재시도 경로(fallback)**에 있어, 특정 조건에서만 발생:

1. 고객에게 **Annual Report 또는 변액리포트가 존재**해야 함
2. PDF 저장 후 `Alt+F4`로 뷰어 닫기 시도
3. PDF 뷰어가 **"변경 내용 저장" 확인 다이얼로그**를 띄워 닫기 실패
4. 재시도 경로 진입 → `type(Key.ESCAPE)` 실행 → **크래시**

## 왜 v1에서는 발생하지 않았나?

v1(MetlifePDF.sikuli)에도 동일한 `Key.ESCAPE` 코드가 존재하지만, 이 버그가 노출되지 않았다.

### v1 vs v2 환경 차이

| | v1 (원격) | v2 (로컬) |
|---|---|---|
| 실행 환경 | Chrome Remote Desktop 경유 | 로컬 PC 직접 실행 |
| Alt+F4 전달 | CRD 클라이언트 → 원격 세션 포워딩 | 직접 로컬 윈도우 전달 |
| 수신 방식 | 원격 PDF 뷰어가 **WM_CLOSE 메시지**로 수신 | 로컬 PDF 뷰어가 **Alt+F4 키 입력** 직접 수신 |
| 결과 | 즉시 닫힘 (확인 다이얼로그 없음) | **"저장하시겠습니까?" 다이얼로그 출현** |

Chrome Remote Desktop은 Alt+F4를 키 입력 그대로 전달하지 않고, **윈도우 닫기 명령(WM_CLOSE)**으로 변환하여 원격 세션에 전달한다. 이 경우 PDF 뷰어는 확인 없이 바로 닫힌다.

반면 로컬에서는 Alt+F4가 **키보드 이벤트**로 직접 전달되어, PDF 뷰어가 "변경 내용을 저장하시겠습니까?" 확인 다이얼로그를 띄운다. 이로 인해 PDF 닫기가 실패하고, 재시도 경로가 실행되어 `Key.ESCAPE` 버그가 노출되었다.

**결론**: v1에서는 CRD의 키 전달 방식 차이로 재시도 경로 자체가 실행되지 않아 버그가 숨겨져 있었다.

## 스크린샷 증거

에러 발생 전후 스크린샷 (경로: `screenshots/`):

| 스크린샷 | 설명 |
|---------|------|
| `012_report00_step7_before_save_icon.png` | AR PDF 로딩 완료, 저장 아이콘 클릭 전 |
| `013_CLICK_report00_step7_save_icon_at_377_113.png` | 저장 아이콘 클릭 |
| `014_report00_step7_before_save_s_btn.png` | "다른 이름으로 저장" 다이얼로그 열림 |
| `015_CLICK_report00_step7_save_s_at_1262_681.png` | "저장(S)" 버튼 클릭 |
| `016_report00_step7_annual_report_saved.png` | **저장 완료** - 다이얼로그 닫힘 |
| `017_report00_step7_pdf_close_fail_1.png` | **PDF 닫기 실패** - 확인 다이얼로그 출현 (에러 직전) |

### 스크린샷 016 → 017 사이에 발생한 일

```
1. 코드: type(Key.F4, Key.ALT)  → PDF 뷰어에 Alt+F4 전송
2. PDF 뷰어: "변경 내용 저장?" 확인 다이얼로그 출현
3. 코드: PDF 뷰어 아직 열려있음 감지 (IMG_PDF_SAVE_BTN 존재)
4. 스크린샷 017 캡처
5. 코드: type(Key.ESCAPE)  → AttributeError 발생!
```

## 수정 내용

```python
# Before (버그)
type(Key.ESCAPE)

# After (수정)
type(Key.ESC)
```

- 라인 1420: `download_annual_report()` 내 PDF 뷰어 닫기 재시도
- 라인 2000: `save_report_pdf()` 내 PDF 뷰어 닫기 재시도

## 수정 후 기대 동작

```
1. Alt+F4 → "저장하시겠습니까?" 다이얼로그 출현
2. type(Key.ESC) → 다이얼로그 닫힘 (Cancel/취소)
3. 재시도: Alt+F4 → PDF 뷰어 정상 종료
```

## 테스트 로그

- 실행 로그: `D:\captures\metlife_ocr\ㅍ\run_20260208_174106.log`
- 디버그 로그: `D:\aims\tools\MetlifePDF_v2.sikuli\debug_log.txt`

## v1 수정 불필요 결론

v1(MetlifePDF.sikuli)에도 동일한 `Key.ESCAPE` 코드가 존재하지만, **v1에는 이 수정을 반영하지 않는다.**

### 근거

1. **재현 불가**: v1은 Chrome Remote Desktop 경유 환경이며, CRD는 Alt+F4를 키 입력이 아닌 WM_CLOSE 메시지로 변환하여 원격 세션에 전달한다. 따라서 PDF 뷰어가 "저장 확인" 다이얼로그를 띄우지 않고 즉시 닫힌다.
2. **재시도 경로 미도달**: 다이얼로그가 안 뜨므로 PDF 닫기가 첫 시도에 성공하고, `Key.ESCAPE`가 있는 재시도 코드에 도달하지 않는다.
3. **실질적 영향 제로**: v1에서 이 버그 코드가 실행된 사례가 없으며, CRD 환경이 유지되는 한 앞으로도 실행될 가능성이 없다.

### 결론

| 버전 | 수정 여부 | 이유 |
|------|----------|------|
| v2 (로컬) | **수정 완료** | 로컬에서 Alt+F4 → 확인 다이얼로그 → 재시도 경로 진입 → 크래시 |
| v1 (원격) | **수정 불필요** | CRD 환경에서 재시도 경로 자체가 실행되지 않음 |
