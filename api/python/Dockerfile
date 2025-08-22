FROM python:3.11-slim

WORKDIR /app

# 환경변수 기본값 설정
ENV API_PORT=8000

# requirements.txt 먼저 복사 (Docker 캐시 활용)
COPY requirements.txt .

# Python 패키지 설치
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# 애플리케이션 코드 복사
COPY . .

# 동적 포트 노출 (기본값 8000)
EXPOSE ${API_PORT}

# 환경변수로 포트 설정 가능하도록 변경
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${API_PORT}"]
