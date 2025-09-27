FROM node:18-slim

WORKDIR /app

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