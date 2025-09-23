#!/usr/bin/env node

const axios = require('axios');

// 테스트 대상 서비스들
const services = [
  {
    name: 'TARS Main API',
    url: 'http://tars.giize.com:3010/api/health',
    port: 3010,
    required: true
  },
  {
    name: 'Document Status API',
    url: 'http://tars.giize.com:8080/health',
    port: 8080,
    required: false
  },
  {
    name: 'RAG Search API',
    url: 'https://tars.giize.com/rag/',
    port: 443,
    required: false
  },
  {
    name: 'N8N Workflow',
    url: 'https://n8nd.giize.com/',
    port: 5678,
    required: false
  }
];

async function healthCheck() {
  console.log('🚀 AIMS Backend Health Check 시작\n');

  const results = [];
  let passedCount = 0;
  let totalCount = services.length;

  for (const service of services) {
    console.log(`🔍 ${service.name} 체크 중...`);

    try {
      const startTime = Date.now();
      const response = await axios.get(service.url, {
        timeout: 10000,
        validateStatus: (status) => status < 500 // 500 미만은 모두 성공으로 간주
      });
      const responseTime = Date.now() - startTime;

      if (response.status >= 200 && response.status < 400) {
        console.log(`✅ ${service.name}: 정상 (${response.status}) - ${responseTime}ms`);
        results.push({
          service: service.name,
          status: 'healthy',
          code: response.status,
          responseTime: responseTime
        });
        passedCount++;
      } else {
        console.log(`⚠️ ${service.name}: 응답 이상 (${response.status}) - ${responseTime}ms`);
        results.push({
          service: service.name,
          status: 'warning',
          code: response.status,
          responseTime: responseTime
        });
        if (!service.required) passedCount++; // 선택적 서비스는 경고라도 통과
      }

    } catch (error) {
      const errorType = error.code || error.message;

      if (service.required) {
        console.log(`❌ ${service.name}: 연결 실패 - ${errorType}`);
        results.push({
          service: service.name,
          status: 'failed',
          error: errorType
        });
      } else {
        console.log(`⚠️ ${service.name}: 연결 실패 - ${errorType} (선택적 서비스)`);
        results.push({
          service: service.name,
          status: 'optional_failed',
          error: errorType
        });
        passedCount++; // 선택적 서비스는 실패해도 통과
      }
    }

    console.log(''); // 빈 줄
  }

  // 결과 요약
  console.log('📊 Health Check 결과 요약:');
  console.log('=' .repeat(50));

  results.forEach(result => {
    const icon = result.status === 'healthy' ? '✅' :
                 result.status === 'failed' ? '❌' : '⚠️';
    const info = result.responseTime ?
                 `${result.code} - ${result.responseTime}ms` :
                 result.error;
    console.log(`${icon} ${result.service}: ${info}`);
  });

  console.log('=' .repeat(50));
  console.log(`📈 전체 상태: ${passedCount}/${totalCount} 서비스 OK (${Math.round(passedCount/totalCount*100)}%)`);

  if (passedCount === totalCount) {
    console.log('🎉 모든 서비스가 정상 상태입니다!');
    process.exit(0);
  } else if (passedCount >= totalCount * 0.5) {
    console.log('✅ 핵심 서비스는 정상 작동 중입니다.');
    process.exit(0);
  } else {
    console.log('🚨 중요한 서비스에 문제가 있습니다. 확인이 필요합니다.');
    process.exit(1);
  }
}

// 스크립트가 직접 실행될 때만 동작
if (require.main === module) {
  healthCheck().catch(error => {
    console.error('❌ Health Check 실행 중 오류:', error.message);
    process.exit(1);
  });
}

module.exports = { healthCheck, services };