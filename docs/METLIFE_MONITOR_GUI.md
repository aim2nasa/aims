# MetLife 고객목록 자동화 GUI 모니터 구현 계획

## Context

현재 MetLife SikuliX 자동화(`MetlifeCustomerList.py`)의 진행 상황은 PowerShell 콘솔 로그로만 확인 가능하다. 이를 Python GUI로 시각화하여:
- **개발 모드**: 기존 로그 파일을 리플레이하여 MetDO 접속 없이 GUI UX 개발/테스트
- **운영 모드**: SikuliX 프로세스의 실시간 stdout을 GUI에 표시

## 로그 구조 분석

로그 파일(`run_*.log`)에서 파싱할 이벤트 유형:

```
1. [헤더]       설정 정보 (초성, 옵션, OCR 모드)
2. [1단계]      고객목록조회 진입 (1-1 ~ 1-4)
3. [2단계]      초성별 처리
   ├─ 초성 버튼 클릭
   ├─ 네비 페이지 (N1, N2, ...)
   │   ├─ 스크롤 페이지 (S1, S2, ...)
   │   │   ├─ [OCR] 캡처 + API 호출 + 인식 결과
   │   │   ├─ [OCR] 고객 테이블 (이름, 구분, 휴대폰 ...)
   │   │   ├─ [고객처리] N명 처리 시작
   │   │   │   ├─ 고객 클릭 → 통합뷰 진입
   │   │   │   ├─ 변액리포트 (PDF 저장/중복/실패)
   │   │   │   ├─ Annual Report (존재/미존재)
   │   │   │   └─ 통합뷰 종료
   │   │   └─ [COMPARE] 스크롤 비교
   │   └─ 다음 버튼 확인
   └─ Summary (총 행수, 오류, 소요시간, PDF 결과)
4. [완료]       전체 결과
```

## 기술 스택

| 항목 | 선택 |
|------|------|
| GUI | CustomTkinter |
| 패키징 | PyInstaller (.exe) |
| Python | 3.10+ |
| 데이터 소스 | 로그 파일 리플레이 / 실시간 프로세스 stdout |

## GUI 레이아웃

```
┌──────────────────────────────────────────────────────────┐
│  MetLife 고객목록 자동화 모니터              [▶ 시작] [⏸]  │
├──────────────┬───────────────────────────────────────────┤
│  진행 상황     │  고객 테이블 (OCR 결과)                     │
│              │ ┌──────────────────────────────────────┐  │
│  초성: [ㅋ]   │ │ No  고객명       구분  휴대폰     상태  │  │
│  ████████ 63%│ │  1  캐치업코리아  계약  010-4941  ✅   │  │
│  5/8명 처리   │ │  2  코디바이저    계약  010-6271  ✅   │  │
│              │ │  3  코우머스     계약  010-4026  ⏳   │  │
│  네비: 1     │ │  ...                              │  │
│  스크롤: 1/2  │ └──────────────────────────────────────┘  │
│  OCR: 3.0초  │                                          │
│              ├───────────────────────────────────────────┤
│  PDF 결과     │  실시간 로그                                │
│ ┌──────────┐ │ ┌──────────────────────────────────────┐  │
│ │저장:  2   │ │ │ [2단계] 초성 버튼 및 고객 처리          │  │
│ │중복:  1   │ │ │   === [ㅋ] 초성 처리 시작 ===          │  │
│ │실패:  0   │ │ │   [ㅋ] 버튼 클릭...                   │  │
│ │AR:   0   │ │ │   [OCR] 2/4. Upstage Enhanced API... │  │
│ └──────────┘ │ │   [3/8] 코우머스 클릭...               │  │
│              │ │   -> 고객통합뷰 진입...                  │  │
│  소요: 03:45  │ └──────────────────────────────────────┘  │
└──────────────┴───────────────────────────────────────────┘
```

**4개 패널:**
1. **좌측 상단 - 진행 상황**: 프로그레스바, 초성, 네비/스크롤 페이지, OCR 응답시간
2. **좌측 하단 - PDF 결과**: 변액리포트/AR 저장 건수 실시간 집계
3. **우측 상단 - 고객 테이블**: OCR 인식된 고객 목록 + 처리 상태 (완료/진행중/에러/스킵)
4. **우측 하단 - 실시간 로그**: 스크롤 가능한 로그 뷰 (자동 스크롤)

## 아키텍처

```
┌─────────────────────────────────────────┐
│              GUI (CustomTkinter)         │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │진행 패널  │ │고객 테이블│ │로그 뷰  │ │
│  └────┬─────┘ └────┬─────┘ └────┬────┘ │
│       └────────────┼────────────┘      │
│                    │ update()          │
│              ┌─────┴──────┐            │
│              │  AppState   │            │
│              └─────┬──────┘            │
│                    │                   │
│          ┌─────────┴─────────┐         │
│          │  LogParser         │         │
│          └─────────┬─────────┘         │
│                    │                   │
│       ┌────────────┼────────────┐      │
│  ┌────┴────┐              ┌────┴────┐  │
│  │FileReplay│              │LiveStream│  │
│  │(개발 모드)│              │(운영 모드)│  │
│  └─────────┘              └─────────┘  │
└─────────────────────────────────────────┘
```

