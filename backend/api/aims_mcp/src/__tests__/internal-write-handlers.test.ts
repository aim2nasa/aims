/**
 * Internal API Write 전환 regression 테스트
 * aims_mcp의 Write 핸들러가 Internal API를 올바르게 호출하고
 * 성공/에러 응답을 MCP 형식으로 변환하는지 검증
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';

// ── Internal API 함수 mock (Read + Write) ──

const mockCreateCustomer = vi.fn();
const mockUpdateCustomer = vi.fn();
const mockSyncCustomerMemo = vi.fn();
const mockCreateMemo = vi.fn();
const mockUpdateMemo = vi.fn();
const mockDeleteMemo = vi.fn();
const mockCreateRelationship = vi.fn();
const mockDeleteRelationship = vi.fn();
const mockQueryCustomers = vi.fn();
const mockQueryMemos = vi.fn();
const mockCountMemos = vi.fn();
const mockGetMemo = vi.fn();
const mockGetRelationship = vi.fn();
const mockQueryRelationships = vi.fn();

vi.mock('../internalApi.js', () => ({
  createCustomer: (...args: any[]) => mockCreateCustomer(...args),
  updateCustomer: (...args: any[]) => mockUpdateCustomer(...args),
  syncCustomerMemo: (...args: any[]) => mockSyncCustomerMemo(...args),
  createMemo: (...args: any[]) => mockCreateMemo(...args),
  updateMemo: (...args: any[]) => mockUpdateMemo(...args),
  deleteMemo: (...args: any[]) => mockDeleteMemo(...args),
  createRelationship: (...args: any[]) => mockCreateRelationship(...args),
  deleteRelationship: (...args: any[]) => mockDeleteRelationship(...args),
  queryCustomers: (...args: any[]) => mockQueryCustomers(...args),
  queryMemos: (...args: any[]) => mockQueryMemos(...args),
  countMemos: (...args: any[]) => mockCountMemos(...args),
  getMemo: (...args: any[]) => mockGetMemo(...args),
  getRelationship: (...args: any[]) => mockGetRelationship(...args),
  queryRelationships: (...args: any[]) => mockQueryRelationships(...args),
  queryFiles: vi.fn().mockResolvedValue([]),
  countFiles: vi.fn().mockResolvedValue(0),
  getCustomerName: vi.fn().mockResolvedValue(null),
}));

// ── Auth mock ──

vi.mock('../auth.js', () => ({
  getCurrentUserId: () => 'test-user-123',
}));

// ── DB mock (escapeRegex, formatZodError 유틸만 사용) ──

vi.mock('../db.js', () => ({
  escapeRegex: (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  formatZodError: (e: unknown) => String(e),
}));

// ── systemLogger mock ──

vi.mock('../systemLogger.js', () => ({
  sendErrorLog: vi.fn(),
}));

// ── 핸들러 import ──

import { handleCreateCustomer, handleUpdateCustomer } from '../tools/customers.js';
import { handleAddMemo, handleDeleteMemo, handleUpdateMemo } from '../tools/memos.js';
import { handleCreateRelationship, handleDeleteRelationship } from '../tools/relationships.js';

// ── 테스트 유틸 ──

const VALID_CUSTOMER_ID = new ObjectId().toHexString();
const VALID_CUSTOMER_ID_2 = new ObjectId().toHexString();
const VALID_MEMO_ID = new ObjectId().toHexString();
const VALID_RELATIONSHIP_ID = new ObjectId().toHexString();

/** 성공 응답에서 JSON 파싱 */
function parseSuccess(result: any) {
  expect(result.isError).toBeUndefined();
  expect(result.content).toHaveLength(1);
  expect(result.content[0].type).toBe('text');
  return JSON.parse(result.content[0].text);
}

/** 에러 응답 검증 */
function assertError(result: any, messagePart?: string) {
  expect(result.isError).toBe(true);
  expect(result.content).toHaveLength(1);
  expect(result.content[0].type).toBe('text');
  if (messagePart) {
    expect(result.content[0].text).toContain(messagePart);
  }
}

