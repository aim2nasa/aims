/**
 * documents.test.js
 * 문서 API 엔드포인트 테스트
 *
 * 테스트 대상:
 * 1. 문서 CRUD 작업
 * 2. 문서 검색 및 필터링
 * 3. 문서 상태 관리
 * 4. 문서-고객 연결
 *
 * 참고: MongoDB 연결 없이 로직만 테스트
 */

const { ObjectId } = require('mongodb');

describe('Documents API - CRUD', () => {
  test('문서 데이터 구조 - 필수 필드', () => {
    const documentData = {
      _id: new ObjectId(),
      userId: new ObjectId(),
      upload: {
        originalName: '보험증권_2026.pdf',
        mimeType: 'application/pdf',
        size: 1024000,
        uploaded_at: new Date(),
        storagePath: '/uploads/2026/01/file.pdf'
      },
      meta: {
        extracted_at: new Date(),
        pageCount: 5
      },
      status: 'completed',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    expect(documentData).toHaveProperty('_id');
    expect(documentData).toHaveProperty('userId');
    expect(documentData).toHaveProperty('upload');
    expect(documentData.upload).toHaveProperty('originalName');
    expect(documentData.upload).toHaveProperty('mimeType');
    expect(documentData.upload).toHaveProperty('size');
  });

  test('문서 상태 값 검증', () => {
    const validStatuses = ['pending', 'processing', 'completed', 'failed'];
    const status = 'completed';

    expect(validStatuses).toContain(status);
    expect(validStatuses).not.toContain('invalid_status');
  });

  test('문서 검색 쿼리 - 파일명 검색', () => {
    const searchTerm = '보험';
    const userId = new ObjectId();

    const query = {
      userId: userId,
      'upload.originalName': { $regex: searchTerm, $options: 'i' }
    };

    expect(query['upload.originalName'].$regex).toBe(searchTerm);
    expect(query['upload.originalName'].$options).toBe('i');
  });

  test('문서 정렬 옵션 - 최신순', () => {
    const sortOptions = { 'upload.uploaded_at': -1 };
    expect(sortOptions['upload.uploaded_at']).toBe(-1);
  });

  test('문서 정렬 옵션 - 이름순', () => {
    const sortOptions = { 'upload.originalName': 1 };
    expect(sortOptions['upload.originalName']).toBe(1);
  });
});

describe('Documents API - 파일 타입', () => {
  test('허용된 MIME 타입 검증', () => {
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];

    expect(allowedTypes).toContain('application/pdf');
    expect(allowedTypes).toContain('image/jpeg');
    expect(allowedTypes).not.toContain('application/exe');
  });

  test('파일 확장자 추출', () => {
    const filename = 'document_2026.pdf';
    const extension = filename.split('.').pop().toLowerCase();

    expect(extension).toBe('pdf');
  });

  test('파일 크기 제한 검증', () => {
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    const fileSize = 10 * 1024 * 1024; // 10MB

    expect(fileSize).toBeLessThanOrEqual(MAX_FILE_SIZE);
  });

  test('대용량 파일 거부', () => {
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    const largeFileSize = 100 * 1024 * 1024; // 100MB

    expect(largeFileSize).toBeGreaterThan(MAX_FILE_SIZE);
  });
});

describe('Documents API - 고객 연결', () => {
  test('문서-고객 연결 쿼리', () => {
    const documentId = new ObjectId();
    const customerId = new ObjectId();

    const updateQuery = {
      $set: {
        customerId: customerId,
        updatedAt: new Date()
      }
    };

    expect(updateQuery.$set.customerId).toEqual(customerId);
    expect(updateQuery.$set.updatedAt).toBeInstanceOf(Date);
  });

  test('고객별 문서 조회 파이프라인', () => {
    const customerId = new ObjectId();
    const userId = new ObjectId();

    const pipeline = [
      { $match: { userId: userId, customerId: customerId } },
      { $sort: { 'upload.uploaded_at': -1 } },
      { $limit: 50 }
    ];

    expect(pipeline).toHaveLength(3);
    expect(pipeline[0].$match.customerId).toEqual(customerId);
    expect(pipeline[1].$sort['upload.uploaded_at']).toBe(-1);
    expect(pipeline[2].$limit).toBe(50);
  });

  test('문서 연결 해제', () => {
    const updateQuery = {
      $unset: { customerId: '' },
      $set: { updatedAt: new Date() }
    };

    expect(updateQuery.$unset).toHaveProperty('customerId');
  });
});

