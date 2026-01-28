# SikuliX 테스트 스킬

이 스킬은 SikuliX GUI 자동화 테스트 사이클을 실행합니다.

## 트리거 키워드
- "/sikuli"
- "sikuli 테스트"
- "sikulix 실행"

## 핵심 원칙

**디버그 로그와 스크린샷은 필수!**

| 항목 | 경로 | 용도 |
|------|------|------|
| 디버그 로그 | `debug_log.txt` | 전체 실행 흐름, 오류 메시지 |
| 스크린샷 | `screenshots/*.png` | 각 단계별 화면 상태 |
| 오류 스크린샷 | `errors/*.png` | 오류 발생 시점 화면 |

**스크린샷 네이밍 규칙:**
- `NNN_reportXX_단계명.png` (예: `012_report01_before_save_btn.png`)
- 오류: `*_ERROR_*.png`, `*_timeout_error.png`

**분석 시 확인 순서:**
1. `debug_log.txt`에서 `[ERROR]` 검색
2. 해당 보고서 번호의 스크린샷 확인 (예: `*_04_*.png`)
3. 오류 직전 스크린샷으로 화면 상태 파악

## 실행 절차

### Phase 1: 준비
```bash
# 스크린샷 폴더 비우기
cmd.exe /c "rd /s /q D:\aims\tools\MetlifePDF.sikuli\screenshots && mkdir D:\aims\tools\MetlifePDF.sikuli\screenshots"
```

### Phase 2: 실행
```bash
# PowerShell 백그라운드로 SikuliX 실행
powershell.exe -Command "Set-Location 'D:\aims\tools\MetlifePDF.sikuli'; java -jar 'C:\SikuliX\sikulixide-2.0.5.jar' -r 'verify_customer_integrated_view.py'"
```
- `run_in_background: true` 옵션 사용
- TaskOutput으로 상태 모니터링

### Phase 3: 완료 대기
- TaskOutput block=false로 주기적 확인
- 또는 debug_log.txt 파일 모니터링
- "=== 실행 종료 ===" 문자열로 완료 판단

### Phase 4: 결과 분석
1. `debug_log.txt` 읽기
2. "PDF 저장 결과 리포트" 섹션 파싱
3. 오류 발생 시 해당 스크린샷 확인
   - 경로: `D:\aims\tools\MetlifePDF.sikuli\screenshots/`
   - 오류 패턴: `*_ERROR_*.png`, `*_timeout_error.png`

### Phase 5: 수정 후 반복 (필요시)
- 오류 원인 분석
- 코드 수정
- Phase 1부터 다시 실행

## 결과 보고 형식

```
**SikuliX 테스트 결과:**
| No | 상태 | 비고 |
|----|------|------|
| 1 | 저장완료/중복스킵/실패 | ... |

총계: 저장완료=N, 중복스킵=N, 실패=N / 전체=N
```

## 주의사항

- SikuliX는 GUI 자동화 도구이므로 **화면이 보이는 상태**에서만 동작
- 백그라운드 실행 시 PowerShell 사용 필수 (cmd.exe 불가)
- 실행 전 반드시 스크린샷 폴더 비우기
- 오류 발생 시 스크린샷으로 화면 상태 확인 가능
