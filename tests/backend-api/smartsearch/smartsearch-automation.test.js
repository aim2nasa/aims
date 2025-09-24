/**
 * SmartSearch Webhook 자동화 테스트
 * DB 시드 → 엔드포인트 호출 → 기대값과 비교 → 정리
 */

const { MongoClient, ObjectId } = require('mongodb');
const fetch = require('node-fetch');

// 테스트 설정
const TEST_CONFIG = {
  MONGO_URI: 'mongodb://tars:27017/',
  DB_NAME: 'docupload',
  COLLECTION_NAME: 'files',
  WEBHOOK_URL: 'https://n8nd.giize.com/webhook/smartsearch',
  TEST_PREFIX: 'TEST_SMARTSEARCH_' // 테스트 데이터 식별을 위한 접두사
};

// 테스트용 시드 데이터
const SEED_DOCUMENTS = [
  {
    _id: new ObjectId(),
    upload: {
      originalName: `${TEST_CONFIG.TEST_PREFIX}보험청구서_001.pdf`,
      uploaded_at: new Date(),
      destPath: `/uploads/test_${Date.now()}_1.pdf`
    },
    meta: {
      mime: 'application/pdf',
      size_bytes: 1024000,
      created_at: new Date(),
      meta_status: 'ok'
    },
    ocr: {
      status: 'done',
      done_at: new Date(),
      confidence: 95
    },
    docembed: {
      status: 'done',
      chunks: 15,
      dims: 384,
      updated_at: new Date()
    },
    text: {
      full_text: '보험청구서입니다. 피보험자: 홍길동, 사고일: 2024-01-15, 청구금액: 500,000원'
    }
  },
  {
    _id: new ObjectId(),
    upload: {
      originalName: `${TEST_CONFIG.TEST_PREFIX}진단서_002.pdf`,
      uploaded_at: new Date(),
      destPath: `/uploads/test_${Date.now()}_2.pdf`
    },
    meta: {
      mime: 'application/pdf',
      size_bytes: 512000,
      created_at: new Date(),
      meta_status: 'ok'
    },
    ocr: {
      status: 'done',
      done_at: new Date(),
      confidence: 88
    },
    docembed: {
      status: 'done',
      chunks: 8,
      dims: 384,
      updated_at: new Date()
    },
    text: {
      full_text: '의사진단서입니다. 환자: 김영희, 진단명: 급성 위염, 진료일: 2024-01-20'
    }
  },
  {
    _id: new ObjectId(),
    upload: {
      originalName: `${TEST_CONFIG.TEST_PREFIX}사고경위서_003.jpg`,
      uploaded_at: new Date(),
      destPath: `/uploads/test_${Date.now()}_3.jpg`
    },
    meta: {
      mime: 'image/jpeg',
      size_bytes: 2048000,
      created_at: new Date(),
      meta_status: 'ok'
    },
    ocr: {
      status: 'done',
      done_at: new Date(),
      confidence: 92
    },
    docembed: {
      status: 'done',
      chunks: 12,
      dims: 384,
      updated_at: new Date()
    },
    text: {
      full_text: '교통사고 경위서입니다. 사고위치: 서울시 강남구, 사고시간: 2024-01-10 14:30'
    }
  }
];

class SmartSearchTestSuite {
  constructor() {
    this.client = null;
    this.db = null;
    this.insertedIds = [];
  }

  /**
   * 테스트 시작 - MongoDB 연결
   */
  async setup() {
    console.log('🔧 테스트 환경 설정 중...');

    this.client = new MongoClient(TEST_CONFIG.MONGO_URI);
    await this.client.connect();
    this.db = this.client.db(TEST_CONFIG.DB_NAME);

    console.log('✅ MongoDB 연결 완료');
  }

  /**
   * 시드 데이터 삽입
   */
  async seedData() {
    console.log('🌱 시드 데이터 삽입 중...');

    try {
      const result = await this.db.collection(TEST_CONFIG.COLLECTION_NAME)
        .insertMany(SEED_DOCUMENTS);

      this.insertedIds = Object.values(result.insertedIds);
      console.log(`✅ ${this.insertedIds.length}개 테스트 문서 삽입 완료`);

      // 삽입된 문서들의 ID 출력 (디버깅용)
      this.insertedIds.forEach((id, index) => {
        console.log(`   📄 ${index + 1}: ${id} (${SEED_DOCUMENTS[index].upload.originalName})`);
      });

      return this.insertedIds;
    } catch (error) {
      console.error('❌ 시드 데이터 삽입 실패:', error);
      throw error;
    }
  }

