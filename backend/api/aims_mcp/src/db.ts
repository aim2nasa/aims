import { MongoClient, Db, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import { ZodError, ZodIssue } from 'zod';

// 공유 스키마에서 import - 모든 백엔드 서비스가 동일한 정의 사용
export { COLLECTIONS, CUSTOMER_FIELDS, CUSTOMER_TYPES, CUSTOMER_STATUS } from '@aims/shared-schema';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://tars:27017/';
const DB_NAME = process.env.DB_NAME || 'docupload';

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * MongoDB 연결
 */
export async function connectDB(): Promise<Db> {
  if (db) return db;

  try {
    client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db(DB_NAME);
    console.error(`[aims-mcp] MongoDB 연결 성공: ${DB_NAME}`);
    return db;
  } catch (error) {
    console.error('[aims-mcp] MongoDB 연결 실패:', error);
    throw error;
  }
}

/**
 * DB 인스턴스 반환
 */
export function getDB(): Db {
  if (!db) {
    throw new Error('Database not connected. Call connectDB() first.');
  }
  return db;
}

/**
 * MongoDB 연결 종료
 */
export async function closeDB(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.error('[aims-mcp] MongoDB 연결 종료');
  }
}

/**
 * 안전한 ObjectId 변환
 */
export function toSafeObjectId(id: string | ObjectId): ObjectId | null {
  if (id instanceof ObjectId) return id;
  if (typeof id === 'string' && ObjectId.isValid(id)) {
    return new ObjectId(id);
  }
  return null;
}

/**
 * 정규식 특수문자 이스케이프
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * sourceFileId 배열 중 files 컬렉션에 실제 존재하는 ID만 반환
 * (고아 참조 방지: 삭제된 파일의 sourceFileId가 AI 응답에 포함되지 않도록)
 */
export async function filterExistingFileIds(sourceFileIds: string[]): Promise<Set<string>> {
  const validIds = sourceFileIds.filter(id => ObjectId.isValid(id));
  if (validIds.length === 0) return new Set();

  const db = getDB();
  const objectIds = validIds.map(id => new ObjectId(id));
  const existingDocs = await db.collection('files')
    .find({ _id: { $in: objectIds } }, { projection: { _id: 1 } })
    .toArray();

  return new Set(existingDocs.map(doc => doc._id.toString()));
}

// 컬렉션 이름 상수는 @aims/shared-schema에서 import됨 (상단 참조)

// 필드명 한글 매핑
const FIELD_NAME_MAP: Record<string, string> = {
  name: '이름',
  phone: '전화번호',
  email: '이메일',
  customerId: '고객 ID',
  contractId: '계약 ID',
  documentId: '문서 ID',
  memoId: '메모 ID',
  productId: '상품 ID',
  content: '내용',
  query: '검색어',
  limit: '결과 개수',
  month: '월',
  day: '일',
  birthDate: '생년월일',
  address: '주소',
  customerType: '고객 유형',
  status: '상태',
  search: '검색어',
  searchMode: '검색 모드',
  daysWithin: '기간(일)'
};

/**
 * Zod 이슈를 친절한 한글 메시지로 변환
 */
function formatZodIssue(issue: ZodIssue): string {
  const fieldPath = issue.path.join('.');
  const fieldName = FIELD_NAME_MAP[fieldPath] || fieldPath || '입력값';

  switch (issue.code) {
    case 'invalid_type':
      if (issue.received === 'undefined') {
        return `${fieldName}을(를) 입력해주세요.`;
      }
      return `${fieldName}의 형식이 올바르지 않습니다.`;
    case 'too_small':
      if (issue.type === 'string') {
        return `${fieldName}을(를) 입력해주세요.`;
      }
      return `${fieldName}이(가) 너무 작습니다.`;
    case 'too_big':
      return `${fieldName}이(가) 너무 큽니다.`;
    case 'invalid_enum_value':
      return `${fieldName}의 값이 올바르지 않습니다.`;
    case 'invalid_string':
      if (issue.validation === 'email') {
        return `올바른 이메일 형식이 아닙니다.`;
      }
      return `${fieldName}의 형식이 올바르지 않습니다.`;
    default:
      return `${fieldName}: 입력값을 확인해주세요.`;
  }
}

/**
 * Zod 에러를 사용자 친화적인 한글 메시지로 변환
 */
export function formatZodError(error: ZodError): string {
  const messages = error.issues.map(formatZodIssue);
  return messages.join(' ');
}
