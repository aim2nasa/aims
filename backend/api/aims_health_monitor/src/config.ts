/**
 * 설정 및 모니터링 대상 서비스 목록
 */

export interface ServiceConfig {
  port: number;
  service: string;
  description: string;
  healthEndpoint: string | null;  // null이면 TCP 체크
  timeout?: number;               // 타임아웃 (ms)
}

// 모니터링 대상 서비스 목록 (10개)
export const MONITORED_SERVICES: ServiceConfig[] = [
  // Tier 2: Backend APIs
  { port: 3010, service: 'aims_api', description: 'AIMS 메인 API', healthEndpoint: '/api/health/deep', timeout: 10000 },
  { port: 3011, service: 'aims_mcp', description: 'MCP 서버 (AI 도구)', healthEndpoint: '/health' },
  { port: 8000, service: 'aims_rag_api', description: 'RAG/문서 처리 API', healthEndpoint: '/health' },
  { port: 8002, service: 'pdf_proxy', description: 'PDF 프록시', healthEndpoint: '/health' },
  { port: 8004, service: 'annual_report_api', description: '연간보고서 API', healthEndpoint: '/health' },
  { port: 8005, service: 'pdf_converter', description: 'PDF 변환 서버', healthEndpoint: '/health' },
  { port: 8100, service: 'document_pipeline', description: 'Document Pipeline API', healthEndpoint: '/health/deep', timeout: 10000 },

  // Tier 3: Workflow
  { port: 5678, service: 'n8n', description: '워크플로우 엔진', healthEndpoint: '/healthz' },

  // Tier 1: Infrastructure (TCP 체크)
  { port: 6333, service: 'qdrant', description: '벡터 DB', healthEndpoint: null },
  { port: 27017, service: 'mongodb', description: '데이터베이스', healthEndpoint: null }
];

// 환경 설정
export const config = {
  port: parseInt(process.env.PORT || '3012'),
  mongoUri: process.env.MONGO_URI || 'mongodb://tars:27017/',
  dbName: process.env.DB_NAME || 'docupload',
  checkInterval: parseInt(process.env.CHECK_INTERVAL || '60000'),  // 60초
  healthTimeout: parseInt(process.env.HEALTH_TIMEOUT || '5000'),   // 5초
  collectionName: 'service_health_logs'
};
