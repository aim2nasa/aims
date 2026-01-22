# MetLife 계약사항 조회 자동 캡처 및 데이터 추출 도구

## 개요

MetLife Digital Office의 계약사항 조회 화면에서 테이블 데이터를 자동으로 캡처하고, OCR/AI를 통해 데이터를 추출하는 도구입니다.

**경로**: `tools/MetlifeContractCapture/`

## 배경

### 문제점
- MetLife Digital Office의 계약사항 조회 결과를 수동으로 복사하기 어려움
- 대량의 계약 데이터를 엑셀로 옮기는 작업이 반복적이고 시간 소요
- 페이지네이션된 테이블을 한 번에 복사 불가

### 해결책
- 자동 화면 캡처 + 스크롤 + OCR/AI 추출으로 자동화
- pyautogui + mss + Upstage OCR / Claude Vision 조합
- JSON/Excel 형식으로 결과 출력

## 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                     MetlifeContractCapture                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│  │   capture/  │    │   extract/  │    │   output/   │        │
│  │             │    │             │    │             │        │
│  │ - capturer  │ -> │ - upstage   │ -> │ - json      │        │
│  │ - scroller  │    │ - claude    │    │ - excel     │        │
│  │ - detector  │    │ - parser    │    │             │        │
│  └─────────────┘    └─────────────┘    └─────────────┘        │
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐                            │
│  │   models/   │    │   main.py   │  <- CLI 엔트리포인트       │
│  │             │    │             │                            │
│  │ - contract  │    │ - capture   │                            │
│  │             │    │ - extract   │                            │
│  └─────────────┘    │ - run       │                            │
│                     └─────────────┘                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 디렉토리 구조

```
tools/MetlifeContractCapture/
├── README.md                    # 사용법 문서
├── requirements.txt             # 의존성 목록
├── run.ps1                      # Windows 실행 스크립트
├── config.yaml                  # 설정 파일
├── main.py                      # CLI 엔트리포인트
│
├── capture/                     # 1단계: 화면 캡처 모듈
│   ├── __init__.py
│   ├── screen_capturer.py       # mss 기반 화면 캡처
│   ├── scroll_controller.py     # pyautogui 스크롤 제어
│   └── duplicate_detector.py    # imagehash 중복 감지
│
├── extract/                     # 2단계: 데이터 추출 모듈
│   ├── __init__.py
│   ├── upstage_ocr.py           # Upstage OCR (기본)
│   ├── claude_vision.py         # Claude Vision API (옵션)
│   └── table_parser.py          # 데이터 정규화
│
├── output/                      # 출력 모듈
│   ├── __init__.py
│   ├── json_exporter.py         # JSON 내보내기
│   └── excel_exporter.py        # Excel 내보내기
│
└── models/                      # 데이터 모델
    ├── __init__.py
    └── contract.py              # 계약 데이터 모델
```

## 설치

```powershell
cd d:\aims\tools\MetlifeContractCapture
.\run.ps1 -Install
```

## 환경 변수

| 변수 | 설명 | 용도 |
|------|------|------|
| `UPSTAGE_API_KEY` | Upstage API 키 | 기본 OCR 엔진 |
| `ANTHROPIC_API_KEY` | Anthropic API 키 | Claude Vision 사용 시 |

**PowerShell:**
```powershell
$env:UPSTAGE_API_KEY = "your-api-key"
```

**CMD:**
```cmd
set UPSTAGE_API_KEY=your-api-key
```

## 워크플로우

### 1단계: 화면 캡처

```
1. 초기 대기 (사용자가 MetLife 화면 준비)
2. 맨 위로 스크롤
3. 테이블 영역 캡처 (mss)
4. 이전 캡처와 해시 비교 (imagehash)
5. 동일하면 → 스크롤 끝, 종료
6. 다르면 → 파일 저장, 스크롤 다운
7. 3-6 반복
```

### 2단계: 데이터 추출

```
1. 캡처 이미지 목록 로드
2. 각 이미지에 OCR/AI 적용
3. 테이블 행 데이터 추출
4. 데이터 정규화 (날짜, 숫자 형식)
5. 증권번호 기준 중복 제거
6. JSON/Excel 출력
```

## 사용법

### 전체 실행

```powershell
# 기본 (Upstage OCR)
.\run.ps1 -Command run

# Claude Vision 사용
.\run.ps1 -Command run -Engine claude

# 사용자 정의 영역
.\run.ps1 -Command run -Region "18,295,1422,285" -ScrollPos "700,450"
```

### 캡처만

```powershell
.\run.ps1 -Command capture -Output "my_captures"
```

### 추출만

```powershell
.\run.ps1 -Command extract -Input "my_captures" -Engine upstage
```

### 유틸리티

```powershell
# 모니터 목록
.\run.ps1 -Command monitors

# 마우스 위치 추적 (Ctrl+C로 종료)
.\run.ps1 -Command position

# 전체 화면 테스트 캡처
.\run.ps1 -Command test-capture
```

## 캡처 영역 설정 가이드

### 1. 마우스 위치 확인

