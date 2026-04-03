/**
 * handleDocumentLink regression 테스트
 * R3: 문서-고객 연결 이벤트 기반 오케스트레이션 검증
 *
 * eventBus.js의 내부 함수 _handleDocumentLink를 직접 호출하여 테스트합니다.
 * DB는 collection별 mock으로 분리하여 호출 순서 의존성을 제거합니다.
 */

const { ObjectId } = require('mongodb');

// --- 고정 테스트 ID ---
const TEST_USER_ID = '695cfe260e822face7a78535';
const TEST_CUSTOMER_OID = new ObjectId();
const TEST_CUSTOMER_ID = TEST_CUSTOMER_OID.toString();
const TEST_DOC_OID = new ObjectId();
const TEST_DOC_ID = TEST_DOC_OID.toString();

// --- 컬렉션별 mock 분리 ---
const customersMock = { findOne: jest.fn(), updateOne: jest.fn() };
const filesMock = { findOne: jest.fn(), updateOne: jest.fn() };
const arQueueMock = { updateOne: jest.fn() };

const mockCollection = jest.fn((name) => {
  switch (name) {
    case 'customers': return customersMock;
    case 'files': return filesMock;
    case 'ar_parse_queue': return arQueueMock;
    default: return { findOne: jest.fn(), updateOne: jest.fn() };
  }
});

const mockDb = { collection: mockCollection };

// --- Qdrant mock ---
const mockQdrantScroll = jest.fn().mockResolvedValue({ points: [] });
const mockQdrantSetPayload = jest.fn().mockResolvedValue({});
const mockQdrantClient = {
  scroll: mockQdrantScroll,
  setPayload: mockQdrantSetPayload,
};

// --- SSE mock ---
jest.mock('../lib/sseManager', () => ({
  notifyCustomerDocSubscribers: jest.fn(),
  notifyDocumentListSubscribers: jest.fn(),
  notifyCRSubscribers: jest.fn(),
  notifyARSubscribers: jest.fn(),
  notifyCustomerCombinedSubscribers: jest.fn(),
  notifyDocumentStatusSubscribers: jest.fn(),
}));

// --- pdfConversionTrigger mock ---
const mockTriggerPdf = jest.fn().mockResolvedValue('not_triggered');
jest.mock('../lib/pdfConversionTrigger', () => {
  return function () {
    return { triggerPdfConversionIfNeeded: mockTriggerPdf };
  };
});

// --- backendLogger mock ---
jest.mock('../lib/backendLogger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
}));

// --- Redis mock (eventBus initialize 시 ioredis 사용) ---
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    subscribe: jest.fn(),
    on: jest.fn(),
    unsubscribe: jest.fn(),
    quit: jest.fn(),
  }));
});

const sseManager = require('../lib/sseManager');
const eventBus = require('../lib/eventBus');

