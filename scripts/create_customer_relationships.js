/**
 * 고객 관계 테스트 데이터 생성 스크립트
 * 
 * 실행 방법: node scripts/create_customer_relationships.js
 */

const http = require('http');

const API_HOST = 'tars.giize.com';
const API_PORT = 3010;

// HTTP 요청 헬퍼 함수
function makeHttpRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: `/api${path}`,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (data) {
      const jsonData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(jsonData);
    }

    const req = http.request(options, (res) => {
      let responseBody = '';
      
      res.on('data', (chunk) => {
        responseBody += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(responseBody);
          resolve({ data: parsedData, status: res.statusCode });
        } catch (error) {
          reject(new Error(`Invalid JSON response: ${responseBody}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// 관계 유형 정의 (API와 동일)
const relationshipTypes = {
  family: ['spouse', 'parent', 'child', 'sibling', 'grandparent', 'grandchild'],
  relative: ['uncle_aunt', 'nephew_niece', 'cousin', 'in_law'],
  social: ['friend', 'acquaintance', 'neighbor'],
  professional: ['supervisor', 'subordinate', 'colleague', 'business_partner', 'client', 'service_provider'],
  corporate: ['ceo', 'executive', 'employee', 'shareholder', 'director']
};

// 관계 강도
const strengthLevels = ['strong', 'medium', 'weak'];

// 연락 빈도
const contactFrequencies = ['daily', 'weekly', 'monthly', 'rarely', 'never'];

// 영향력 수준
const influenceLevels = ['high', 'medium', 'low'];

// 추천 가능성
const referralPotentials = ['high', 'medium', 'low'];

// 랜덤 선택 함수
function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// 랜덤 불린 생성 (확률 기반)
function randomBoolean(probability = 0.5) {
  return Math.random() < probability;
}

// 랜덤 날짜 생성 (과거 1-10년)
function randomPastDate(yearsBack = 10) {
  const now = new Date();
  const pastDate = new Date(now.getTime() - (Math.random() * yearsBack * 365 * 24 * 60 * 60 * 1000));
  return pastDate;
}

// 관계 데이터 생성
function generateRelationship(fromCustomerId, toCustomerId, relationshipType, category) {
  const strength = randomChoice(strengthLevels);
  const contactFreq = randomChoice(contactFrequencies);
  const influenceLevel = randomChoice(influenceLevels);
  const referralPotential = randomChoice(referralPotentials);
  
  return {
    to_customer_id: toCustomerId,
    relationship_type: relationshipType,
    strength: strength,
    relationship_details: {
      description: `${relationshipType} 관계`,
      established_date: randomPastDate(5).toISOString().split('T')[0],
      notes: `테스트 관계 데이터 - ${category}`,
      contact_frequency: contactFreq,
      influence_level: influenceLevel
    },
    insurance_relevance: {
      is_beneficiary: randomBoolean(0.3), // 30% 확률로 수익자
      is_insured: randomBoolean(0.2), // 20% 확률로 피보험자
      shared_policies: [], // 빈 배열로 시작
      referral_potential: referralPotential,
      cross_selling_opportunity: randomBoolean(0.4) // 40% 확률로 교차판매 기회
    }
  };
}

// 고객들 간 관계 네트워크 생성
function createRelationshipNetwork(customers) {
  const relationships = [];
  const usedPairs = new Set();
  
  // 각 고객당 1-5개의 관계 생성
  customers.forEach(customer => {
    const numRelationships = Math.floor(Math.random() * 5) + 1;
    let created = 0;
    let attempts = 0;
    const maxAttempts = 20;
    
    while (created < numRelationships && attempts < maxAttempts) {
      attempts++;
      
      // 랜덤하게 다른 고객 선택
      const otherCustomer = randomChoice(customers.filter(c => c._id !== customer._id));
      const pairKey = [customer._id, otherCustomer._id].sort().join('-');
      
      // 이미 관계가 있는 쌍인지 확인
      if (usedPairs.has(pairKey)) {
        continue;
      }
      
      // 관계 카테고리와 유형 선택
      const categories = Object.keys(relationshipTypes);
      const category = randomChoice(categories);
      const availableTypes = relationshipTypes[category];
      const relationshipType = randomChoice(availableTypes);
      
      // 법인-개인 관계는 고객 유형에 따라 제한
      if (category === 'corporate') {
        const fromType = customer.insurance_info?.customer_type;
        const toType = otherCustomer.insurance_info?.customer_type;
        
        // 둘 다 개인이면 법인 관계 생성하지 않음
        if (fromType === '개인' && toType === '개인') {
          continue;
        }
      }
      
      const relationshipData = generateRelationship(
        customer._id, 
        otherCustomer._id, 
        relationshipType, 
        category
      );
      
      relationships.push({
        fromCustomerId: customer._id,
        relationshipData
      });
      
      usedPairs.add(pairKey);
      created++;
    }
  });
  
  return relationships;
}

async function createCustomerRelationships() {
  try {
    console.log('🔌 API 서버 연결 확인 중...');
    
    // API 서버 연결 확인
    try {
      const response = await makeHttpRequest('GET', '/customers?limit=1');
      console.log('✅ API 서버 연결 성공');
    } catch (error) {
      console.error('❌ API 서버에 연결할 수 없습니다:', error.message);
      console.error('   tars.giize.com:3010 서버가 실행 중인지 확인해주세요.');
      return;
    }
    
    // 모든 고객 조회
    console.log('👥 기존 고객 목록 조회 중...');
    const customersResponse = await makeHttpRequest('GET', '/customers?limit=1000');
    
    if (!customersResponse.data.success) {
      console.error('❌ 고객 목록 조회 실패:', customersResponse.data.error);
      return;
    }
    
    const customers = customersResponse.data.data.customers;
    console.log(`✅ 총 ${customers.length}명의 고객 발견`);
    
    if (customers.length < 2) {
      console.warn('⚠️  관계 생성을 위해서는 최소 2명의 고객이 필요합니다.');
      return;
    }
    
    // 관계 네트워크 생성
    console.log('🕸️  고객 관계 네트워크 생성 중...');
    const relationships = createRelationshipNetwork(customers);
    console.log(`✅ 총 ${relationships.length}개의 관계 생성 예정`);
    
    // 관계 생성 실행
    console.log('💫 관계 데이터 저장 중...');
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < relationships.length; i++) {
      try {
        const { fromCustomerId, relationshipData } = relationships[i];
        
        const response = await makeHttpRequest(
          'POST', 
          `/customers/${fromCustomerId}/relationships`, 
          relationshipData
        );
        
        if (response.data.success) {
          successCount++;
        } else {
          failCount++;
          console.warn(`   ⚠️  관계 ${i+1} 생성 실패: ${response.data.error}`);
        }
        
        if ((i + 1) % 10 === 0) {
          console.log(`   진행률: ${i+1}/${relationships.length} (성공: ${successCount}, 실패: ${failCount})`);
        }
        
        // API 과부하 방지를 위한 지연
        await new Promise(resolve => setTimeout(resolve, 50));
        
      } catch (error) {
        failCount++;
        console.warn(`   ❌ 관계 ${i+1} API 호출 실패:`, error.message);
      }
    }
    
    console.log(`\n✅ 고객 관계 생성 완료!`);
    console.log(`   성공: ${successCount}개`);
    console.log(`   실패: ${failCount}개`);
    
    // 관계 통계 확인
    try {
      console.log('\n📊 관계 통계 조회 중...');
      
      // 몇 명의 샘플 고객에 대해 관계 통계 확인
      const sampleCustomers = customers.slice(0, 5);
      
      for (const customer of sampleCustomers) {
        try {
          const statsResponse = await makeHttpRequest('GET', `/customers/${customer._id}/relationship-stats`);
          
          if (statsResponse.data.success) {
            const stats = statsResponse.data.data.summary;
            console.log(`   ${customer.personal_info?.name}: 총 ${stats.total_relationships}개 관계 (강한 관계: ${stats.strong_relationships}개)`);
          }
        } catch (error) {
          console.warn(`   ${customer.personal_info?.name} 통계 조회 실패`);
        }
      }
      
    } catch (error) {
      console.warn('⚠️  관계 통계 조회 실패:', error.message);
    }
    
  } catch (error) {
    console.error('❌ 전체 프로세스 오류:', error);
  }
}

// 스크립트 실행
if (require.main === module) {
  createCustomerRelationships()
    .then(() => {
      console.log('\n🎉 고객 관계 데이터 생성 완료!');
      console.log('   고객 관리 시스템에서 관계 네트워크를 확인해보세요.');
    })
    .catch(error => {
      console.error('💥 스크립트 실행 실패:', error);
      process.exit(1);
    });
}

module.exports = { createCustomerRelationships };