```powershell
.\run.ps1 -Command position
```

MetLife 화면에서 테이블의 좌상단과 우하단으로 마우스 이동하며 좌표 확인

### 2. 좌표 계산

```
left   = 테이블 좌측 X 좌표
top    = 테이블 헤더 아래 첫 행 Y 좌표
width  = 테이블 우측 X - left
height = 11행의 높이 (약 285px)
```

### 3. 적용

```powershell
.\run.ps1 -Command run -Region "left,top,width,height"
```

## 추출 엔진 비교

| 특성 | Upstage OCR | Claude Vision |
|------|-------------|---------------|
| **정확도** | 중 | 높음 |
| **속도** | 빠름 | 보통 |
| **테이블 구조** | 텍스트만 추출 | 구조 완벽 이해 |
| **비용** | 페이지당 ~0.5원 | 페이지당 ~15원 |
| **추천 상황** | 정형화된 테이블 | 복잡한 레이아웃 |

### 언제 Claude Vision을 사용해야 할까?

- Upstage OCR 결과가 부정확할 때
- 테이블 구조가 복잡할 때
- 높은 정확도가 필요할 때

## 출력 형식

### JSON

```json
{
  "meta": {
    "exported_at": "2026-01-23 14:30:25",
    "total_count": 100,
    "engine": "upstage",
    "total_premium": 5000000,
    "avg_premium": 50000,
    "by_status": {"정상": 95, "해지": 5}
  },
  "contracts": [
    {
      "순번": 1,
      "계약일": "2005-09-04",
      "계약자": "박술기",
      "생년월일": "720214",
      "성별": "여",
      "지역": "서울 마포구",
      "피보험자": "박술기",
      "증권번호": "0003074200",
      "보험상품": "유) 하이라이프 종신보험",
      "통화": "KRW",
      "월납입보험료": 74340,
      "상태": "정상",
      "수금방법": "직납",
      "납입상태": "납입완료",
      "전자청약": "N",
      "모집이양": "모집",
      "신탁": "N"
    }
  ]
}
```

### Excel

- **계약사항** 시트: 전체 계약 목록
- **통계** 시트: 요약 정보

## 데이터 모델

### ContractRow

| 필드 | 타입 | 설명 |
|------|------|------|
| 순번 | int | 행 번호 |
| 계약일 | str | YYYY-MM-DD |
| 계약자 | str | 계약자 이름 |
| 생년월일 | str | YYMMDD |
| 성별 | str | "남" / "여" |
| 지역 | str | 예: "서울 마포구" |
| 피보험자 | str | 피보험자 이름 |
| 증권번호 | str | 10자리 숫자 |
| 보험상품 | str | 상품명 |
| 통화 | str | "KRW" 등 |
| 월납입보험료 | int | 원 단위 |
| 상태 | str | "정상", "해지" 등 |
| 수금방법 | str | "직납", "자동이체" 등 |
| 납입상태 | str | "납입완료", "납입중" 등 |
| 전자청약 | str | "N" / "Y" |
| 모집이양 | str | "모집", "이양" |
| 신탁 | str | "N" / "Y" |

## 문제 해결

### 캡처가 검은 화면

- 모니터 인덱스 확인: `.\run.ps1 -Command monitors`
- `--monitor` 옵션으로 올바른 모니터 지정

### 스크롤이 안됨

- `--scroll-pos` 옵션으로 테이블 내부 좌표 지정
- 스크롤 위치가 테이블 영역 안에 있어야 함

### OCR 결과가 부정확

- Claude Vision 엔진 시도: `-Engine claude`
- 캡처 영역 조정 (여백 최소화)

### API 키 오류

```powershell
# PowerShell 환경 변수 설정
$env:UPSTAGE_API_KEY = "your-key"
$env:ANTHROPIC_API_KEY = "your-key"
```

## 개발 이력

### v1.0.0 (2026-01-23)

- 초기 버전
- mss + pyautogui 기반 자동 캡처
- Upstage OCR / Claude Vision 이중 엔진
- JSON / Excel 출력 지원

## 관련 문서

- [ScreenCapture 도구](../tools/ScreenCapture/README.md) - 기존 화면 캡처 도구
- [MetlifePDF 도구](../tools/MetlifePDF.sikuli/) - SikuliX 기반 PDF 자동화
- [OCR 비용 비교](./OCR_AI_COST_COMPARISON.md) - OCR/AI 비용 분석

## 기술 스택

| 라이브러리 | 버전 | 용도 |
|-----------|------|------|
| mss | >=9.0.0 | 화면 캡처 |
| pyautogui | >=0.9.54 | 마우스/스크롤 제어 |
| imagehash | >=4.3.0 | 중복 감지 |
| anthropic | >=0.45.0 | Claude Vision |
| httpx | >=0.27.0 | Upstage API |
| pandas | >=2.0.0 | 데이터 처리 |
| openpyxl | >=3.1.0 | Excel 출력 |
| click | >=8.1.0 | CLI |
| rich | >=13.0.0 | 터미널 UI |
