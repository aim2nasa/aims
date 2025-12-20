import { MongoClient, Db, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

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

// 컬렉션 이름 상수
export const COLLECTIONS = {
  CUSTOMERS: 'customers',
  CONTRACTS: 'contracts',
  FILES: 'files',
  CUSTOMER_RELATIONSHIPS: 'customer_relationships',
  INSURANCE_PRODUCTS: 'insurance_products'
} as const;
