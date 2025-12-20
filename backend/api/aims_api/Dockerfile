FROM node:18-slim

# 빌드 시 주입되는 버전 정보
ARG GIT_HASH=dev
ARG BUILD_TIME=unknown

WORKDIR /app

# 버전 정보를 환경변수로 설정
ENV GIT_HASH=${GIT_HASH}
ENV BUILD_TIME=${BUILD_TIME}

# sqlite3 및 ClamAV 설치
# clamdscan은 호스트의 clamd 데몬에 소켓으로 연결하여 스캔
RUN apt-get update && apt-get install -y \
    sqlite3 \
    clamav \
    && rm -rf /var/lib/apt/lists/*

# 환경변수 기본값 설정
ENV PORT=3010

# package.json과 package-lock.json 먼저 복사 (Docker 캐시 활용)
COPY package*.json ./

# Node.js 패키지 설치
RUN npm ci --only=production

# 애플리케이션 코드 복사
COPY . .

# 로그 디렉토리 생성
RUN mkdir -p logs

# 포트 노출
EXPOSE ${PORT}

# 애플리케이션 실행
CMD ["node", "server.js"]