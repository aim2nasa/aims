# MetDO Customer Reader

MetDO(MetLife Digital Office) 고객정보 페이지 스크린샷을 Upstage OCR API로 파싱하여 고객 정보를 추출하는 도구.

## 파일 구조

```
tools/metdo_reader/
    read_customer.py     # 핵심 파싱 엔진 (CLI)
    gui.py               # GUI 애플리케이션 (CustomTkinter)
```

## read_customer.py - 핵심 파싱 엔진

### OCR API
- **Upstage Document Digitization API** (`document-parse-nightly`, enhanced 모드)
- 재시도: 3회 (5/10/20초 지수 백오프)
- 타임아웃: 180초
- 인증: `UPSTAGE_API_KEY` 환경변수

### 파싱 전략
라벨 앵커링 방식 - "고객명", "주민번호" 등 키워드를 찾고, 다음 키워드까지의 텍스트를 값으로 추출.

### 고객 유형 감지
- "법인명" 또는 "사업자번호" 포함 → **법인**
- 그 외 → **개인**

### 추출 필드

| 필드 | 개인 | 법인 |
|------|------|------|
| 고객명 | "고객명" 라벨 뒤 | "법인명" 라벨 뒤 |
| 생년월일 | 주민번호 앞6자리 → YYYY.MM.DD | - |
| 성별 | 주민번호 7번째 자리 or "성별" 필드 | - |
| 사업자번호 | - | "사업자번호" 라벨 뒤 |
| 휴대전화 | "휴대전화" 뒤 | "휴대전화" 뒤 |
| 자택전화 | "자택전화" 뒤 | - |
| 직장전화 | "직장전화" 뒤 | "직장전화" 뒤 |
| 이메일 | "이메일" 뒤 (@ 누락 복원 포함) | 동일 |
| 자택주소 | "자택주소" 뒤 | - |
| 직장주소 | "직장주소" 뒤 | - |
| 사업장주소 | - | "사업장소재지" 뒤 |
| 본점주소 | - | "본점소재지" 뒤 |

### OCR 보정 처리
- 전화번호 정규화: `010 4786 6654` → `010-4786-6654`
- 이메일 @ 누락 복원: `bkkang523 naver.com` → `bkkang523@naver.com`
- `▼`/`▽` (드롭다운 아이콘) 제거
- 주소 섹션 내 폼 라벨 혼입 제거

### CLI 사용법

```bash
# 기본 (pretty-print)
python tools/metdo_reader/read_customer.py "D:\tmp\sample\개인-강보경.png"

# JSON 출력
python tools/metdo_reader/read_customer.py "D:\tmp\sample\법인-캐치업코리아.png" --json

# 디버그 (OCR 원본 응답 저장)
python tools/metdo_reader/read_customer.py "D:\tmp\sample\개인-강보경.png" --debug
```

## gui.py - GUI 애플리케이션

### 기술 스택
- **CustomTkinter** (AutoClicker v2와 동일한 GUI 프레임워크)
- 600x700 윈도우, 맑은 고딕 폰트

### 기능
- 파일 선택 (탐색기 대화상자)
- 드래그 앤 드롭 지원 (tkinterdnd2)
- 백그라운드 스레드에서 OCR + 파싱
- 결과 텍스트 표시
- JSON 복사 / 텍스트 복사 버튼

### 실행

```bash
python tools/metdo_reader/gui.py
```

## 필수 환경변수

```bash
set UPSTAGE_API_KEY=up_xxxxxxxxxxxxx
```
