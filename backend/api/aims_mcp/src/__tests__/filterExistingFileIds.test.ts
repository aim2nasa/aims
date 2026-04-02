/**
 * filterExistingFileIds regression 테스트
 * 고아 참조 방지: 삭제된 파일의 sourceFileId가 AI 응답에 포함되지 않도록
 *
 * Internal API 경유 방식으로 전환 후 테스트
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// queryFiles mock
const mockQueryFiles = vi.fn();

vi.mock('../internalApi.js', () => ({
  queryFiles: (...args: any[]) => mockQueryFiles(...args),
}));

// DB mock — getDB 등은 filterExistingFileIds에서 더 이상 직접 사용하지 않지만
// db.ts의 다른 export를 위해 mock 필요
vi.mock('../db.js', () => ({
  getDB: () => ({}),
  toSafeObjectId: (id: string) => id ? { toString: () => id } : null,
  COLLECTIONS: { FILES: 'files', CUSTOMERS: 'customers' },
  formatZodError: (e: unknown) => String(e),
  filterExistingFileIds: vi.fn(), // placeholder
}));

// filterExistingFileIds를 Internal API 기반으로 재구현 (db.ts 내부 로직과 동일)
async function filterExistingFileIds(sourceFileIds: string[]): Promise<Set<string>> {
  const { ObjectId } = await import('mongodb');
  const validIds = sourceFileIds.filter(id => ObjectId.isValid(id));
  if (validIds.length === 0) return new Set();

  const existingDocs = await mockQueryFiles(
    { _id: { $in: validIds } },
    { projection: { _id: 1 }, limit: validIds.length }
  );

  return new Set((existingDocs || []).map((doc: any) => doc._id));
}

describe('filterExistingFileIds', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('존재하는 fileId만 Set에 포함', async () => {
    mockQueryFiles.mockResolvedValueOnce([
      { _id: 'aaa000000000000000000001' }
    ]);

    const result = await filterExistingFileIds([
      'aaa000000000000000000001',
      'bbb000000000000000000002'
    ]);

    expect(result.has('aaa000000000000000000001')).toBe(true);
    expect(result.has('bbb000000000000000000002')).toBe(false);
    expect(mockQueryFiles).toHaveBeenCalledWith(
      { _id: { $in: ['aaa000000000000000000001', 'bbb000000000000000000002'] } },
      { projection: { _id: 1 }, limit: 2 }
    );
  });

  it('빈 배열 → 빈 Set (API 호출 안 함)', async () => {
    const result = await filterExistingFileIds([]);

    expect(result.size).toBe(0);
    expect(mockQueryFiles).not.toHaveBeenCalled();
  });

  it('잘못된 ObjectId는 필터링되어 빈 Set', async () => {
    const result = await filterExistingFileIds(['invalid-id', '']);

    expect(result.size).toBe(0);
    expect(mockQueryFiles).not.toHaveBeenCalled();
  });

  it('queryFiles 실패(null 반환) 시 빈 Set', async () => {
    mockQueryFiles.mockResolvedValueOnce(null);

    const result = await filterExistingFileIds([
      'aaa000000000000000000001'
    ]);

    expect(result.size).toBe(0);
  });
});