  /**
   * SmartSearch 웹훅 호출 테스트
   */
  async testSmartSearchEndpoint(query, expectedResultCount = null) {
    console.log(`🔍 SmartSearch 테스트: "${query}"`);

    try {
      const requestBody = {
        query: query,
        limit: 10,
        similarity_threshold: 0.3,
        test_mode: true // 테스트 모드 식별
      };

      console.log('📤 요청 데이터:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(TEST_CONFIG.WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'AIMS-SmartSearch-Test/1.0'
        },
        body: JSON.stringify(requestBody),
        timeout: 30000 // 30초 타임아웃
      });

      console.log(`📥 응답 상태: ${response.status}`);

      const responseData = await response.json();
      console.log('📋 응답 데이터:', JSON.stringify(responseData, null, 2));

      // 기본적인 응답 검증
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseData.error || '알 수 없는 오류'}`);
      }

      // 응답 구조 검증 - SmartSearch가 배열을 직접 반환
      let results = responseData;
      if (!Array.isArray(responseData)) {
        if (responseData.results && Array.isArray(responseData.results)) {
          results = responseData.results;
        } else {
          throw new Error('응답이 배열 형식이 아닙니다.');
        }
      }

      // 예상 결과 수 검증 (선택적)
      if (expectedResultCount !== null && results.length !== expectedResultCount) {
        console.warn(`⚠️ 예상 결과 수 ${expectedResultCount}개, 실제 ${results.length}개`);
      }

      // 테스트 문서가 결과에 포함되었는지 확인
      const foundTestDocs = results.filter(result =>
        (result.upload?.originalName && result.upload.originalName.includes(TEST_CONFIG.TEST_PREFIX)) ||
        (result.title && result.title.includes(TEST_CONFIG.TEST_PREFIX))
      );

      console.log(`✅ 검색 성공: ${results.length}개 결과, ${foundTestDocs.length}개 테스트 문서 발견`);

      return {
        success: true,
        query: query,
        totalResults: results.length,
        testDocsFound: foundTestDocs.length,
        results: results,
        responseTime: responseData.response_time || null
      };

    } catch (error) {
      console.error(`❌ SmartSearch 테스트 실패 (쿼리: "${query}"):`, error.message);
      return {
        success: false,
        query: query,
        error: error.message
      };
    }
  }

  /**
   * 여러 쿼리로 테스트 실행
   */
  async runTestQueries() {
    console.log('📊 다양한 쿼리로 테스트 실행...');

    const testQueries = [
      { query: '보험청구서', expectedDocs: 1 },
      { query: '진단서', expectedDocs: 1 },
      { query: '사고', expectedDocs: 1 },
      { query: '홍길동', expectedDocs: 1 },
      { query: '교통사고', expectedDocs: 1 },
      { query: '존재하지않는문서', expectedDocs: 0 }
    ];

    const results = [];

    for (const testCase of testQueries) {
      const result = await this.testSmartSearchEndpoint(testCase.query, testCase.expectedDocs);
      results.push(result);

      // 테스트 간 간격
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
  }

  /**
   * 스냅샷 비교 (기대값과 실제 결과 비교)
   */
  compareWithSnapshot(results, expectedSnapshot = null) {
    console.log('📸 스냅샷 비교 중...');

    if (!expectedSnapshot) {
      // 첫 번째 실행 시 스냅샷 생성
      console.log('📝 새로운 스냅샷 생성');
      return {
        isMatch: true,
        snapshot: results,
        message: '새로운 기준 스냅샷이 생성되었습니다.'
      };
    }

    // 스냅샷 비교 로직
    const mismatches = [];

    results.forEach((result, index) => {
      const expected = expectedSnapshot[index];
      if (!expected) {
        mismatches.push(`인덱스 ${index}: 예상 결과 없음`);
        return;
      }

      if (result.success !== expected.success) {
        mismatches.push(`인덱스 ${index}: success 불일치 (${result.success} vs ${expected.success})`);
      }

      if (result.testDocsFound !== expected.testDocsFound) {
        mismatches.push(`인덱스 ${index}: testDocsFound 불일치 (${result.testDocsFound} vs ${expected.testDocsFound})`);
      }
    });

    const isMatch = mismatches.length === 0;

    console.log(isMatch ? '✅ 스냅샷 일치' : `❌ 스냅샷 불일치: ${mismatches.length}개 차이점`);

    return {
      isMatch,
      mismatches,
      currentResults: results,
      expectedSnapshot
    };
  }

  /**
   * 테스트 데이터 정리 (삭제)
   */
  async cleanup() {
    console.log('🧹 테스트 데이터 정리 중...');

    try {
      if (this.insertedIds.length > 0) {
        // 삽입된 특정 문서들 삭제
        const deleteResult = await this.db.collection(TEST_CONFIG.COLLECTION_NAME)
          .deleteMany({ _id: { $in: this.insertedIds } });

        console.log(`✅ ${deleteResult.deletedCount}개 테스트 문서 삭제 완료`);
      } else {
        // 접두사로 테스트 문서 삭제 (fallback)
        const deleteResult = await this.db.collection(TEST_CONFIG.COLLECTION_NAME)
          .deleteMany({
            'upload.originalName': {
              $regex: `^${TEST_CONFIG.TEST_PREFIX}`,
              $options: 'i'
            }
          });

        console.log(`✅ ${deleteResult.deletedCount}개 테스트 문서 삭제 완료 (접두사 기준)`);
      }
    } catch (error) {
      console.error('❌ 테스트 데이터 정리 실패:', error);
      throw error;
    }
  }

  /**
   * MongoDB 연결 종료
   */
  async teardown() {
    console.log('🔚 테스트 환경 정리 중...');

    if (this.client) {
      await this.client.close();
      console.log('✅ MongoDB 연결 종료');
    }
  }

  /**
   * 전체 테스트 실행 (메인 워크플로우)
   */
  async runFullTest(expectedSnapshot = null) {
    console.log('\n🚀🚀🚀 SmartSearch 자동화 테스트 시작 🚀🚀🚀\n');

    let results = null;
    let comparison = null;

    try {
      // 1. 환경 설정
      await this.setup();

      // 2. 시드 데이터 삽입
      await this.seedData();

      // 3. 잠시 대기 (인덱싱 시간)
      console.log('⏳ 인덱싱 대기 중...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 4. 테스트 쿼리 실행
      results = await this.runTestQueries();

      // 5. 스냅샷 비교
      comparison = this.compareWithSnapshot(results, expectedSnapshot);

      // 6. 결과 요약
      this.printTestSummary(results, comparison);

    } catch (error) {
      console.error('🚨 테스트 실행 중 오류:', error);
    } finally {
      // 7. 정리 (항상 실행)
      try {
        await this.cleanup();
        await this.teardown();
      } catch (cleanupError) {
        console.error('🚨 정리 중 오류:', cleanupError);
      }
    }

    console.log('\n🏁🏁🏁 SmartSearch 자동화 테스트 완료 🏁🏁🏁\n');

    return {
      results,
      comparison,
      success: comparison ? comparison.isMatch : false
    };
  }

  /**
   * 테스트 결과 요약 출력
   */
  printTestSummary(results, comparison) {
    console.log('\n📊 === 테스트 결과 요약 ===');
    console.log(`총 쿼리 수: ${results.length}`);

    const successCount = results.filter(r => r.success).length;
    console.log(`성공한 쿼리: ${successCount}/${results.length}`);

    results.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      console.log(`  ${status} "${result.query}": ${result.testDocsFound || 0}개 테스트 문서 발견`);
    });

    if (comparison) {
      console.log(`\n스냅샷 비교: ${comparison.isMatch ? '✅ 일치' : '❌ 불일치'}`);
      if (comparison.mismatches && comparison.mismatches.length > 0) {
        console.log('차이점:');
        comparison.mismatches.forEach(mismatch => {
          console.log(`  - ${mismatch}`);
        });
      }
    }

    console.log('========================\n');
  }
}

// 직접 실행 시 테스트 실행
if (require.main === module) {
  const testSuite = new SmartSearchTestSuite();
  testSuite.runFullTest()
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = SmartSearchTestSuite;