describe('handleDocumentLink', () => {
  let handleDocumentLink;

  beforeAll(() => {
    eventBus.initialize(mockDb, { qdrantClient: mockQdrantClient });
    handleDocumentLink = eventBus._handleDocumentLink;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Qdrant 기본값 재설정 (clearAllMocks로 초기화되므로)
    mockQdrantScroll.mockResolvedValue({ points: [] });
  });

  // --- 헬퍼: 기본 성공 시나리오의 mock 설정 ---
  function setupSuccessMocks(overrides = {}) {
    const customerDoc = overrides.customer ?? {
      _id: TEST_CUSTOMER_OID,
      'meta': { created_by: TEST_USER_ID },
      documents: [],
    };
    const fileDoc = overrides.file ?? {
      _id: TEST_DOC_OID,
      ownerId: TEST_USER_ID,
      is_annual_report: false,
      filename: 'test.pdf',
      mimeType: 'application/pdf',
    };

    // customers.findOne: 1번째=소유권 검증, 2번째=이미 연결 확인
    customersMock.findOne
      .mockResolvedValueOnce(customerDoc)  // 소유권 검증
      .mockResolvedValueOnce(overrides.alreadyLinked ?? null);  // 이미 연결 여부

    // files.findOne: 1번째=문서 소유권 검증
    filesMock.findOne.mockResolvedValueOnce(fileDoc);

    // updateOne 기본 반환
    customersMock.updateOne.mockResolvedValue({ modifiedCount: 1 });
    filesMock.updateOne.mockResolvedValue({ modifiedCount: 1 });
    arQueueMock.updateOne.mockResolvedValue({ modifiedCount: 1 });
  }

  test('TC1: 정상 연결 — customers.documents push + files.customerId 설정', async () => {
    setupSuccessMocks();

    await handleDocumentLink(TEST_DOC_ID, TEST_CUSTOMER_ID, TEST_USER_ID, 'test note');

    // customers.updateOne: documents push
    expect(customersMock.updateOne).toHaveBeenCalledTimes(1);
    const custCall = customersMock.updateOne.mock.calls[0];
    expect(custCall[0]).toEqual({ _id: TEST_CUSTOMER_OID });
    expect(custCall[1].$push.documents.document_id).toEqual(TEST_DOC_OID);
    expect(custCall[1].$push.documents.notes).toBe('test note');

    // files.updateOne: customerId 설정
    expect(filesMock.updateOne).toHaveBeenCalledTimes(1);
    const fileCall = filesMock.updateOne.mock.calls[0];
    expect(fileCall[0]).toEqual({ _id: TEST_DOC_OID });
    expect(fileCall[1].$set.customerId).toEqual(TEST_CUSTOMER_OID);
    expect(fileCall[1].$set.customer_notes).toBe('test note');
  });

  test('TC2: 고객 미발견/소유권 불일치 → 조기 return, DB 미변경', async () => {
    // customers.findOne이 null 반환 (소유권 불일치)
    customersMock.findOne.mockResolvedValueOnce(null);

    await handleDocumentLink(TEST_DOC_ID, TEST_CUSTOMER_ID, TEST_USER_ID, '');

    expect(customersMock.updateOne).not.toHaveBeenCalled();
    expect(filesMock.updateOne).not.toHaveBeenCalled();
  });

  test('TC3: 문서 미발견/소유권 불일치 → 조기 return, DB 미변경', async () => {
    // 고객은 발견되지만 문서가 null
    customersMock.findOne.mockResolvedValueOnce({
      _id: TEST_CUSTOMER_OID,
      documents: [],
    });
    filesMock.findOne.mockResolvedValueOnce(null);

    await handleDocumentLink(TEST_DOC_ID, TEST_CUSTOMER_ID, TEST_USER_ID, '');

    expect(customersMock.updateOne).not.toHaveBeenCalled();
    expect(filesMock.updateOne).not.toHaveBeenCalled();
  });

  test('TC4: 중복 파일 해시 → 조기 return', async () => {
    const existingDocOid = new ObjectId();
    const fileHash = 'abc123hash';

    // 고객: 기존 문서 1건 보유
    customersMock.findOne.mockResolvedValueOnce({
      _id: TEST_CUSTOMER_OID,
      documents: [{ document_id: existingDocOid }],
    });

    // 문서: file_hash 있음
    filesMock.findOne
      .mockResolvedValueOnce({
        _id: TEST_DOC_OID,
        ownerId: TEST_USER_ID,
        meta: { file_hash: fileHash },
      })
      // 중복 해시 검사: 기존 문서에서 동일 해시 발견
      .mockResolvedValueOnce({ _id: existingDocOid });

    await handleDocumentLink(TEST_DOC_ID, TEST_CUSTOMER_ID, TEST_USER_ID, '');

    expect(customersMock.updateOne).not.toHaveBeenCalled();
    expect(filesMock.updateOne).not.toHaveBeenCalled();
  });

  test('TC5: 이미 연결된 문서 → 조기 return', async () => {
    setupSuccessMocks({
      alreadyLinked: { _id: TEST_CUSTOMER_OID },  // 이미 연결됨
    });

    await handleDocumentLink(TEST_DOC_ID, TEST_CUSTOMER_ID, TEST_USER_ID, '');

    expect(customersMock.updateOne).not.toHaveBeenCalled();
    expect(filesMock.updateOne).not.toHaveBeenCalled();
  });

  test('TC6: AR 문서 → ar_parse_queue upsert 호출', async () => {
    setupSuccessMocks({
      file: {
        _id: TEST_DOC_OID,
        ownerId: TEST_USER_ID,
        is_annual_report: true,
        filename: 'ar_report.pdf',
        mimeType: 'application/pdf',
      },
    });

    await handleDocumentLink(TEST_DOC_ID, TEST_CUSTOMER_ID, TEST_USER_ID, '');

    // customers push + files customerId = 정상 연결
    expect(customersMock.updateOne).toHaveBeenCalledTimes(1);
    expect(filesMock.updateOne).toHaveBeenCalledTimes(1);

    // ar_parse_queue upsert
    expect(arQueueMock.updateOne).toHaveBeenCalledTimes(1);
    const arCall = arQueueMock.updateOne.mock.calls[0];
    expect(arCall[0]).toEqual({ file_id: TEST_DOC_OID });
    expect(arCall[1].$setOnInsert.status).toBe('pending');
    expect(arCall[1].$setOnInsert.customer_id).toEqual(TEST_CUSTOMER_OID);
    expect(arCall[2]).toEqual({ upsert: true });
  });

  test('TC7: PDF 변환 트리거 호출 확인', async () => {
    setupSuccessMocks();

    await handleDocumentLink(TEST_DOC_ID, TEST_CUSTOMER_ID, TEST_USER_ID, '');

    expect(mockTriggerPdf).toHaveBeenCalledTimes(1);
    // triggerPdfConversionIfNeeded에 document 객체가 전달됨
    const callArg = mockTriggerPdf.mock.calls[0][0];
    expect(callArg._id).toEqual(TEST_DOC_OID);
  });

  test('TC8: SSE 알림 호출 확인', async () => {
    setupSuccessMocks();

    await handleDocumentLink(TEST_DOC_ID, TEST_CUSTOMER_ID, TEST_USER_ID, '');

    // 고객 문서 변경 알림
    expect(sseManager.notifyCustomerDocSubscribers).toHaveBeenCalledTimes(1);
    expect(sseManager.notifyCustomerDocSubscribers).toHaveBeenCalledWith(
      TEST_CUSTOMER_ID,
      'document-change',
      expect.objectContaining({
        type: 'linked',
        customerId: TEST_CUSTOMER_ID,
        documentId: TEST_DOC_ID,
      })
    );

    // 문서 리스트 변경 알림
    expect(sseManager.notifyDocumentListSubscribers).toHaveBeenCalledTimes(1);
    expect(sseManager.notifyDocumentListSubscribers).toHaveBeenCalledWith(
      TEST_USER_ID,
      'document-list-change',
      expect.objectContaining({
        type: 'linked',
        documentId: TEST_DOC_ID,
      })
    );
  });
});
