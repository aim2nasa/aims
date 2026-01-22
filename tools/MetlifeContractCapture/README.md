# MetLife 계약사항 캡처 도구

MetLife Digital Office의 계약사항 조회 화면을 자동으로 캡처하고 데이터를 추출하는 도구입니다.

## 기능

- **자동 화면 캡처**: 테이블 영역을 캡처하고 자동으로 스크롤하여 모든 데이터 캡처
- **스크롤 끝 감지**: 이미지 해시 비교로 자동 종료
- **데이터 추출**: Upstage OCR 또는 Claude Vision으로 테이블 데이터 추출
- **중복 제거**: 증권번호 기준 중복 데이터 자동 제거
- **출력 형식**: JSON, Excel 지원

## 설치

```powershell
# 의존성 설치
.\run.ps1 -Install
```

또는:

```bash
pip install -r requirements.txt
```

## 환경 변수

**PowerShell:**
```powershell
$env:UPSTAGE_API_KEY = "your-api-key"
$env:ANTHROPIC_API_KEY = "your-api-key"  # Claude Vision 사용 시
```

**CMD:**
```cmd
set UPSTAGE_API_KEY=your-api-key
set ANTHROPIC_API_KEY=your-api-key
```

**영구 설정 (Windows):**
1. 시스템 속성 → 환경 변수
2. 사용자 변수에 `UPSTAGE_API_KEY` 추가

## 사용법

### 전체 워크플로우 (캡처 + 추출)

```powershell
# 기본 실행 (Upstage OCR)
.\run.ps1 -Command run

# Claude Vision으로 추출
.\run.ps1 -Command run -Engine claude

# 출력 폴더 지정
.\run.ps1 -Command run -Output "D:\contracts"
```

### 1단계: 캡처만

```powershell
# 기본 캡처
.\run.ps1 -Command capture

# 캡처 영역 지정 (left,top,width,height)
.\run.ps1 -Command capture -Region "18,295,1422,285"

# 스크롤 위치 지정 (x,y)
.\run.ps1 -Command capture -ScrollPos "700,450"
```

### 2단계: 추출만

```powershell
# Upstage OCR로 추출 (기본)
.\run.ps1 -Command extract -Input "captures"

# Claude Vision으로 추출
.\run.ps1 -Command extract -Input "captures" -Engine claude
```

### 유틸리티 명령

```powershell
# 모니터 목록 확인
.\run.ps1 -Command monitors

# 마우스 위치 추적 (영역 설정용)
.\run.ps1 -Command position

# 전체 화면 테스트 캡처
.\run.ps1 -Command test-capture
```

## Python CLI 직접 사용

```bash
# 전체 워크플로우
python main.py run -o output -e upstage

# 캡처
python main.py capture -o captures -r "18,295,1422,285" -s "700,450"

# 추출
python main.py extract -i captures -o output -e upstage

# 도움말
python main.py --help
python main.py capture --help
```

## 캡처 영역 설정

1. `position` 명령으로 마우스 위치 추적:
   ```powershell
   .\run.ps1 -Command position
   ```

2. MetLife 화면에서 테이블의 좌상단과 우하단 좌표 확인

3. `--region` 옵션으로 영역 지정:
   ```
   --region "left,top,width,height"
   예: --region "18,295,1422,285"
   ```

4. 스크롤 위치는 테이블 내부 아무 곳:
   ```
   --scroll-pos "x,y"
   예: --scroll-pos "700,450"
   ```

## 출력 파일

```
output/
├── captures/           # 캡처된 이미지
│   ├── 001.png
│   ├── 002.png
│   └── ...
├── contracts_20260123_143025.json    # JSON 출력
└── contracts_20260123_143025.xlsx    # Excel 출력
```

### JSON 출력 예시

```json
{
  "meta": {
    "exported_at": "2026-01-23 14:30:25",
    "total_count": 100,
    "engine": "upstage",
    "total_premium": 5000000,
    "avg_premium": 50000
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

## 추출 엔진 비교

| 엔진 | 장점 | 단점 | 비용 |
|------|------|------|------|
| **Upstage** (기본) | 빠름, 기존 인프라 | 테이블 구조 파악 제한적 | 페이지당 ~0.5원 |
| **Claude Vision** | 테이블 구조 완벽 이해 | 상대적으로 느림 | 페이지당 ~15원 |

## 문제 해결

### "UPSTAGE_API_KEY 환경변수 필요" 오류

```powershell
$env:UPSTAGE_API_KEY = "your-api-key"
```

### 캡처 영역이 맞지 않음

1. `test-capture` 명령으로 전체 화면 캡처
2. 이미지에서 테이블 좌표 확인
3. `--region` 옵션 조정

### 스크롤이 제대로 안됨

1. `--scroll-pos` 옵션으로 테이블 내부 좌표 지정
2. `--scroll-amount` 값 조정 (기본: -3)

## 라이선스

내부 사용 전용
