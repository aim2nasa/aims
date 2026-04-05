# AC LOG_FILE None 크래시 수정

**일시**: 2026-04-05
**프로세스**: Compact Fix

## 이슈

PROD 모드에서 AutoClicker 스크립트 실행 시 TypeError 크래시 발생:
- `os.path.basename(LOG_FILE)` 호출 시 LOG_FILE이 None
- `ntpath.splitdrive(None)` → TypeError: 'NoneType' object is unsubscriptable

## 원인

- LOG_FILE은 DEV_MODE에서만 경로가 설정되고, PROD에서는 None으로 남음
- line 1773에서 모드 체크 없이 os.path.basename(LOG_FILE) 호출
- line 2592에서도 LOG_FILE을 직접 출력 (크래시는 안 나지만 "None" 출력)

## 합의된 수정 방향

LOG_FILE이 None일 때 _acdump_path (PROD 암호화 덤프 경로)를 대신 표시.
PROD에서도 log()는 .acdump에 기록되므로, 어떤 파일에 기록 중인지 안내하는 것이 적절.

## 영향 범위

- `tools/auto_clicker_v2/MetlifeCustomerList.py` line 1773, 2592 — 2곳만 수정
- 다른 버전(MetlifePDF.sikuli, MetlifePDF_v2.sikuli)은 LOG_FILE이 항상 문자열이라 영향 없음
