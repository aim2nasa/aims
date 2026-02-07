FROM node:18-slim

# 빌드 시 주입되는 버전 정보
ARG GIT_HASH=dev
ARG BUILD_TIME=unknown

WORKDIR /app

# 버전 정보를 환경변수로 설정
ENV GIT_HASH=${GIT_HASH}
ENV BUILD_TIME=${BUILD_TIME}

# sqlite3, ClamAV, curl 설치
# clamdscan은 호스트의 clamd 데몬에 소켓으로 연결하여 스캔
# curl은 HEALTHCHECK에서 사용
RUN apt-get update && apt-get install -y \
    sqlite3 \
    clamav \
    curl \
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
# package-lock.json 삭제 후 npm install로 새로 생성
RUN sed -i 's|file:../../shared/schema|file:/shared-schema|g' package.json && \
    rm -f package-lock.json && \
    npm install --omit=dev

# shared-schema를 node_modules에 직접 링크 (심볼릭 링크 문제 해결)
RUN mkdir -p node_modules/@aims && \
    rm -rf node_modules/@aims/shared-schema && \
    ln -s /shared-schema node_modules/@aims/shared-schema

# 애플리케이션 코드 복사
COPY api/aims_api/ .

# 로그 디렉토리 생성
RUN mkdir -p logs

# 포트 노출
EXPOSE ${PORT}

# 헬스체크 (좀비 상태 감지)
# - interval: 30초마다 체크
# - timeout: 10초 이내 응답 필요
# - start-period: 시작 후 60초간 실패 무시 (초기화 시간)
# - retries: 3회 연속 실패 시 unhealthy
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:${PORT}/api/health/deep || exit 1

# 애플리케이션 실행 (힙 메모리 1.5GB 제한 - OOM 방지)
CMD ["node", "--max-old-space-size=1536", "server.js"]