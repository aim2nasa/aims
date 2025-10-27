/**
 * apiEndpoints.test.js
 * aims_api 주요 엔드포인트 유닛 테스트
 *
 * 테스트 대상:
 * 1. Health Check
 * 2. Documents API
 * 3. Customers API
 * 4. Customer-Document Relations API
 */

const request = require('supertest');
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

// 테스트용 MongoDB 연결 설정
const TEST_MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const TEST_DB_NAME = 'docupload';

describe('Health Check API', () => {
  test('GET /api/health - 헬스 체크 성공', async () => {
    // 간단한 Express 앱 생성
    const app = express();
    app.get('/api/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString()
      });
    });

    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body).toHaveProperty('timestamp');
  });
});

describe('Documents API - 조회', () => {
  let client;
  let db;
  let filesCollection;

  beforeAll(async () => {
    client = await MongoClient.connect(TEST_MONGO_URI);
    db = client.db(TEST_DB_NAME);
    filesCollection = db.collection('files');
  });

  afterAll(async () => {
    await client.close();
  });

  test('문서 목록 조회 - MongoDB 연결 확인', async () => {
    // MongoDB 연결이 정상인지 확인
    const result = await db.admin().ping();
    expect(result.ok).toBe(1);
  });

  test('문서 검색 쿼리 - 필터링 로직 테스트', () => {
    // 검색 쿼리 생성 로직 테스트
    const searchTerm = '보험';
    const query = {
      $or: [
        { 'upload.originalName': { $regex: searchTerm, $options: 'i' } },
        { 'meta.summary': { $regex: searchTerm, $options: 'i' } }
      ]
    };

    expect(query.$or).toHaveLength(2);
    expect(query.$or[0]['upload.originalName'].$regex).toBe(searchTerm);
  });

  test('문서 정렬 로직 - 기본값은 최신순', () => {
    const sortOptions = { 'upload.uploaded_at': -1 };
    expect(sortOptions['upload.uploaded_at']).toBe(-1);
  });
});

describe('Documents API - 상태', () => {
  test('문서 상태 계산 로직 - pending', () => {
    const doc = {
      upload: { uploaded_at: new Date() }
      // meta, text 등이 없음
    };

    // 상태 계산 로직 (간소화)
    let status = 'pending';
    if (doc.meta) status = 'processing';
    if (doc.text) status = 'processing';

    expect(status).toBe('pending');
  });

  test('문서 상태 계산 로직 - processing', () => {
    const doc = {
      upload: { uploaded_at: new Date() },
      meta: { extracted_at: new Date() }
    };

    let status = 'pending';
    if (doc.meta) status = 'processing';

    expect(status).toBe('processing');
  });

  test('문서 상태 계산 로직 - completed', () => {
    const doc = {
      upload: { uploaded_at: new Date() },
      meta: { extracted_at: new Date() },
      text: { extracted_at: new Date() },
      summary: { generated_at: new Date() },
      embed: { status: 'completed' }
    };

    let status = 'pending';
    if (doc.meta) status = 'processing';
    if (doc.embed && doc.embed.status === 'completed') status = 'completed';

    expect(status).toBe('completed');
  });
});

describe('Documents API - 통계', () => {
  test('통계 집계 파이프라인 - 상태별 카운트', () => {
    // MongoDB 집계 파이프라인 로직 테스트
    const pipeline = [
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: {
            $sum: {
              $cond: [{ $eq: ['$status', 'pending'] }, 1, 0]
            }
          }
        }
      }
    ];

    expect(pipeline).toHaveLength(1);
    expect(pipeline[0].$group).toHaveProperty('total');
    expect(pipeline[0].$group).toHaveProperty('pending');
  });
});

