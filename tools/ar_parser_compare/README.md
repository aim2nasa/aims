# AR 파서 비교 GUI 도구

3가지 AR 파서(OpenAI, pdfplumber, Upstage)를 시각적으로 비교 테스트하는 GUI 도구입니다.

## 실행 방법

### Windows
```bash
run_gui.bat
```

### 수동 실행
```bash
cd backend/api/annual_report_api
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate      # Windows

cd tools/ar_parser_compare
python compare_gui.py
```

## 기능

- **파일 선택**: PDF 파일 선택
- **개별 실행**: 각 파서를 개별적으로 실행
- **전체 실행**: 3가지 파서를 순차적으로 실행
- **결과 비교**: 총 월보험료, 계약 건수, 증권번호 자동 비교

## 파서 비교

| 파서 | 속도 | 비용 | 특징 |
|------|------|------|------|
| openai | 74초 | 유료 | 기본값, 안정적 |
| pdfplumber | 0.93초 | 무료 | 80배 빠름, 로컬 실행 |
| upstage | 5.89초 | 유료 | 한국어 최적화 |

## 필요 환경 변수

`.env` 파일에 다음 설정 필요:

```
OPENAI_API_KEY=sk-...
UPSTAGE_API_KEY=up_...
```