// ── Mock 초기화 ──

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// handleCreateCustomer
// ============================================================

describe('handleCreateCustomer', () => {
  it('성공: Internal API 호출 후 success 응답 반환', async () => {
    mockCreateCustomer.mockResolvedValue({
      data: {
        customerId: VALID_CUSTOMER_ID,
        name: '홍길동',
        customerType: '개인',
        createdAt: '2026-04-03T00:00:00.000Z',
      },
      status: 200,
    });

    const result = await handleCreateCustomer({ name: '홍길동' });
    const parsed = parseSuccess(result);

    expect(parsed.success).toBe(true);
    expect(parsed.customerId).toBe(VALID_CUSTOMER_ID);
    expect(parsed.name).toBe('홍길동');
    expect(parsed.customerType).toBe('개인');
    expect(mockCreateCustomer).toHaveBeenCalledTimes(1);
    // userId가 전달되었는지 확인
    expect(mockCreateCustomer.mock.calls[0][0].userId).toBe('test-user-123');
  });

  it('이름 중복 409: isError 응답 반환', async () => {
    mockCreateCustomer.mockResolvedValue({
      data: null,
      status: 409,
      error: '같은 이름의 고객이 이미 존재합니다.',
    });

    const result = await handleCreateCustomer({ name: '홍길동' });
    assertError(result, '같은 이름');
  });

  it('네트워크 오류 500: isError 응답 반환', async () => {
    mockCreateCustomer.mockResolvedValue({
      data: null,
      status: 500,
      error: '네트워크 오류가 발생했습니다.',
    });

    const result = await handleCreateCustomer({ name: '테스트' });
    assertError(result, '네트워크 오류');
  });
});

// ============================================================
// handleUpdateCustomer
// ============================================================

describe('handleUpdateCustomer', () => {
  it('성공: 수정된 필드 목록과 함께 success 응답', async () => {
    mockUpdateCustomer.mockResolvedValue({
      data: {
        customerId: VALID_CUSTOMER_ID,
        updatedFields: ['name', 'phone'],
        message: '고객 정보가 수정되었습니다.',
      },
      status: 200,
    });

    const result = await handleUpdateCustomer({
      customerId: VALID_CUSTOMER_ID,
      name: '김철수',
      phone: '01012345678',
      phoneType: 'mobile',
    });
    const parsed = parseSuccess(result);

    expect(parsed.success).toBe(true);
    expect(parsed.updatedFields).toContain('name');
    expect(parsed.updatedFields).toContain('phone');
    expect(mockUpdateCustomer).toHaveBeenCalledTimes(1);
    // 첫 번째 인자가 customerId
    expect(mockUpdateCustomer.mock.calls[0][0]).toBe(VALID_CUSTOMER_ID);
  });

  it('고객 없음 404: isError 응답', async () => {
    mockUpdateCustomer.mockResolvedValue({
      data: null,
      status: 404,
      error: '고객을 찾을 수 없습니다.',
    });

    const result = await handleUpdateCustomer({
      customerId: VALID_CUSTOMER_ID,
      name: '없는고객',
    });
    assertError(result, '고객을 찾을 수 없');
  });
});

// ============================================================
// handleAddMemo
// ============================================================