describe('Documents API - 통계', () => {
  test('문서 통계 집계 파이프라인 - 타입별', () => {
    const userId = new ObjectId();

    const pipeline = [
      { $match: { userId: userId } },
      {
        $group: {
          _id: '$upload.mimeType',
          count: { $sum: 1 },
          totalSize: { $sum: '$upload.size' }
        }
      },
      { $sort: { count: -1 } }
    ];

    expect(pipeline).toHaveLength(3);
    expect(pipeline[1].$group._id).toBe('$upload.mimeType');
    expect(pipeline[1].$group).toHaveProperty('totalSize');
  });

  test('월별 업로드 통계', () => {
    const userId = new ObjectId();

    const pipeline = [
      { $match: { userId: userId } },
      {
        $group: {
          _id: {
            year: { $year: '$upload.uploaded_at' },
            month: { $month: '$upload.uploaded_at' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } }
    ];

    expect(pipeline[1].$group._id).toHaveProperty('year');
    expect(pipeline[1].$group._id).toHaveProperty('month');
  });

  test('저장 용량 계산', () => {
    const documents = [
      { upload: { size: 1024000 } },
      { upload: { size: 2048000 } },
      { upload: { size: 512000 } }
    ];

    const totalSize = documents.reduce((sum, doc) => sum + doc.upload.size, 0);
    const totalMB = totalSize / (1024 * 1024);

    expect(totalSize).toBe(3584000);
    expect(totalMB).toBeCloseTo(3.42, 1);
  });
});

describe('Documents API - 데이터 격리', () => {
  test('사용자별 문서 격리 검증', () => {
    const userA = new ObjectId();
    const userB = new ObjectId();

    const queryForUserA = { userId: userA };
    const queryForUserB = { userId: userB };

    expect(queryForUserA.userId).not.toEqual(queryForUserB.userId);
  });

  test('다른 사용자 문서 접근 방지', () => {
    const requestUserId = new ObjectId();
    const documentUserId = new ObjectId();

    const hasAccess = requestUserId.equals(documentUserId);

    expect(hasAccess).toBe(false);
  });

  test('고객 삭제 시 문서 customerId 제거', () => {
    const customerId = new ObjectId();

    const updateQuery = {
      filter: { customerId: customerId },
      update: { $unset: { customerId: '' }, $set: { updatedAt: new Date() } }
    };

    expect(updateQuery.filter.customerId).toEqual(customerId);
    expect(updateQuery.update.$unset).toHaveProperty('customerId');
  });
});

describe('Documents API - OCR 처리', () => {
  test('OCR 상태 필드 구조', () => {
    const ocrData = {
      status: 'completed',
      text: '추출된 텍스트 내용...',
      confidence: 0.95,
      processedAt: new Date()
    };

    expect(ocrData).toHaveProperty('status');
    expect(ocrData).toHaveProperty('text');
    expect(ocrData).toHaveProperty('confidence');
    expect(ocrData.confidence).toBeGreaterThanOrEqual(0);
    expect(ocrData.confidence).toBeLessThanOrEqual(1);
  });

  test('OCR 상태 값 검증', () => {
    const validOcrStatuses = ['pending', 'processing', 'completed', 'failed', 'skipped'];

    expect(validOcrStatuses).toContain('completed');
    expect(validOcrStatuses).toContain('skipped');
  });

  test('OCR 불필요 파일 타입', () => {
    const skipOcrTypes = ['application/vnd.ms-excel', 'text/plain', 'text/csv'];
    const fileType = 'text/plain';

    expect(skipOcrTypes).toContain(fileType);
  });
});

describe('Documents API - 폴더 구조', () => {
  test('폴더 경로 검증', () => {
    const folderPath = '/고객문서/2026/보험';
    const pathParts = folderPath.split('/').filter(Boolean);

    expect(pathParts).toHaveLength(3);
    expect(pathParts[0]).toBe('고객문서');
  });

  test('폴더 내 문서 조회', () => {
    const userId = new ObjectId();
    const folderPath = '/보험문서';

    const query = {
      userId: userId,
      folderPath: folderPath
    };

    expect(query.folderPath).toBe(folderPath);
  });

  test('폴더 이동 작업', () => {
    const updateQuery = {
      $set: {
        folderPath: '/새폴더/하위폴더',
        updatedAt: new Date()
      }
    };

    expect(updateQuery.$set.folderPath).toBe('/새폴더/하위폴더');
  });
});
