/**
 * personal-files-sse.test.js
 * Personal Files SSE 알림 regression 테스트
 *
 * personal-files-routes.js의 각 변경 엔드포인트에서
 * notifyPersonalFilesSubscribers가 올바른 인자로 호출되는지 검증
 *
 * @since 2026-04-03
 */

const request = require('supertest');
const express = require('express');
const { ObjectId } = require('mongodb');
const path = require('path');

// ==================== Mock 설정 ====================

// Windows에서 VERSION 파일 충돌 방지
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

// SSE Manager mock — 핵심 검증 대상
const mockNotifyPersonalFilesSubscribers = jest.fn();
jest.mock('../lib/sseManager', () => ({
  channels: { personalFiles: new Map() },
  sendSSE: jest.fn(),
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
  notifyCustomerDocSubscribers: jest.fn(),
  notifyARSubscribers: jest.fn(),
  notifyCRSubscribers: jest.fn(),
  notifyCustomerCombinedSubscribers: jest.fn(),
  notifyPersonalFilesSubscribers: mockNotifyPersonalFilesSubscribers,
  notifyDocumentStatusSubscribers: jest.fn(),
  notifyDocumentListSubscribers: jest.fn(),
  notifyUserAccountSubscribers: jest.fn(),
}));

// timeUtils mock — timestamp 고정
const FIXED_TIMESTAMP = '2026-04-03T12:00:00.000Z';
jest.mock('../lib/timeUtils', () => ({
  utcNowISO: jest.fn(() => FIXED_TIMESTAMP),
}));

// backendLogger mock
jest.mock('../lib/backendLogger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
}));

// storageQuotaService mock — 업로드 허용
jest.mock('../lib/storageQuotaService', () => ({
  checkUploadAllowed: jest.fn().mockResolvedValue({ allowed: true }),
}));

// virusScanService mock
jest.mock('../lib/virusScanService', () => ({
  requestScan: jest.fn().mockResolvedValue({}),
}));

// multer mock — 디스크 저장 없이 파일 정보만 주입
jest.mock('multer', () => {
  const multerMock = () => ({
    single: () => (req, res, next) => {
      // multer가 처리하는 multipart body를 수동 설정
      if (!req.body) req.body = {};
      if (req.headers['x-test-has-file'] === 'true') {
        req.file = {
          originalname: Buffer.from('테스트파일.pdf').toString('latin1'),
          mimetype: 'application/pdf',
          size: 1024,
          path: '/tmp/test-upload-file',
        };
      }
      next();
    },
  });
  multerMock.diskStorage = jest.fn(() => ({}));
  return multerMock;
});

// fs.promises mock — 디스크 I/O 방지
jest.mock('fs', () => ({
  promises: {
    access: jest.fn().mockResolvedValue(undefined),
    mkdir: jest.fn().mockResolvedValue(undefined),
    unlink: jest.fn().mockResolvedValue(undefined),
  },
}));

// axios mock — 폴더 삭제 시 문서 삭제 요청
jest.mock('axios', () => ({
  delete: jest.fn().mockResolvedValue({ data: { success: true } }),
}));

