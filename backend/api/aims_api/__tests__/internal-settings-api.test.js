/**
 * internal-settings-api.test.js
 * Settings Internal API regression 테스트
 *
 * GET /api/internal/settings/ai-models 엔드포인트 검증
 * - DB 문서 있음 → 메타데이터 제거 확인
 * - DB 문서 없음 → 기본값 반환
 * - x-api-key 누락 → 401
 * - DB 오류 → 500
 *
 * @since 2026-04-04
 */

const request = require('supertest');
const express = require('express');

// Windows에서 VERSION 파일(텍스트)과 version.js가 대소문자 무시로 충돌
jest.mock('../version', () => ({
  VERSION_INFO: { version: '0.0.0-test', gitHash: 'test', buildTime: 'test', fullVersion: 'v0.0.0-test' },
  APP_VERSION: '0.0.0-test',
  GIT_HASH: 'test',
  BUILD_TIME: 'test',
  FULL_VERSION: 'v0.0.0-test',
  logVersionInfo: jest.fn(),
}));

// OpenAI SDK mock
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: jest.fn() } },
    audio: { transcriptions: { create: jest.fn() } },
  }));
});

// ==================== 테스트용 상수 ====================

const API_KEY = 'test-internal-api-key';

// DB에 저장된 AI 모델 설정 (운영 데이터 시뮬레이션)
const MOCK_AI_MODELS_DOC = {
  _id: 'ai_models',
  chat: {
    model: 'gpt-4.1-mini',
    description: 'AI 채팅',
    availableModels: ['gpt-4.1', 'gpt-4.1-mini'],
  },
  rag: {
    model: 'gpt-4.1-mini',
    description: 'RAG 답변 생성',
    availableModels: ['gpt-4.1', 'gpt-4.1-mini'],
  },
  annualReport: {
    model: 'gpt-4.1-mini',
    parser: 'pdfplumber_table',
    description: 'Annual Report PDF 파싱',
    availableModels: ['gpt-4.1', 'gpt-4.1-mini'],
    availableParsers: ['openai', 'pdfplumber', 'pdfplumber_table'],
  },
  customerReview: {
    model: 'gpt-4.1',
    parser: 'pdfplumber_table',
    description: 'Customer Review Service PDF 파싱',
    availableModels: ['gpt-4.1', 'gpt-4.1-mini'],
    availableParsers: ['regex', 'pdfplumber_table'],
  },
  updatedAt: new Date('2026-03-13T08:25:43.057Z'),
  updatedBy: '693ea527a867379a5f9dc29d',
  resetAt: new Date('2025-12-27T02:29:40.438Z'),
  budget: { monthlyUSD: 10, alertPercent: 90 },
};

// ==================== Mock DB 구성 ====================

const systemSettingsMock = {
  findOne: jest.fn(),
};

const mockDb = {
  collection: jest.fn((name) => {
    if (name === 'system_settings') return systemSettingsMock;
    return {
      findOne: jest.fn(),
      find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
      insertOne: jest.fn(),
      updateOne: jest.fn(),
    };
  }),
};

// ==================== Express App 구성 ====================

let app;

beforeAll(() => {
  process.env.INTERNAL_API_KEY = API_KEY;

  jest.resetModules();
  const internalRoutes = require('../routes/internal-routes');

  app = express();
  app.use(express.json());
  app.use('/api', internalRoutes(mockDb));
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ==================== 헬퍼 함수 ====================

function getWithAuth(url) {
  return request(app)
    .get(url)
    .set('x-api-key', API_KEY);
}

// ==================== 테스트 ====================

describe('GET /api/internal/settings/ai-models', () => {

  test('정상: DB 문서가 있을 때 메타데이터 제거 후 설정값 반환', async () => {
    systemSettingsMock.findOne.mockResolvedValueOnce({ ...MOCK_AI_MODELS_DOC });

    const res = await getWithAuth('/api/internal/settings/ai-models');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;

    // 핵심 설정값 존재 확인
    expect(data.chat.model).toBe('gpt-4.1-mini');
    expect(data.rag.model).toBe('gpt-4.1-mini');
    expect(data.annualReport.model).toBe('gpt-4.1-mini');
    expect(data.annualReport.parser).toBe('pdfplumber_table');
    expect(data.customerReview.model).toBe('gpt-4.1');
    expect(data.customerReview.parser).toBe('pdfplumber_table');

    // 메타데이터 제거 확인
    expect(data._id).toBeUndefined();
    expect(data.updatedAt).toBeUndefined();
    expect(data.updatedBy).toBeUndefined();
    expect(data.resetAt).toBeUndefined();

    // UI 전용 필드 제거 확인
    expect(data.chat.availableModels).toBeUndefined();
    expect(data.chat.description).toBeUndefined();
    expect(data.rag.availableModels).toBeUndefined();
    expect(data.annualReport.availableModels).toBeUndefined();
    expect(data.annualReport.availableParsers).toBeUndefined();
    expect(data.customerReview.availableModels).toBeUndefined();
    expect(data.customerReview.availableParsers).toBeUndefined();
  });

  test('정상: DB 문서가 없을 때 기본값 반환', async () => {
    systemSettingsMock.findOne.mockResolvedValueOnce(null);

    const res = await getWithAuth('/api/internal/settings/ai-models');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;

    // 기본값 4개 항목 정확성
    expect(data.chat.model).toBe('gpt-4o');
    expect(data.rag.model).toBe('gpt-3.5-turbo');
    expect(data.annualReport.model).toBe('gpt-4.1');
    expect(data.annualReport.parser).toBe('openai');
    expect(data.customerReview.model).toBe('gpt-4.1');
    expect(data.customerReview.parser).toBe('regex');
  });

  test('인증 실패: x-api-key 누락 시 401', async () => {
    const res = await request(app)
      .get('/api/internal/settings/ai-models');
    // x-api-key 헤더 없음

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/API key/i);
  });

  test('인증 실패: 잘못된 x-api-key 시 401', async () => {
    const res = await request(app)
      .get('/api/internal/settings/ai-models')
      .set('x-api-key', 'wrong-key');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('DB 오류 시 500 반환', async () => {
    systemSettingsMock.findOne.mockRejectedValueOnce(new Error('DB connection failed'));

    const res = await getWithAuth('/api/internal/settings/ai-models');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/DB connection failed/);
  });

  test('budget 등 비표준 필드는 그대로 유지', async () => {
    systemSettingsMock.findOne.mockResolvedValueOnce({ ...MOCK_AI_MODELS_DOC });

    const res = await getWithAuth('/api/internal/settings/ai-models');

    expect(res.status).toBe(200);
    // budget은 chat/rag/annualReport/customerReview에 해당하지 않으므로 유지
    expect(res.body.data.budget).toBeDefined();
    expect(res.body.data.budget.monthlyUSD).toBe(10);
  });
});