describe('handleAddMemo', () => {
  it('성공: 소유권 확인 후 Internal API로 메모 생성', async () => {
    // verifyCustomerOwnership → Internal API queryCustomers
    mockQueryCustomers.mockResolvedValueOnce([{
      _id: new ObjectId(VALID_CUSTOMER_ID),
      personal_info: { name: '홍길동' },
      meta: { created_by: 'test-user-123' },
    }]);

    // createMemo 성공
    mockCreateMemo.mockResolvedValue({
      data: { memoId: VALID_MEMO_ID },
      status: 200,
    });

    // syncCustomerMemoField 내부: queryMemos → syncCustomerMemo
    mockQueryMemos.mockResolvedValueOnce([]);
    mockSyncCustomerMemo.mockResolvedValue({ data: { success: true }, status: 200 });

    const result = await handleAddMemo({
      customerId: VALID_CUSTOMER_ID,
      content: '테스트 메모입니다',
    });
    const parsed = parseSuccess(result);

    expect(parsed.success).toBe(true);
    expect(parsed.memoId).toBe(VALID_MEMO_ID);
    expect(parsed.customerName).toBe('홍길동');
    expect(parsed.syncWarning).toBeUndefined();
    expect(mockCreateMemo).toHaveBeenCalledTimes(1);
  });

  it('소유권 실패: 고객 없음 → Internal API 호출하지 않음', async () => {
    // verifyCustomerOwnership → 빈 배열 (고객 없음)
    mockQueryCustomers.mockResolvedValueOnce([]);

    const result = await handleAddMemo({
      customerId: VALID_CUSTOMER_ID,
      content: '메모 내용',
    });
    assertError(result, '고객을 찾을 수 없습니다');

    // Internal API 미호출 검증
    expect(mockCreateMemo).not.toHaveBeenCalled();
  });
});

// ============================================================
// handleDeleteMemo
// ============================================================

describe('handleDeleteMemo', () => {
  it('성공: 메모 삭제 + sync 성공', async () => {
    // verifyCustomerOwnership → Internal API queryCustomers
    mockQueryCustomers.mockResolvedValueOnce([{
      _id: new ObjectId(VALID_CUSTOMER_ID),
      personal_info: { name: '홍길동' },
    }]);

    // 삭제 전 메모 내용 조회 — Internal API getMemo
    mockGetMemo.mockResolvedValueOnce({
      _id: new ObjectId(VALID_MEMO_ID),
      content: '삭제될 메모',
      customer_id: new ObjectId(VALID_CUSTOMER_ID),
    });

    // deleteMemo 성공
    mockDeleteMemo.mockResolvedValue({
      data: { success: true },
      status: 200,
    });

    // syncCustomerMemoField 내부: queryMemos → syncCustomerMemo
    mockQueryMemos.mockResolvedValueOnce([]);
    mockSyncCustomerMemo.mockResolvedValue({ data: { success: true }, status: 200 });

    const result = await handleDeleteMemo({
      customerId: VALID_CUSTOMER_ID,
      memoId: VALID_MEMO_ID,
    });
    const parsed = parseSuccess(result);

    expect(parsed.success).toBe(true);
    expect(parsed.deletedMemo).toBe('삭제될 메모');
    expect(parsed.syncWarning).toBeUndefined();
    expect(mockDeleteMemo).toHaveBeenCalledTimes(1);
  });

  it('메모 없음 404: isError 응답', async () => {
    // verifyCustomerOwnership → 고객 존재
    mockQueryCustomers.mockResolvedValueOnce([{
      _id: new ObjectId(VALID_CUSTOMER_ID),
      personal_info: { name: '홍길동' },
    }]);

    // 삭제 전 메모 조회 → null
    mockGetMemo.mockResolvedValueOnce(null);

    // deleteMemo → 404
    mockDeleteMemo.mockResolvedValue({
      data: null,
      status: 404,
      error: '메모를 찾을 수 없습니다.',
    });

    const result = await handleDeleteMemo({
      customerId: VALID_CUSTOMER_ID,
      memoId: VALID_MEMO_ID,
    });
    assertError(result, '메모');
  });

  it('sync 경고: 삭제 성공이지만 syncCustomerMemo 실패 → syncWarning: true', async () => {
    // verifyCustomerOwnership
    mockQueryCustomers.mockResolvedValueOnce([{
      _id: new ObjectId(VALID_CUSTOMER_ID),
      personal_info: { name: '홍길동' },
    }]);

    // 삭제 전 메모 조회
    mockGetMemo.mockResolvedValueOnce({
      _id: new ObjectId(VALID_MEMO_ID),
      content: '동기화 실패 테스트',
      customer_id: new ObjectId(VALID_CUSTOMER_ID),
    });

    // deleteMemo 성공
    mockDeleteMemo.mockResolvedValue({
      data: { success: true },
      status: 200,
    });

    // syncCustomerMemoField 내부 — queryMemos → syncCustomerMemo 실패
    mockQueryMemos.mockResolvedValueOnce([]);
    mockSyncCustomerMemo.mockResolvedValue({ data: null, status: 500, error: 'sync 실패' });

    const result = await handleDeleteMemo({
      customerId: VALID_CUSTOMER_ID,
      memoId: VALID_MEMO_ID,
    });
    const parsed = parseSuccess(result);

    expect(parsed.success).toBe(true);
    expect(parsed.syncWarning).toBe(true);
  });
});

