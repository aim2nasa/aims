# MetLife 계약사항 캡처 도구

MetLife Digital Office의 계약사항 조회 화면을 자동으로 캡처하고 데이터를 추출하는 도구입니다.

## 기능

- **자동 화면 캡처**: 테이블 영역을 캡처하고 자동으로 스크롤하여 모든 데이터 캡처
- **스크롤 끝 감지**: 이미지 해시 비교로 자동 종료
- **데이터 추출**: Naver Clova OCR (기본, 한글 최적화), Claude Vision, Upstage OCR 지원
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

### Naver Clova OCR (기본, 권장)

한글 인식 정확도가 가장 높습니다.

1. [Naver Cloud Platform](https://www.ncloud.com/) 가입
2. AI·NAVER API → Clova OCR → 도메인 생성
3. API Gateway에서 Invoke URL과 Secret Key 확인

**PowerShell:**
```powershell
$env:CLOVA_OCR_API_URL = "https://your-api-gateway-url/custom/v1/xxxxx/your-secret"
$env:CLOVA_OCR_SECRET_KEY = "your-secret-key"
```

### Claude Vision (대안)

```powershell
$env:ANTHROPIC_API_KEY = "your-api-key"
```

### Upstage OCR (대안)

```powershell
$env:UPSTAGE_API_KEY = "your-api-key"
```

**영구 설정 (Windows):**
1. 시스템 속성 → 환경 변수
2. 사용자 변수에 위 변수들 추가

## 사용법

### 전체 워크플로우 (캡처 + 추출)

```powershell
# 기본 실행 (Clova OCR - 한글 최적화)
.\run.ps1 -Command run

# Claude Vision으로 추출
.\run.ps1 -Command run -Engine claude

# Upstage OCR로 추출
.\run.ps1 -Command run -Engine upstage

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
# Clova OCR로 추출 (기본, 한글 최적화)
.\run.ps1 -Command extract -Input "captures"

# Claude Vision으로 추출
.\run.ps1 -Command extract -Input "captures" -Engine claude

# Upstage OCR로 추출
.\run.ps1 -Command extract -Input "captures" -Engine upstage
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

| 엔진 | 한글 정확도 | 장점 | 단점 | 비용 |
|------|------------|------|------|------|
| **Clova** (기본) | ⭐⭐⭐⭐⭐ | 한글 특화, 테이블 인식 | 네이버 클라우드 가입 필요 | 월 100건 무료 |
| **Claude Vision** | ⭐⭐⭐ | 테이블 구조 이해 | 한글 OCR 정확도 낮음 | 페이지당 ~15원 |
| **Upstage** | ⭐⭐ | 빠름 | 테이블 구조 파악 불가 | 페이지당 ~0.5원 |

## 문제 해결

### "CLOVA_OCR_API_URL 환경변수 필요" 오류

```powershell
$env:CLOVA_OCR_API_URL = "https://your-api-gateway-url/custom/v1/xxxxx/your-secret"
$env:CLOVA_OCR_SECRET_KEY = "your-secret-key"
```

### "UPSTAGE_API_KEY 환경변수 필요" 오류 (Upstage 엔진 사용 시)

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