### 핵심 모듈

| 모듈 | 파일 | 역할 |
|------|------|------|
| `log_parser.py` | 로그 파서 | 텍스트 로그 → 구조화된 이벤트 객체 |
| `data_source.py` | 데이터 소스 | FileReplay / LiveStream 인터페이스 |
| `app_state.py` | 상태 관리 | 현재 진행 상황, 고객 목록, PDF 결과 |
| `gui_main.py` | GUI 메인 | CustomTkinter 윈도우 + 패널 레이아웃 |
| `panels/` | GUI 패널 | 진행률, 고객테이블, 로그뷰, PDF결과 |

### LogParser 이벤트 유형

```python
@dataclass
class LogEvent:
    type: str          # "header", "phase", "ocr_start", "ocr_result",
                       # "customer_table", "customer_click", "customer_done",
                       # "pdf_save", "pdf_duplicate", "ar_not_found",
                       # "scroll", "compare", "summary", "complete"
    timestamp: float   # 이벤트 시점 (리플레이용)
    data: dict         # 이벤트별 데이터
```

### DataSource 인터페이스

```python
class DataSource(ABC):
    @abstractmethod
    def start(self) -> None: ...

    @abstractmethod
    def next_event(self) -> Optional[LogEvent]: ...

class FileReplaySource(DataSource):
    """기존 로그 파일 리플레이 (속도 조절 가능)"""

class LiveProcessSource(DataSource):
    """SikuliX 프로세스 stdout 실시간 읽기"""
```

## 파일 구조

```
tools/metlife_monitor/
├── main.py              # 엔트리포인트
├── log_parser.py        # 로그 → 이벤트 파싱
├── data_source.py       # FileReplay / LiveStream
├── app_state.py         # 상태 관리
├── gui_main.py          # CustomTkinter 메인 윈도우
├── panels/
│   ├── progress_panel.py   # 진행률 패널
│   ├── customer_table.py   # 고객 테이블 패널
│   ├── log_view.py         # 로그 뷰 패널
│   └── pdf_result.py       # PDF 결과 패널
└── sample_logs/            # 테스트용 로그
    ├── run_20260208_185102.log
    └── only.txt
```

## 구현 순서

### Phase 1: 로그 파서 + 상태 관리
1. `log_parser.py` - 정규식 기반 로그 파싱 → LogEvent 생성
2. `app_state.py` - 이벤트 수신 → 상태 업데이트
3. `data_source.py` - FileReplaySource 구현

### Phase 2: GUI 프레임
4. `gui_main.py` - CustomTkinter 윈도우 + 4패널 레이아웃
5. `panels/progress_panel.py` - 프로그레스바, 초성, 카운터
6. `panels/customer_table.py` - 고객 목록 테이블
7. `panels/log_view.py` - CTkTextbox 자동 스크롤 로그
8. `panels/pdf_result.py` - PDF 저장 결과 카운터

### Phase 3: 연동 + 리플레이
9. GUI ↔ AppState 바인딩 (100ms 폴링으로 UI 업데이트)
10. FileReplaySource 속도 조절 (1x, 2x, 5x, 실시간)
11. 로그 파일 열기 다이얼로그

### Phase 4 (향후): 운영 모드
12. LiveProcessSource - subprocess.Popen + stdout 읽기
13. SikuliX 프로세스 시작/정지 제어

## 검증 방법

1. `python main.py --replay D:\tmp\run_20260208_185102.log` → 로그 리플레이 확인
2. `python main.py --replay D:\tmp\only.txt` → --only 모드 로그 리플레이 확인
3. 각 패널에 데이터 정상 표시 확인 (진행률, 고객 테이블, 로그, PDF 결과)
4. 속도 조절 (1x → 5x) 정상 동작 확인

---

## 구현 진행 상황

| Phase | 상태 | 커밋 | 날짜 |
|-------|------|------|------|
| Phase 0: 계획서 작성 | ✅ 완료 | - | 2026-02-09 |
| Phase 1: 로그 파서 + 상태 관리 | ✅ 완료 | `501108ad` | 2026-02-09 |
| Phase 2: GUI 프레임 | ✅ 완료 | `20bbf3e2` | 2026-02-09 |
| Phase 3: 연동 + 리플레이 | ✅ 완료 | Phase 2에 포함 | 2026-02-09 |
| Phase 4: 운영 모드 | ⏳ 향후 | - | - |
