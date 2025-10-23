# SemanTree - AIMS Document Viewer

AIMS MongoDB 문서 뷰어 및 시맨틱 트리 분석 도구

## 기능

### v0.1.0 - 초기 버전
- MongoDB `docupload.files` 컬렉션 연결
- 전체 문서 목록 조회
- 문서 네비게이션 (이전/다음/번호 입력)
- 문서 내용 JSON 포맷 표시
- 다크 테마 텍스트 에디터

## 설치

```bash
# 가상환경 생성 (선택사항)
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 의존성 설치
pip install -r requirements.txt
```

## 실행

```bash
# 간단하게 실행 (SSH 터널 자동 연결)
py semantree.py
```

**참고**: SSH 터널이 자동으로 시작됩니다. tars.giize.com SSH 접속 권한이 필요합니다.

## 사용법

1. **연결**: 자동으로 `tars.giize.com:27017`의 `docupload` DB에 연결
2. **네비게이션**:
   - `◀ 이전` / `다음 ▶` 버튼으로 문서 이동
   - 문서 번호 입력 후 `Enter` 또는 `이동` 버튼
3. **새로고침**: 상단 `새로고침` 버튼으로 문서 목록 갱신

## 구조

```
SemanTree/
├── semantree.py        # 메인 애플리케이션
├── requirements.txt    # Python 의존성
└── README.md          # 이 파일
```

## 향후 계획

- [ ] 시맨틱 트리 시각화
- [ ] 문서 검색 기능
- [ ] 필드별 필터링
- [ ] JSON 하이라이팅
- [ ] 문서 비교 기능
- [ ] Export/Import 기능

## 기술 스택

- **GUI**: tkinter (Python 표준 라이브러리)
- **DB**: pymongo (MongoDB 드라이버)
- **언어**: Python 3.8+