// ============================================================
// handleUpdateMemo
// ============================================================

describe('handleUpdateMemo', () => {
  it('성공: 소유권 확인 후 메모 수정', async () => {
    // verifyCustomerOwnership — Internal API queryCustomers
    mockQueryCustomers.mockResolvedValueOnce([{
      _id: new ObjectId(VALID_CUSTOMER_ID),
      personal_info: { name: '홍길동' },
    }]);

    // 수정 전 메모 조회 (previousContent용) — Internal API getMemo
    mockGetMemo.mockResolvedValueOnce({
      _id: new ObjectId(VALID_MEMO_ID),
      content: '이전 내용',
      customer_id: new ObjectId(VALID_CUSTOMER_ID),
    });

    // updateMemo 성공
    mockUpdateMemo.mockResolvedValue({
      data: { success: true },
      status: 200,
    });

    // syncCustomerMemoField — queryMemos → syncCustomerMemo
    mockQueryMemos.mockResolvedValueOnce([]);
    mockSyncCustomerMemo.mockResolvedValue({ data: { success: true }, status: 200 });

    const result = await handleUpdateMemo({
      customerId: VALID_CUSTOMER_ID,
      memoId: VALID_MEMO_ID,
      content: '수정된 내용',
    });
    const parsed = parseSuccess(result);

    expect(parsed.success).toBe(true);
    expect(parsed.previousContent).toBe('이전 내용');
    expect(parsed.newContent).toBe('수정된 내용');
    expect(mockUpdateMemo).toHaveBeenCalledTimes(1);
  });

  it('메모 없음 404: isError 응답', async () => {
    // verifyCustomerOwnership
    mockQueryCustomers.mockResolvedValueOnce([{
      _id: new ObjectId(VALID_CUSTOMER_ID),
      personal_info: { name: '홍길동' },
    }]);

    // 수정 전 메모 조회 → null
    mockGetMemo.mockResolvedValueOnce(null);

    // updateMemo → 404
    mockUpdateMemo.mockResolvedValue({
      data: null,
      status: 404,
      error: '메모를 찾을 수 없습니다.',
    });

    const result = await handleUpdateMemo({
      customerId: VALID_CUSTOMER_ID,
      memoId: VALID_MEMO_ID,
      content: '수정 시도',
    });
    assertError(result, '메모');
  });
});

// ============================================================
// handleCreateRelationship
// ============================================================

