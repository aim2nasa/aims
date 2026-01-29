# 초성별 테스트 워크플로우

## 개요

초성이 주어지면 해당 초성에 대한 SikuliX 테스트를 실행하고, 결과를 초성별 폴더에 저장한 후 분석 보고서를 생성한다.

---

## 1. 테스트 실행

초성이 주어지면 아래와 같이 실행한다:

```bash
java -jar C:\SikuliX\sikulixide-2.0.5.jar -r MetlifeCustomerList.py -- ㄴ
```

---

## 2. 초성 폴더 구조

기본 경로: `D:\captures\metlife_ocr`

초성 "ㄴ"을 예시로 한 폴더 구조:

```
D:\captures\metlife_ocr\
└── ㄴ\                          # 초성 폴더
    ├── diagnostic\              # 클릭 위치 진단 스크린샷
    │   ├── click_001_P1_R00_고객명.png
    │   ├── click_002_P1_R01_고객명.png
    │   └── ...
    ├── logs\                    # OCR API 로그
    │   └── ocr_api_YYYYMMDD.log
    ├── page_ㄴ_1_*.png          # 페이지 캡처 (원본)
    ├── page_ㄴ_1_*_cropped.png  # 페이지 캡처 (크롭)
    ├── page_ㄴ_1_*_cropped.json # OCR 결과 JSON
    ├── run_YYYYMMDD_HHMMSS.log  # 실행 로그
    └── report_ㄴ.md             # 테스트 결과 보고서
```

---

## 3. 프로그램 수정 사항

### MetlifeCustomerList.py 수정

**프로그램 시작 시:**
1. 주어진 초성으로 `D:\captures\metlife_ocr\{초성}` 폴더 생성
2. `CAPTURE_DIR`을 초성 폴더로 설정
3. 모든 결과물(diagnostic, logs, 캡처, JSON, 로그)이 초성 폴더에 저장됨

```python
# 기존
CAPTURE_DIR = r"D:\captures\metlife_ocr"

# 변경 (초성이 주어진 경우)
CAPTURE_DIR = r"D:\captures\metlife_ocr\{초성}"
```

---

## 4. 테스트 완료 후 보고서 생성

실행 완료 후:
1. OCR 결과 JSON 파일 분석
2. 실행 로그 분석
3. MD 형식의 테스트 결과 보고서 생성
4. 초성 폴더에 `report_{초성}.md` 저장

### 보고서 포함 내용

| 항목 | 내용 |
|------|------|
| 테스트 요약 | 초성, 소요시간, 총 고객수, 오류수 |
| OCR vs 클릭 비교표 | 순번, 고객명, 휴대폰, 클릭 Y좌표, 처리결과 |
| 클릭 상세 로그 | 각 고객 클릭 처리 로그 |
| 검증 결과 | 누락 행, 오류 발생 고객 |

---

## 실행 예시

```bash
# Claude에게 요청
ㄴ 시작해

# Claude 수행 순서
1. D:\captures\metlife_ocr\ㄴ 폴더 생성
2. SikuliX 테스트 실행 (초성 ㄴ)
3. 테스트 완료 대기
4. 로그 + OCR 분석
5. report_ㄴ.md 생성 → D:\captures\metlife_ocr\ㄴ\에 저장
6. 결과 보고
```
