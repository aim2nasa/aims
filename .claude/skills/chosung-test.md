# 초성별 고객 클릭 테스트 스킬

MetLife 고객목록조회 화면에서 초성별로 모든 고객을 클릭하여 검증하는 테스트입니다.

## 트리거 키워드

- `ㄱ`, `ㄴ`, `ㄷ`, `ㄹ`, `ㅁ`, `ㅂ`, `ㅅ`, `ㅇ`, `ㅈ`, `ㅊ`, `ㅋ`, `ㅌ`, `ㅍ`, `ㅎ`, `기타` (초성만)
- `{초성} 시작해`
- `{초성} 테스트`
- `/chosung {초성}`

## 폴더 구조

```
D:\captures\metlife_ocr\
└── {초성}\                       # 초성 폴더 (예: ㄴ, ㅌ)
    ├── diagnostic\              # 클릭 위치 진단 스크린샷
    │   └── click_NNN_PN_RNN_고객명.png
    ├── logs\                    # OCR API 로그
    │   └── ocr_api_YYYYMMDD.log
    ├── page_{초성}_N_*.png      # 페이지 캡처 (원본)
    ├── page_{초성}_N_*_cropped.png   # 페이지 캡처 (크롭)
    ├── page_{초성}_N_*_cropped.json  # OCR 결과 JSON
    ├── run_YYYYMMDD_HHMMSS.log  # 실행 로그
    └── report_{초성}.md         # 테스트 결과 보고서
```

## 실행 절차

### Phase 1: SikuliX 테스트 실행

```bash
powershell.exe -Command "Set-Location 'D:\aims\tools\MetlifePDF.sikuli'; java -jar 'C:\SikuliX\sikulixide-2.0.5.jar' -r 'MetlifeCustomerList.py' -- {초성}"
```

- `run_in_background: true` 옵션 사용
- 초성 폴더는 스크립트가 자동 생성

### Phase 2: 완료 대기

- TaskOutput으로 주기적 모니터링 (30~60초 간격)
- "초성 버튼 테스트 완료!" 문자열로 완료 판단
- 또는 "[OK] 오류 없이 완료!" 확인

### Phase 3: 결과 분석

1. 로그 파일 읽기: `D:\captures\metlife_ocr\{초성}\run_*.log`
2. OCR JSON 파일 읽기: `D:\captures\metlife_ocr\{초성}\page_*.json`
3. 분석 항목:
   - 총 고객 수
   - 클릭 처리된 고객 수
   - 오류 발생 고객
   - 스크롤 중복 처리

### Phase 4: 보고서 생성

`D:\captures\metlife_ocr\{초성}\report_{초성}.md` 파일 생성

#### 보고서 형식

```markdown
# 초성 "{초성}" 테스트 결과 보고서

## 테스트 요약
| 항목 | 값 |
|------|-----|
| 초성 | {초성} |
| 실행 일시 | YYYY-MM-DD HH:mm:ss |
| 소요 시간 | N분 N초 |
| 총 고객 수 | N명 |
| 오류 발생 | N명 |

## OCR vs 클릭 처리 비교표
| 순번 | 고객명 | 휴대폰 | 클릭 Y좌표 | 처리 결과 |
|:----:|:-------|:-------|:-----------|:----------|
| 1 | 홍길동 | 010-1234-5678 | y=471 | ✅ 완료 |
| ... | ... | ... | ... | ... |

## 검증 결과
| 검증 항목 | 결과 |
|-----------|------|
| OCR 인식 수 vs 클릭 처리 수 | N / N ✅ 일치 |
| 누락된 행 | 0개 ✅ |
| 오류 발생 고객 | 0명 ✅ |

## 결론
✅ 테스트 성공 / ❌ 테스트 실패
```

## 주의사항

- SikuliX는 GUI 자동화 도구이므로 **화면이 보이는 상태**에서만 동작
- MetLife 웹사이트가 로그인된 상태여야 함
- 100% 화면 줌 기준으로 이미지 매칭
- 테스트 중 마우스/키보드 조작 금지
