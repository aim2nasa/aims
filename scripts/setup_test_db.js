const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const API_BASE_URL = 'http://tars.giize.com:3010/api';

// 테스트용 고객 데이터
const TEST_CUSTOMERS = [
  {
    personal_info: {
      name: "강남의료센터",
      birth_date: "1990-01-01T00:00:00.000Z",
      gender: "M",
      phone: "02-1234-5678",
      email: "info@gangnam-medical.co.kr"
    },
    insurance_info: {
      customer_type: "법인",
      risk_level: "중위험",
      annual_premium: 5000000,
      total_coverage: 100000000
    }
  },
  {
    personal_info: {
      name: "김의사",
      birth_date: "1980-03-15T00:00:00.000Z",
      gender: "M",
      phone: "010-1111-2222",
      email: "doctor.kim@example.com"
    },
    insurance_info: {
      customer_type: "개인",
      risk_level: "저위험",
      annual_premium: 2000000,
      total_coverage: 50000000
    }
  },
  {
    personal_info: {
      name: "이간호사",
      birth_date: "1985-07-20T00:00:00.000Z",
      gender: "F",
      phone: "010-3333-4444",
      email: "nurse.lee@example.com"
    },
    insurance_info: {
      customer_type: "개인",
      risk_level: "저위험",
      annual_premium: 1500000,
      total_coverage: 30000000
    }
  },
  {
    personal_info: {
      name: "박원장",
      birth_date: "1975-11-10T00:00:00.000Z",
      gender: "M",
      phone: "010-5555-6666",
      email: "director.park@example.com"
    },
    insurance_info: {
      customer_type: "개인",
      risk_level: "중위험",
      annual_premium: 3000000,
      total_coverage: 80000000
    }
  }
];

// 테스트용 관계 데이터 (단방향으로 생성)
const TEST_RELATIONSHIPS = [
  {
    from: "김의사",
    to: "강남의료센터",
    type: "employee",
    description: "의사 직원"
  },
  {
    from: "이간호사", 
    to: "강남의료센터",
    type: "employee",
    description: "간호사 직원"
  },
  {
    from: "박원장",
    to: "강남의료센터", 
    type: "executive",
    description: "병원 원장"
  }
];

async function clearAllData() {
  console.log('기존 데이터 정리 중...');
  
  try {
    // 모든 고객 조회 후 개별 삭제
    const response = await fetch(`${API_BASE_URL}/customers?limit=10000`);
    const result = await response.json();
    
    if (result.success && result.data && result.data.customers) {
      console.log(`${result.data.customers.length}개의 고객 삭제 중...`);
      
      for (const customer of result.data.customers) {
        try {
          await fetch(`${API_BASE_URL}/customers/${customer._id}`, {
            method: 'DELETE'
          });
          console.log(`✓ ${customer.personal_info?.name} 삭제 완료`);
        } catch (error) {
          console.log(`✗ ${customer.personal_info?.name} 삭제 실패`);
        }
        
        // API 부하 방지를 위한 대기
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    console.log('기존 데이터 정리 완료');
  } catch (error) {
    console.log('기존 데이터 정리 중 오류 (무시):', error.message);
  }
}

async function createTestCustomers() {
  console.log('테스트 고객 생성 중...');
  const createdCustomers = {};
  
  for (const customer of TEST_CUSTOMERS) {
    try {
      const response = await fetch(`${API_BASE_URL}/customers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(customer)
      });
      
      const result = await response.json();
      if (result.success) {
        const customerId = result.data.customer_id;
        createdCustomers[customer.personal_info.name] = customerId;
        console.log(`✓ ${customer.personal_info.name} 생성 완료 (ID: ${customerId})`);
      } else {
        console.log(`✗ ${customer.personal_info.name} 생성 실패:`, result.error);
      }
    } catch (error) {
      console.log(`✗ ${customer.personal_info.name} 생성 오류:`, error.message);
    }
  }
  
  return createdCustomers;
}

async function createTestRelationships(customers) {
  console.log('테스트 관계 생성 중...');
  
  for (const rel of TEST_RELATIONSHIPS) {
    const fromCustomerId = customers[rel.from];
    const toCustomerId = customers[rel.to];
    
    if (!fromCustomerId || !toCustomerId) {
      console.log(`✗ 관계 생성 실패: ${rel.from} → ${rel.to} (고객 ID 없음)`);
      continue;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/customers/${fromCustomerId}/relationships`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to_customer_id: toCustomerId,
          relationship_type: rel.type,
          strength: 'medium',
          relationship_details: {
            description: rel.description,
            contact_frequency: 'weekly',
            influence_level: 'medium'
          },
          insurance_relevance: {
            is_beneficiary: false,
            cross_selling_opportunity: false,
            referral_potential: 'medium'
          }
        })
      });
      
      const result = await response.json();
      if (result.success) {
        console.log(`✓ ${rel.from} → ${rel.to} (${rel.type}) 생성 완료`);
      } else {
        console.log(`✗ ${rel.from} → ${rel.to} (${rel.type}) 생성 실패:`, result.error);
      }
    } catch (error) {
      console.log(`✗ ${rel.from} → ${rel.to} (${rel.type}) 생성 오류:`, error.message);
    }
  }
}

async function setupTestDB() {
  console.log('=== 테스트 DB 설정 시작 ===');
  
  try {
    // 1. 기존 데이터 정리
    await clearAllData();
    
    // 2. 테스트 고객 생성
    const customers = await createTestCustomers();
    
    // 3. 테스트 관계 생성 
    await createTestRelationships(customers);
    
    console.log('\n=== 테스트 DB 설정 완료 ===');
    console.log('생성된 고객:', Object.keys(customers));
    console.log('생성된 관계:', TEST_RELATIONSHIPS.map(r => `${r.from} → ${r.to} (${r.type})`));
    
    // 4. 검증
    console.log('\n=== 데이터 검증 ===');
    const gangnamId = customers['강남의료센터'];
    if (gangnamId) {
      const response = await fetch(`${API_BASE_URL}/customers/${gangnamId}/relationships?include_details=true`);
      const result = await response.json();
      
      if (result.success) {
        console.log(`강남의료센터 관계 수: ${result.data.relationships.length}`);
        result.data.relationships.forEach(rel => {
          console.log(`- ${rel.related_customer.personal_info.name} (${rel.relationship_info.relationship_type})`);
        });
      }
    }
    
  } catch (error) {
    console.error('테스트 DB 설정 실패:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  setupTestDB()
    .then(() => {
      console.log('테스트 DB 설정 성공');
      process.exit(0);
    })
    .catch(error => {
      console.error('실행 중 오류:', error);
      process.exit(1);
    });
}

module.exports = { setupTestDB };