// helpers mock
jest.mock('../lib/helpers', () => ({
  escapeRegex: jest.fn((str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
}));

// ==================== 테스트 상수 ====================

const MOCK_USER_ID = 'kakao_99999';
const MOCK_ITEM_ID = new ObjectId();
const MOCK_FOLDER_ID = new ObjectId();
const MOCK_DOC_ID = new ObjectId();

// ==================== Mock DB ====================

const collectionMocks = {
  personal_files: {
    findOne: jest.fn(),
    find: jest.fn(),
    insertOne: jest.fn(),
    updateOne: jest.fn(),
  },
  files: {
    findOne: jest.fn(),
    find: jest.fn(),
    updateOne: jest.fn(),
  },
};

const mockDb = {
  collection: jest.fn((name) => {
    return collectionMocks[name] || {
      findOne: jest.fn(),
      find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
      insertOne: jest.fn(),
      updateOne: jest.fn(),
      deleteOne: jest.fn(),
    };
  }),
};

// authenticateJWT mock — req.user 주입
const mockAuthenticateJWT = (req, res, next) => {
  req.user = { id: MOCK_USER_ID };
  next();
};

// ==================== Express App 구성 ====================

let app;

beforeAll(() => {
  jest.resetModules();
  const personalFilesRoutes = require('../routes/personal-files-routes');

  app = express();
  app.use(express.json());
  app.use('/api/personal-files', personalFilesRoutes(mockDb, mockAuthenticateJWT));
});

beforeEach(() => {
  jest.clearAllMocks();

  // find() 체인 기본값
  collectionMocks.personal_files.find.mockReturnValue({
    sort: jest.fn().mockReturnThis(),
    toArray: jest.fn().mockResolvedValue([]),
  });
  collectionMocks.files.find.mockReturnValue({
    toArray: jest.fn().mockResolvedValue([]),
  });
});

// ==================== 테스트 ====================

describe('Personal Files SSE 알림 검증', () => {

  // ─── 1. 폴더 생성 ───

  test('POST /folders → notifyPersonalFilesSubscribers(userId, "file-change", { type: "created", itemType: "folder" })', async () => {
    const insertedId = new ObjectId();
    collectionMocks.personal_files.findOne.mockResolvedValueOnce(null); // 중복 없음
    collectionMocks.personal_files.insertOne.mockResolvedValueOnce({ insertedId });

    const res = await request(app)
      .post('/api/personal-files/folders')
      .send({ name: '새 폴더' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // SSE 호출 검증
    expect(mockNotifyPersonalFilesSubscribers).toHaveBeenCalledTimes(1);
    expect(mockNotifyPersonalFilesSubscribers).toHaveBeenCalledWith(
      MOCK_USER_ID,
      'file-change',
      expect.objectContaining({
        type: 'created',
        itemId: insertedId.toString(),
        itemName: '새 폴더',
        itemType: 'folder',
        timestamp: FIXED_TIMESTAMP,
      })
    );
  });

  // ─── 2. 파일 업로드 ───

  test('POST /upload → notifyPersonalFilesSubscribers(userId, "file-change", { type: "created", itemType: "file" })', async () => {
    const insertedId = new ObjectId();
    collectionMocks.personal_files.insertOne.mockResolvedValueOnce({ insertedId });

    const res = await request(app)
      .post('/api/personal-files/upload')
      .set('x-test-has-file', 'true')
      .field('parentId', '');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // SSE 호출 검증
    expect(mockNotifyPersonalFilesSubscribers).toHaveBeenCalledTimes(1);
    expect(mockNotifyPersonalFilesSubscribers).toHaveBeenCalledWith(
      MOCK_USER_ID,
      'file-change',
      expect.objectContaining({
        type: 'created',
        itemId: insertedId.toString(),
        itemName: '테스트파일.pdf',
        itemType: 'file',
        timestamp: FIXED_TIMESTAMP,
      })
    );
  });

  // ─── 3. 이름 변경 ───

  test('PUT /:id/rename → notifyPersonalFilesSubscribers(userId, "file-change", { type: "renamed" })', async () => {
    const itemId = new ObjectId();

    // findOne: 항목 존재
    collectionMocks.personal_files.findOne
      .mockResolvedValueOnce({ _id: itemId, name: '기존이름', type: 'file', parentId: null, userId: MOCK_USER_ID })
      .mockResolvedValueOnce(null); // 중복 이름 없음

    collectionMocks.personal_files.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await request(app)
      .put(`/api/personal-files/${itemId}/rename`)
      .send({ newName: '새이름.pdf' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    expect(mockNotifyPersonalFilesSubscribers).toHaveBeenCalledTimes(1);
    expect(mockNotifyPersonalFilesSubscribers).toHaveBeenCalledWith(
      MOCK_USER_ID,
      'file-change',
      expect.objectContaining({
        type: 'renamed',
        itemId: itemId.toString(),
        itemName: '새이름.pdf',
        itemType: 'file',
        timestamp: FIXED_TIMESTAMP,
      })
    );
  });

  // ─── 4. 항목 삭제 ───

  test('DELETE /:id → notifyPersonalFilesSubscribers(userId, "file-change", { type: "deleted" })', async () => {
    const itemId = new ObjectId();

    // findOne: 파일 항목 (폴더가 아닌 파일이므로 하위 삭제 로직 스킵)
    collectionMocks.personal_files.findOne.mockResolvedValueOnce({
      _id: itemId, name: '삭제파일.pdf', type: 'file', userId: MOCK_USER_ID,
    });
    collectionMocks.personal_files.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await request(app)
      .delete(`/api/personal-files/${itemId}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    expect(mockNotifyPersonalFilesSubscribers).toHaveBeenCalledTimes(1);
    expect(mockNotifyPersonalFilesSubscribers).toHaveBeenCalledWith(
      MOCK_USER_ID,
      'file-change',
      expect.objectContaining({
        type: 'deleted',
        itemId: itemId.toString(),
        itemName: '삭제파일.pdf',
        itemType: 'file',
        timestamp: FIXED_TIMESTAMP,
      })
    );
  });

  // ─── 5. 항목 이동 ───

  test('PUT /:id/move → notifyPersonalFilesSubscribers(userId, "file-change", { type: "moved" })', async () => {
    const itemId = new ObjectId();
    const targetFolderId = new ObjectId();

    // findOne 1: 이동할 항목
    collectionMocks.personal_files.findOne
      .mockResolvedValueOnce({ _id: itemId, name: '이동파일.pdf', type: 'file', parentId: null, userId: MOCK_USER_ID })
      // findOne 2: 대상 폴더 존재
      .mockResolvedValueOnce({ _id: targetFolderId, type: 'folder', userId: MOCK_USER_ID, isDeleted: false })
      // findOne 3: 중복 이름 없음
      .mockResolvedValueOnce(null);

    collectionMocks.personal_files.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await request(app)
      .put(`/api/personal-files/${itemId}/move`)
      .send({ targetFolderId: targetFolderId.toString() });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    expect(mockNotifyPersonalFilesSubscribers).toHaveBeenCalledTimes(1);
    expect(mockNotifyPersonalFilesSubscribers).toHaveBeenCalledWith(
      MOCK_USER_ID,
      'file-change',
      expect.objectContaining({
        type: 'moved',
        itemId: itemId.toString(),
        itemName: '이동파일.pdf',
        itemType: 'file',
        timestamp: FIXED_TIMESTAMP,
      })
    );
  });

  // ─── 6. 문서 이동 ───

  test('PUT /documents/:id/move → notifyPersonalFilesSubscribers(userId, "file-change", { type: "moved", itemType: "document" })', async () => {
    const docId = new ObjectId();
    const targetFolderId = new ObjectId();

    // files.findOne: 문서 존재
    collectionMocks.files.findOne.mockResolvedValueOnce({
      _id: docId, filename: '계약서.pdf', customerId: MOCK_USER_ID,
    });
    // personal_files.findOne: 대상 폴더 존재
    collectionMocks.personal_files.findOne.mockResolvedValueOnce({
      _id: targetFolderId, type: 'folder', userId: MOCK_USER_ID, isDeleted: false,
    });
    collectionMocks.files.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await request(app)
      .put(`/api/personal-files/documents/${docId}/move`)
      .send({ targetFolderId: targetFolderId.toString() });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    expect(mockNotifyPersonalFilesSubscribers).toHaveBeenCalledTimes(1);
    expect(mockNotifyPersonalFilesSubscribers).toHaveBeenCalledWith(
      MOCK_USER_ID,
      'file-change',
      expect.objectContaining({
        type: 'moved',
        itemId: docId.toString(),
        itemName: '계약서.pdf',
        itemType: 'document',
        timestamp: FIXED_TIMESTAMP,
      })
    );
  });

  // ─── 7. 문서 이름 변경 ───

  test('PUT /documents/:id/rename → notifyPersonalFilesSubscribers(userId, "file-change", { type: "renamed", itemType: "document" })', async () => {
    const docId = new ObjectId();

    // files.findOne: 문서 존재
    collectionMocks.files.findOne.mockResolvedValueOnce({
      _id: docId, filename: '구계약서.pdf', customerId: MOCK_USER_ID,
    });
    collectionMocks.files.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    const res = await request(app)
      .put(`/api/personal-files/documents/${docId}/rename`)
      .send({ newName: '신계약서.pdf' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    expect(mockNotifyPersonalFilesSubscribers).toHaveBeenCalledTimes(1);
    expect(mockNotifyPersonalFilesSubscribers).toHaveBeenCalledWith(
      MOCK_USER_ID,
      'file-change',
      expect.objectContaining({
        type: 'renamed',
        itemId: docId.toString(),
        itemName: '신계약서.pdf',
        itemType: 'document',
        timestamp: FIXED_TIMESTAMP,
      })
    );
  });
});
