# Annual Report API

보험 고객의 Annual Report (보유계약 현황) PDF를 자동 파싱하여 DB에 저장하고 조회하는 FastAPI 서비스

## 📋 개요

- **목적**: Annual Report PDF 파싱 및 고객 계약 정보 관리
- **기술 스택**: Python FastAPI, MongoDB, OpenAI API
- **처리 시간**: 평균 25초 (계약 건수에 따라 15~43초)

## 🚀 시작하기

### 1. 환경 설정

```bash
# 가상환경 생성 (선택)
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate  # Windows

# 의존성 설치
pip install -r requirements.txt
```

### 2. 환경 변수 설정

`.env` 파일 생성 또는 환경 변수 설정:

```bash
# MongoDB 설정
MONGO_URI=mongodb://tars:27017/
DB_NAME=docupload

# OpenAI API 설정
OPENAI_API_KEY=your_openai_api_key_here

# API 설정 (선택)
API_PORT=8081
```

### 3. 서버 실행

```bash
# 개발 모드 (자동 리로드)
python main.py

# 또는 uvicorn 직접 실행
uvicorn main:app --host 0.0.0.0 --port 8081 --reload
```

서버가 시작되면 다음 URL에서 접근 가능:
- API 문서: http://localhost:8081/docs
- 헬스 체크: http://localhost:8081/health

## 📚 API 엔드포인트

### 기본 엔드포인트

#### `GET /`
API 기본 정보 조회

#### `GET /health`
헬스 체크 (MongoDB, OpenAI API 연결 상태 확인)

### Annual Report 관련 (Phase 3에서 구현 예정)

#### `POST /annual-report/parse`
Annual Report PDF 파싱 (비동기)

**Request:**
```json
{
  "file_id": "ObjectId",
  "customer_id": "ObjectId"
}
```

**Response:**
```json
{
  "success": true,
  "message": "파싱 시작됨. 약 25초 후 완료됩니다.",
  "job_id": "..."
}
```

#### `GET /customers/{customer_id}/annual-reports`
고객의 Annual Reports 조회

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "issue_date": "2025-08-27",
      "contracts": [...],
      "total_monthly_premium": 14102137,
      "total_contracts": 10
    }
  ]
}
```

## 🏗️ 프로젝트 구조

```
annual_report_api/
├── main.py              # FastAPI 애플리케이션
├── config.py            # 설정 관리
├── requirements.txt     # Python 패키지
├── README.md           # 문서
├── routes/             # API 라우터
│   ├── __init__.py
│   ├── parse.py        # 파싱 API
│   └── query.py        # 조회 API
├── services/           # 비즈니스 로직
│   ├── __init__.py
│   ├── detector.py     # Annual Report 판단
│   ├── parser.py       # OpenAI 파싱
│   └── db_writer.py    # MongoDB 저장
└── utils/              # 유틸리티
    ├── __init__.py
    └── pdf_utils.py    # PDF 처리
```

## 🔧 개발 가이드

### 새로운 라우터 추가

```python
# routes/example.py
from fastapi import APIRouter

router = APIRouter()

@router.get("/example")
async def example():
    return {"message": "example"}

# main.py에 등록
from routes import example
app.include_router(example.router, prefix="/api", tags=["Example"])
```

### MongoDB 접근

```python
from main import db

# 컬렉션 접근
customers_collection = db["customers"]

# 쿼리 실행
result = customers_collection.find_one({"_id": ObjectId(customer_id)})
```

## ⚠️ 주의사항

1. **환경 변수**: `OPENAI_API_KEY` 필수 설정
2. **MongoDB 연결**: tars 서버 MongoDB 접근 권한 필요
3. **파일 경로**: tars 서버의 `/data` 디렉토리 사용
4. **타임아웃**: 파싱 작업은 최대 120초 소요 가능

## 📊 성능

- **평균 처리 시간**: 25.34초
- **최소 처리 시간**: 15.83초
- **최대 처리 시간**: 42.63초
- **성공률**: 100% (4개 샘플 테스트 기준)

## 🐛 문제 해결

### MongoDB 연결 실패
```bash
# MongoDB 상태 확인
systemctl status mongod  # Linux

# 연결 테스트
mongo --host tars --port 27017
```

### OpenAI API 오류
```bash
# API 키 확인
echo $OPENAI_API_KEY

# 키 설정
export OPENAI_API_KEY="your_key_here"
```

## 📚 참고 문서

- [FastAPI 공식 문서](https://fastapi.tiangolo.com/)
- [OpenAI API 문서](https://platform.openai.com/docs/)
- [PyMongo 문서](https://pymongo.readthedocs.io/)

## 📝 변경 이력

- **2025-10-16**: Phase 1-2 완료 (FastAPI 기본 설정)
- **2025-10-16**: Phase 1-1 완료 (디렉토리 구조 생성)

---

**작성자**: Claude
**최종 수정**: 2025-10-16
