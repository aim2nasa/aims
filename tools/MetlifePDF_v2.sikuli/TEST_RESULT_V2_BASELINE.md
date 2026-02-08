# v2 Baseline 테스트 결과 (2026-02-08)

## 테스트 목적

v1(MetlifePDF.sikuli)에서 v2(MetlifePDF_v2.sikuli)로 복사 후, 두 버전이 동일하게 동작하는지 검증.

## 테스트 명령

```powershell
java "-Dfile.encoding=UTF-8" -jar 'C:\SikuliX\sikulixide-2.0.5.jar' -r 'MetlifeCustomerList.py' -- --chosung ㅋ --integrated-view
```

## 결과 비교

| 항목 | v1 (MetlifePDF.sikuli) | v2 (MetlifePDF_v2.sikuli) |
|------|----------------------|--------------------------|
| 실행 경로 | `D:\aims\tools\MetlifePDF.sikuli` | `D:\aims\tools\MetlifePDF_v2.sikuli` |
| 초성 | ㅋ | ㅋ |
| 옵션 | `--integrated-view` | `--integrated-view` |
| OCR 인식 | 8명 | 8명 |
| 고객 처리 | 8명 (에러 0) | 8명 (에러 0) |
| 변액리포트 존재 | 2명 (캐치앤코리아, 키움) | 2명 (캐치앤코리아, 키움) |
| 변액리포트 미존재 | 6명 (코웨이×5, 코데바이스코리아) | 6명 (코웨이×5, 코데바이스코리아) |
| PDF 저장 | 2건 성공, 0 실패 | 2건 성공, 0 실패 |
| Annual Report | 0건 존재, 8건 미존재 | 0건 존재, 8건 미존재 |
| 소요 시간 | 10분 40초 | 10분 22초 |
| 최종 결과 | **SUCCESS** (에러 없이 완료) | **SUCCESS** (에러 없이 완료) |
| 로그 파일 | `run_20260208_170232.log` | `run_20260208_171348.log` |

## 결론

v1과 v2가 완전히 동일한 결과를 생성함을 확인. v2 baseline 검증 완료.

## Git Tag

`v2-baseline` (commit: 938ab087)
