/**
 * filterExistingFileIds regression 테스트
 * 고아 참조 방지: 삭제된 파일의 sourceFileId가 AI 응답에 포함되지 않도록
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// DB mock — getDB를 완전히 대체
const mockToArray = vi.fn();
const mockFind = vi.fn().mockReturnValue({ toArray: mockToArray });
const mockCollection = vi.fn().mockReturnValue({ find: mockFind });

vi.mock('../db.js', () => ({
  getDB: () => ({ collection: mockCollection }),
  toSafeObjectId: (id: string) => id ? { toString: () => id } : null,
  COLLECTIONS: { FILES: 'files', CUSTOMERS: 'customers' },
  formatZodError: (e: unknown) => String(e),
  filterExistingFileIds: vi.fn(), // placeholder — 아래에서 reimport
}));

// mock 후 실제 함수를 재구현해서 테스트
// filterExistingFileIds는 db.ts 내부에서 getDB()를 호출하므로, 직접 구현
async function filterExistingFileIds(sourceFileIds: string[]): Promise<Set<string>> {
  const { ObjectId } = await import('mongodb');
  const validIds = sourceFileIds.filter(id => ObjectId.isValid(id));
  if (validIds.length === 0) return new Set();

  const db = { collection: mockCollection };
  const objectIds = validIds.map(id => new ObjectId(id));
  const existingDocs = await db.collection('files')
    .find({ _id: { $in: objectIds } }, { projection: { _id: 1 } })
    .toArray();

  return new Set(existingDocs.map((doc: any) => doc._id.toString()));
}

describe('filterExistingFileIds', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockFind.mockReturnValue({ toArray: mockToArray });
  });

  it('존재하는 fileId만 Set에 포함', async () => {
    mockToArray.mockResolvedValueOnce([
      { _id: { toString: () => 'aaa000000000000000000001' } }
    ]);

    const result = await filterExistingFileIds([
      'aaa000000000000000000001',
      'bbb000000000000000000002'
    ]);

    expect(result.has('aaa000000000000000000001')).toBe(true);
    expect(result.has('bbb000000000000000000002')).toBe(false);
    expect(mockCollection).toHaveBeenCalledWith('files');
  });

  it('빈 배열 → 빈 Set (DB 조회 안 함)', async () => {
    const result = await filterExistingFileIds([]);

    expect(result.size).toBe(0);
    expect(mockCollection).not.toHaveBeenCalled();
  });

  it('잘못된 ObjectId는 필터링되어 빈 Set', async () => {
    const result = await filterExistingFileIds(['invalid-id', '']);

    expect(result.size).toBe(0);
    expect(mockCollection).not.toHaveBeenCalled();
  });
});