describe('handleCreateRelationship', () => {
  it('성공: 양방향 관계 생성', async () => {
    // fromCustomer, toCustomer 조회 (Promise.all) — Internal API queryCustomers
    mockQueryCustomers
      .mockResolvedValueOnce([{
        _id: new ObjectId(VALID_CUSTOMER_ID),
        personal_info: { name: '홍길동' },
      }])
      .mockResolvedValueOnce([{
        _id: new ObjectId(VALID_CUSTOMER_ID_2),
        personal_info: { name: '김영희' },
      }]);

    mockCreateRelationship.mockResolvedValue({
      data: {
        relationshipId: VALID_RELATIONSHIP_ID,
        reverseCreated: true,
      },
      status: 200,
    });

    const result = await handleCreateRelationship({
      fromCustomerId: VALID_CUSTOMER_ID,
      toCustomerId: VALID_CUSTOMER_ID_2,
      relationshipType: 'spouse',
    });
    const parsed = parseSuccess(result);

    expect(parsed.success).toBe(true);
    expect(parsed.relationshipId).toBe(VALID_RELATIONSHIP_ID);
    expect(parsed.reverseRelationCreated).toBe(true);
    expect(parsed.fromCustomer).toBe('홍길동');
    expect(parsed.toCustomer).toBe('김영희');
    expect(parsed.bidirectional).toBe(true);
    expect(mockCreateRelationship).toHaveBeenCalledTimes(1);
  });

  it('중복 409: isError 응답', async () => {
    // fromCustomer, toCustomer 조회
    mockQueryCustomers
      .mockResolvedValueOnce([{
        _id: new ObjectId(VALID_CUSTOMER_ID),
        personal_info: { name: '홍길동' },
      }])
      .mockResolvedValueOnce([{
        _id: new ObjectId(VALID_CUSTOMER_ID_2),
        personal_info: { name: '김영희' },
      }]);

    mockCreateRelationship.mockResolvedValue({
      data: null,
      status: 409,
      error: '이미 등록된 관계입니다.',
    });

    const result = await handleCreateRelationship({
      fromCustomerId: VALID_CUSTOMER_ID,
      toCustomerId: VALID_CUSTOMER_ID_2,
      relationshipType: 'spouse',
    });
    assertError(result, '이미 등록된');
  });
});

// ============================================================
// handleDeleteRelationship
// ============================================================

describe('handleDeleteRelationship', () => {
  it('relationshipId 모드 성공: 관계 삭제', async () => {
    const fromOid = new ObjectId(VALID_CUSTOMER_ID);
    const toOid = new ObjectId(VALID_CUSTOMER_ID_2);

    // 1) fromCustomer 조회 (고객 존재 + 소유권) — Internal API queryCustomers
    mockQueryCustomers
      .mockResolvedValueOnce([{
        _id: fromOid,
        personal_info: { name: '홍길동' },
      }])
      // 3) toCustomer 이름 조회
      .mockResolvedValueOnce([{
        _id: toOid,
        personal_info: { name: '김영희' },
      }]);

    // 2) relationship 조회 (관계 정보) — Internal API getRelationship
    mockGetRelationship.mockResolvedValueOnce({
      _id: new ObjectId(VALID_RELATIONSHIP_ID),
      relationship_info: {
        from_customer_id: fromOid,
        to_customer_id: toOid,
        relationship_type: 'spouse',
      },
    });

    mockDeleteRelationship.mockResolvedValue({
      data: { success: true, reverseDeleted: true },
      status: 200,
    });

    const result = await handleDeleteRelationship({
      fromCustomerId: VALID_CUSTOMER_ID,
      relationshipId: VALID_RELATIONSHIP_ID,
    });
    const parsed = parseSuccess(result);

    expect(parsed.success).toBe(true);
    expect(parsed.deletedRelationshipId).toBe(VALID_RELATIONSHIP_ID);
    expect(parsed.reverseRelationDeleted).toBe(true);
    expect(mockDeleteRelationship).toHaveBeenCalledTimes(1);
  });

  it('관계 없음 (toCustomerId 모드): 관계 미존재 → isError', async () => {
    const fromOid = new ObjectId(VALID_CUSTOMER_ID);
    const toOid = new ObjectId(VALID_CUSTOMER_ID_2);

    // 1) fromCustomer 조회
    mockQueryCustomers
      .mockResolvedValueOnce([{
        _id: fromOid,
        personal_info: { name: '홍길동' },
      }])
      // 2) toCustomer 조회
      .mockResolvedValueOnce([{
        _id: toOid,
        personal_info: { name: '김영희' },
      }]);

    // 3) 관계 조회 → 빈 배열 (관계 없음) — Internal API queryRelationships
    mockQueryRelationships.mockResolvedValueOnce([]);

    const result = await handleDeleteRelationship({
      fromCustomerId: VALID_CUSTOMER_ID,
      toCustomerId: VALID_CUSTOMER_ID_2,
    });
    assertError(result, '관계가 없습니다');

    // Internal API 미호출 검증
    expect(mockDeleteRelationship).not.toHaveBeenCalled();
  });
});
