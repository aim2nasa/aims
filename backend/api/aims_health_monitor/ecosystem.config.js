/**
 * PM2 설정 파일
 * aims_health_monitor - 독립 헬스 모니터링 서비스
 */
module.exports = {
  apps: [{
    name: 'aims-health-monitor',
    script: 'dist/index.js',
    cwd: '/home/rossi/aims/backend/api/aims_health_monitor',
    instances: 1,           // 단일 인스턴스 (중복 체크 방지)
    exec_mode: 'fork',
    autorestart: true,      // 자동 재시작
    watch: false,
    max_restarts: 10,
    restart_delay: 5000,    // 재시작 간격 5초
    env: {
      NODE_ENV: 'production',
      PORT: 3012,
      MONGO_URI: 'mongodb://tars:27017/',
      DB_NAME: 'docupload',
      CHECK_INTERVAL: 60000,    // 60초 간격 체크
      HEALTH_TIMEOUT: 5000      // 5초 타임아웃
    }
  }]
};
