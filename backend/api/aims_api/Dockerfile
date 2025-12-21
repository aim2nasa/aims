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

# 1. shared-schema 복사 및 빌드 (file: 의존성 해결)
WORKDIR /shared-schema
COPY shared/schema/package*.json ./
COPY shared/schema/tsconfig*.json ./
COPY shared/schema/*.ts ./
RUN npm ci && npm run build

# 2. aims_api 빌드
WORKDIR /app
COPY api/aims_api/package*.json ./

# 로컬 의존성을 /shared-schema로 수정하여 설치
RUN sed -i 's|file:../../shared/schema|file:/shared-schema|g' package.json && \
    npm ci --omit=dev

# 애플리케이션 코드 복사
COPY api/aims_api/ .

# 로그 디렉토리 생성
RUN mkdir -p logs

# 포트 노출
EXPOSE ${PORT}

# 애플리케이션 실행
CMD ["node", "server.js"]