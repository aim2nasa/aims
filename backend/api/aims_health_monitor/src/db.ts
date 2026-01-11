/**
 * MongoDB 독립 연결 모듈
 * aims_api에 의존하지 않고 직접 연결
 */

import { MongoClient, Db, Collection, Document } from 'mongodb';
import { config } from './config';

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * MongoDB 연결
 */
export async function connectDB(): Promise<Db> {
  if (db) return db;

  try {
    console.log(`[HealthMonitor] MongoDB 연결 시도: ${config.mongoUri}${config.dbName}`);

    client = new MongoClient(config.mongoUri, {
      maxPoolSize: 5,
      minPoolSize: 1,
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 10000
    });

    await client.connect();
    db = client.db(config.dbName);

    console.log('[HealthMonitor] MongoDB 연결 성공');
    return db;
  } catch (error) {
    console.error('[HealthMonitor] MongoDB 연결 실패:', error);
    throw error;
  }
}

/**
 * DB 인스턴스 반환
 */
export function getDB(): Db {
  if (!db) {
    throw new Error('[HealthMonitor] DB 미연결 - connectDB() 먼저 호출 필요');
  }
  return db;
}

/**
 * 컬렉션 반환
 */
export function getCollection<T extends Document>(name: string): Collection<T> {
  return getDB().collection<T>(name);
}

/**
 * MongoDB 연결 종료
 */
export async function closeDB(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('[HealthMonitor] MongoDB 연결 종료');
  }
}

/**
 * 연결 상태 확인
 */
export function isConnected(): boolean {
  return db !== null;
}
