const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const API_BASE_URL = 'http://tars.giize.com:3010/api';

async function getAllCustomers() {
  try {
    const response = await fetch(`${API_BASE_URL}/customers?limit=10000`);
    const result = await response.json();
    
    if (result.success && result.data && result.data.customers) {
      return result.data.customers;
    }
    return [];
  } catch (error) {
    console.error('고객 조회 실패:', error);
    return [];
  }
}

async function getCustomerRelationships(customerId) {
  try {
    const response = await fetch(`${API_BASE_URL}/customers/${customerId}/relationships?include_details=true`);
    const result = await response.json();
    
    if (result.success && result.data && result.data.relationships) {
      return result.data.relationships;
    }
    return [];
  } catch (error) {
    console.error(`고객 ${customerId} 관계 조회 실패:`, error);
    return [];
  }
}

async function getAllRelationships() {
  try {
    console.log('모든 고객 조회 중...');
    const customers = await getAllCustomers();
    console.log(`${customers.length}명의 고객 발견`);
    
    const allRelationships = [];
    for (const customer of customers) {
      const relationships = await getCustomerRelationships(customer._id);
      allRelationships.push(...relationships);
      
      // API 부하를 줄이기 위해 잠시 대기
      if (allRelationships.length % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`총 ${allRelationships.length}개의 관계 발견`);
    return allRelationships;
  } catch (error) {
    console.error('전체 관계 조회 실패:', error);
    return [];
  }
}

async function createRelationship(fromCustomerId, toCustomerId, relationshipType, strength = 'medium', description = '') {
  try {
    const data = {
      to_customer_id: toCustomerId,
      relationship_type: relationshipType,
      strength: strength,
      relationship_details: {
        description: description,
        contact_frequency: 'monthly',
        influence_level: 'medium'
      },
      insurance_relevance: {
        is_beneficiary: false,
        cross_selling_opportunity: false,
        referral_potential: 'medium'
      }
    };

    const response = await fetch(`${API_BASE_URL}/customers/${fromCustomerId}/relationships`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    const result = await response.json();
    return result.success;
  } catch (error) {
    console.error('관계 생성 실패:', error);
    return false;
  }
}

// 역방향 관계 타입 매핑
const REVERSE_RELATIONSHIP_TYPES = {
  spouse: 'spouse',           // 배우자 ↔ 배우자
  parent: 'child',           // 부모 → 자녀
  child: 'parent',           // 자녀 → 부모
  son: 'parent',             // 아들 → 부모
  daughter: 'parent',        // 딸 → 부모
  sibling: 'sibling',        // 형제자매 ↔ 형제자매
  brother: 'sibling',        // 형/동생 ↔ 형제자매
  sister: 'sibling',         // 누나/언니/여동생 ↔ 형제자매
  grandparent: 'grandchild', // 조부모 → 손자/손녀
  grandchild: 'grandparent', // 손자/손녀 → 조부모
  
  // 직장 관계는 단방향 유지 (법인→개인)
  employee: null,
  employer: null,
  colleague: 'colleague',
  
  // 사회적 관계는 양방향
  friend: 'friend',
  neighbor: 'neighbor',
  acquaintance: 'acquaintance'
};

async function createBidirectionalRelationships() {
  console.log('기존 관계 조회 중...');
  const existingRelationships = await getAllRelationships();
  
  if (existingRelationships.length === 0) {
    console.log('기존 관계를 찾을 수 없습니다.');
    return;
  }
  
  console.log(`${existingRelationships.length}개의 기존 관계 발견`);
  
  // 기존 관계를 맵으로 변환 (중복 확인용)
  const relationshipMap = new Map();
  existingRelationships.forEach(rel => {
    if (!rel.relationship_info?.from_customer_id || !rel.related_customer?._id || !rel.relationship_info?.relationship_type) {
      console.log('잘못된 관계 데이터 건너뛰기');
      return;
    }
    const key = `${rel.relationship_info.from_customer_id}-${rel.related_customer._id}-${rel.relationship_info.relationship_type}`;
    relationshipMap.set(key, rel);
  });
  
  let createdCount = 0;
  let skippedCount = 0;
  
  for (const relationship of existingRelationships) {
    const originalType = relationship.relationship_info.relationship_type;
    const reverseType = REVERSE_RELATIONSHIP_TYPES[originalType];
    
    // 역방향 관계 타입이 없는 경우 (직장 관계 등) 건너뛰기
    if (reverseType === null) {
      console.log(`${originalType} 관계는 단방향 유지 - 건너뛰기`);
      skippedCount++;
      continue;
    }
    
    // 역방향 관계가 이미 존재하는지 확인
    const reverseKey = `${relationship.related_customer._id}-${relationship.relationship_info.from_customer_id}-${reverseType}`;
    
    if (relationshipMap.has(reverseKey)) {
      console.log(`역방향 관계가 이미 존재: ${relationship.related_customer.personal_info?.name} → [from_customer] (${reverseType})`);
      skippedCount++;
      continue;
    }
    
    // 역방향 관계 생성
    const success = await createRelationship(
      relationship.related_customer._id,
      relationship.relationship_info.from_customer_id,
      reverseType,
      relationship.relationship_info.strength,
      `${originalType} 관계의 역방향 (자동 생성)`
    );
    
    if (success) {
      console.log(`✓ 역방향 관계 생성: ${relationship.related_customer.personal_info?.name} → [from_customer] (${reverseType})`);
      createdCount++;
      
      // 새로 생성한 관계도 맵에 추가
      relationshipMap.set(reverseKey, true);
    } else {
      console.log(`✗ 역방향 관계 생성 실패: ${relationship.related_customer.personal_info?.name} → [from_customer] (${reverseType})`);
    }
    
    // API 부하를 줄이기 위해 잠시 대기
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`\n완료! 생성: ${createdCount}개, 건너뛰기: ${skippedCount}개`);
}

if (require.main === module) {
  createBidirectionalRelationships()
    .then(() => {
      console.log('양방향 관계 생성 완료');
      process.exit(0);
    })
    .catch(error => {
      console.error('실행 중 오류:', error);
      process.exit(1);
    });
}

module.exports = { createBidirectionalRelationships };