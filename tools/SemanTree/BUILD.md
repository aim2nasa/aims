# SemanTree EXE 빌드 가이드

SemanTree를 Windows 실행 파일(.exe)로 빌드하는 방법을 설명합니다.

## 사전 요구사항

### 1. Python 환경
- Python 3.8 이상
- 필요한 패키지 설치:
  ```bash
  pip install pymongo bson tkinter
  ```

### 2. PyInstaller 설치
```bash
pip install pyinstaller
```

## 빌드 방법

### 기본 빌드 명령

```bash
pyinstaller --onefile --windowed --name "SemanTree" ^
  --hidden-import tkinter ^
  --hidden-import pymongo ^
  --hidden-import bson ^
  semantree.py
```

### 아이콘 추가 (선택사항)

아이콘 파일(`icon.ico`)이 있는 경우:

```bash
pyinstaller --onefile --windowed --name "SemanTree" ^
  --hidden-import tkinter ^
  --hidden-import pymongo ^
  --hidden-import bson ^
  --icon=icon.ico ^
  semantree.py
```

## 빌드 옵션 설명

| 옵션 | 설명 |
|------|------|
| `--onefile` | 단일 EXE 파일로 생성 (배포 편리) |
| `--windowed` | 콘솔 창 없이 GUI만 표시 |
| `--name "SemanTree"` | 생성될 EXE 파일명 지정 |
| `--hidden-import tkinter` | tkinter 모듈 포함 (GUI) |
| `--hidden-import pymongo` | pymongo 모듈 포함 (MongoDB 연결) |
| `--hidden-import bson` | bson 모듈 포함 (ObjectId 처리) |
| `--icon=icon.ico` | 실행 파일 아이콘 지정 (선택) |

## 빌드 결과

빌드가 완료되면 다음 디렉토리가 생성됩니다:

```
tools/SemanTree/
├── semantree.py          # 원본 소스
├── BUILD.md              # 이 문서
├── build/                # 빌드 임시 파일 (삭제 가능)
├── dist/                 # 최종 실행 파일
│   └── SemanTree.exe     # 배포용 EXE 파일
└── SemanTree.spec        # PyInstaller 설정 파일 (재빌드용)
```

### 배포 파일
- **`dist/SemanTree.exe`**: 최종 배포용 실행 파일
- 이 파일만 다른 컴퓨터로 복사해서 실행 가능

## 실행 요구사항

### SemanTree.exe 실행에 필요한 것:

1. **SSH 접속 가능**
   - `tars.giize.com` 서버에 SSH 접속 가능해야 함
   - SSH 키 인증 설정 필요 (비밀번호 입력 없이 접속)
   - OpenSSH 클라이언트 필요 (Windows 10/11 기본 포함)

2. **네트워크 연결**
   - 인터넷 연결 필요 (SSH 터널용)

3. **MongoDB 서버**
   - `tars.giize.com:27017`에 MongoDB 서버 실행 중이어야 함

## SSH 키 인증 설정

SemanTree는 SSH 터널을 통해 MongoDB에 연결하므로, SSH 키 인증이 설정되어 있어야 합니다.

### Windows에서 SSH 키 설정:

```bash
# 1. SSH 키 생성 (없는 경우)
ssh-keygen -t rsa -b 4096

# 2. 공개 키를 tars 서버에 복사
ssh-copy-id tars.giize.com

# 3. 접속 테스트 (비밀번호 입력 없이 접속되어야 함)
ssh tars.giize.com
```

## 빌드 재실행

한 번 빌드 후 재빌드할 때:

### 방법 1: spec 파일 사용 (빠름)
```bash
pyinstaller SemanTree.spec
```

### 방법 2: 처음부터 재빌드 (깨끗함)
```bash
# 기존 빌드 파일 삭제
rmdir /s /q build dist
del SemanTree.spec

# 다시 빌드
pyinstaller --onefile --windowed --name "SemanTree" ^
  --hidden-import tkinter ^
  --hidden-import pymongo ^
  --hidden-import bson ^
  semantree.py
```

## 문제 해결

### 1. "Failed to execute script" 오류
- **원인**: 필요한 모듈이 포함되지 않음
- **해결**: `--hidden-import` 옵션 확인

### 2. SSH 터널 콘솔 창이 나타남
- **원인**: 코드에 `subprocess.CREATE_NO_WINDOW` 플래그 누락
- **해결**: `semantree.py` 코드 확인 (이미 적용됨)

### 3. MongoDB 연결 실패
- **원인**: SSH 접속 불가 또는 MongoDB 서버 중지
- **해결**:
  ```bash
  # SSH 접속 확인
  ssh tars.giize.com

  # MongoDB 실행 확인
  ssh tars.giize.com "pgrep -f mongod"
  ```

### 4. EXE 파일이 너무 큼
- **원인**: `--onefile` 옵션은 모든 의존성을 포함
- **일반적인 크기**: 20-50MB (정상)
- **해결**: 크기가 문제라면 `--onedir` 옵션 사용 (폴더로 배포)

## 버전 관리

현재 버전: **v0.1**

버전 업데이트 시:
1. `semantree.py`에서 버전 번호 수정:
   ```python
   self.root.title("SemanTree v0.2 - AIMS Document Viewer")
   ```
2. 재빌드
3. Git 커밋

## 배포

### 배포 체크리스트:
- [ ] SSH 키 인증 설정 확인
- [ ] MongoDB 서버 실행 확인
- [ ] EXE 파일 빌드 완료
- [ ] 실행 테스트 (다른 PC에서)
- [ ] 기능 정상 작동 확인:
  - [ ] MongoDB 연결
  - [ ] 문서 로드
  - [ ] 네비게이션 (이전/다음)
  - [ ] 정렬 토글
  - [ ] 복사 기능
  - [ ] Wrap around 동작

## 라이선스

AIMS 프로젝트 내부 도구

---

**문의**: AIMS 개발팀
