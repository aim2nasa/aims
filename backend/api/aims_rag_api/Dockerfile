# Dockerfile
# Python 3.10 기반 이미지 사용
FROM python:3.10-slim

# 빌드 시 주입되는 버전 정보
ARG GIT_HASH=dev
ARG BUILD_TIME=unknown

# 버전 정보를 환경변수로 설정
ENV GIT_HASH=${GIT_HASH}
ENV BUILD_TIME=${BUILD_TIME}

# 작업 디렉터리 설정
WORKDIR /app

# requirements.txt 복사 및 의존성 설치
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 프로젝트 파일 복사
COPY . .

# 8000 포트 노출
EXPOSE 8000

# Uvicorn 서버 실행
CMD ["uvicorn", "rag_search:app", "--host", "0.0.0.0", "--port", "8000"]