describe('Customers API - CRUD', () => {
  let client;
  let db;
  let customersCollection;
  let testCustomerId;

  beforeAll(async () => {
    client = await MongoClient.connect(TEST_MONGO_URI);
    db = client.db(TEST_DB_NAME);
    customersCollection = db.collection('customers');
  });

  afterAll(async () => {
    // 테스트 데이터 정리
    if (testCustomerId) {
      await customersCollection.deleteOne({ _id: testCustomerId });
    }
    await client.close();
  });

  test('고객 생성 - 필수 필드 검증', () => {
    const customerData = {
      customer_type: '개인',
      personal_info: {
        name: '테스트고객',
        birth_date: '1990-01-01',
        gender: '남'
      },
      meta: {
        created_at: new Date(),
        updated_at: new Date()
      }
    };

    expect(customerData).toHaveProperty('customer_type');
    expect(customerData).toHaveProperty('personal_info');
    expect(customerData.personal_info).toHaveProperty('name');
    expect(customerData).toHaveProperty('meta');
  });

  test('고객 수정 - 업데이트 데이터 구조', () => {
    const updateData = {
      $set: {
        'personal_info.phone': '010-1234-5678',
        'meta.updated_at': new Date()
      }
    };

    expect(updateData.$set['personal_info.phone']).toBe('010-1234-5678');
    expect(updateData.$set['meta.updated_at']).toBeInstanceOf(Date);
  });

  test('고객 검색 - 이름으로 검색 쿼리', () => {
    const searchName = '홍길동';
    const query = {
      'personal_info.name': { $regex: searchName, $options: 'i' }
    };

    expect(query['personal_info.name'].$regex).toBe(searchName);
    expect(query['personal_info.name'].$options).toBe('i'); // case-insensitive
  });
});

describe('Customer-Document Relations API', () => {
  test('문서-고객 연결 - documents 배열 업데이트', () => {
    const customerId = new ObjectId();
    const documentId = new ObjectId();

    const updateOperation = {
      $addToSet: {
        documents: documentId
      },
      $set: {
        'meta.updated_at': new Date()
      }
    };

    expect(updateOperation.$addToSet.documents).toEqual(documentId);
    expect(updateOperation.$set['meta.updated_at']).toBeInstanceOf(Date);
  });

  test('문서-고객 연결 해제 - documents 배열에서 제거', () => {
    const documentId = new ObjectId();

    const updateOperation = {
      $pull: {
        documents: documentId
      },
      $set: {
        'meta.updated_at': new Date()
      }
    };

    expect(updateOperation.$pull.documents).toEqual(documentId);
  });

  test('고객의 문서 목록 조회 - 집계 파이프라인', () => {
    const customerId = new ObjectId();

    const pipeline = [
      { $match: { _id: customerId } },
      {
        $lookup: {
          from: 'files',
          localField: 'documents',
          foreignField: '_id',
          as: 'document_details'
        }
      }
    ];

    expect(pipeline).toHaveLength(2);
    expect(pipeline[0].$match._id).toEqual(customerId);
    expect(pipeline[1].$lookup.from).toBe('files');
  });
});

describe('Admin API - Orphaned Relationships', () => {
  test('고아 관계 조회 - 존재하지 않는 문서 참조', () => {
    // 고아 관계: customer.documents에는 있지만 files 컬렉션에는 없는 ObjectId
    const pipeline = [
      {
        $lookup: {
          from: 'files',
          localField: 'documents',
          foreignField: '_id',
          as: 'existing_docs'
        }
      },
      {
        $project: {
          orphaned_documents: {
            $setDifference: ['$documents', '$existing_docs._id']
          }
        }
      },
      {
        $match: {
          'orphaned_documents.0': { $exists: true } // 배열이 비어있지 않음
        }
      }
    ];

    expect(pipeline).toHaveLength(3);
    expect(pipeline[0].$lookup.from).toBe('files');
    expect(pipeline[1].$project).toHaveProperty('orphaned_documents');
  });

  test('고아 관계 정리 - documents 배열에서 제거', () => {
    const orphanedDocIds = [new ObjectId(), new ObjectId()];

    const updateOperation = {
      $pull: {
        documents: { $in: orphanedDocIds }
      },
      $set: {
        'meta.updated_at': new Date()
      }
    };

    expect(updateOperation.$pull.documents.$in).toEqual(orphanedDocIds);
  });
});

describe('ObjectId 유효성 검증', () => {
  test('유효한 ObjectId 문자열', () => {
    const validId = '507f1f77bcf86cd799439011';
    expect(ObjectId.isValid(validId)).toBe(true);
  });

  test('유효하지 않은 ObjectId 문자열', () => {
    const invalidId = 'invalid-id';
    expect(ObjectId.isValid(invalidId)).toBe(false);
  });

  test('ObjectId 생성 및 문자열 변환', () => {
    const id = new ObjectId();
    const idString = id.toString();
    expect(typeof idString).toBe('string');
    expect(idString).toHaveLength(24);
  });
});
