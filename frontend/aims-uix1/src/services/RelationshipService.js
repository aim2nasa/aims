/**
 * RelationshipService - Document Layer
 * 관계 데이터의 단일 소스 (Single Source of Truth)
 * View는 이 서비스를 직접 호출하지 않고 Context를 통해서만 접근
 */

class RelationshipService {
  constructor() {
    this.apiBase = 'http://tars.giize.com:3010/api';
    this.cache = new Map();
    this.subscribers = new Set();
  }

  // 구독자 관리 (Context에서 상태 변경 알림을 위해)
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  // 모든 구독자에게 데이터 변경 알림
  notifySubscribers(eventType, data) {
    this.subscribers.forEach(callback => {
      try {
        callback(eventType, data);
      } catch (error) {
        console.error('RelationshipService.notifySubscribers error:', error);
      }
    });
  }

  // 캐시 키 생성
  getCacheKey(type, params = {}) {
    return `${type}-${JSON.stringify(params)}`;
  }

  // 캐시 무효화
  invalidateCache(pattern = null) {
    if (pattern) {
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  // 관계 유형 조회 (캐싱됨)
  async getRelationshipTypes() {
    const cacheKey = this.getCacheKey('relationship-types');
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const response = await fetch(`${this.apiBase}/relationship-types`);
      const result = await response.json();
      
      if (result.success) {
        this.cache.set(cacheKey, result.data);
        return result.data;
      } else {
        throw new Error(result.error || '관계 유형 조회 실패');
      }
    } catch (error) {
      console.error('RelationshipService.getRelationshipTypes:', error);
      throw error;
    }
  }

  // 특정 고객의 관계 조회
  async getCustomerRelationships(customerId) {
    try {
      const response = await fetch(`${this.apiBase}/customers/${customerId}/relationships?include_details=true`);
      const result = await response.json();
      
      if (result.success) {
        return result.data.relationships || [];
      } else {
        throw new Error(result.error || '관계 조회 실패');
      }
    } catch (error) {
      console.error('RelationshipService.getCustomerRelationships:', error);
      throw error;
    }
  }

  // 모든 고객의 관계 데이터 조회 (CustomerRelationshipTreeView용)
  async getAllRelationshipsWithCustomers() {
    const cacheKey = this.getCacheKey('all-relationships');
    
    // 캐시된 데이터가 있고 5분 이내라면 반환
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
      return cached.data;
    }

    try {
      // 1. 모든 고객 조회
      const customersResponse = await fetch(`${this.apiBase}/customers?page=1&limit=1000`);
      const customersResult = await customersResponse.json();
      
      if (!customersResult.success) {
        throw new Error('고객 데이터 조회 실패');
      }

      const customers = customersResult.data.customers;
      const allRelationships = [];

      // 2. 각 고객의 관계 정보 조회
      for (const customer of customers) {
        try {
          const relationships = await this.getCustomerRelationships(customer._id);
          relationships.forEach(rel => {
            allRelationships.push({
              ...rel,
              from_customer: customer
            });
          });
        } catch (error) {
          console.warn(`고객 ${customer.personal_info?.name}의 관계 조회 실패:`, error);
        }
      }

      const data = {
        customers,
        relationships: allRelationships,
        timestamp: Date.now()
      };

      // 캐시 저장
      this.cache.set(cacheKey, { data, timestamp: Date.now() });

      return data;
    } catch (error) {
      console.error('RelationshipService.getAllRelationshipsWithCustomers:', error);
      throw error;
    }
  }

  // 관계 생성
  async createRelationship(fromCustomerId, toCustomerId, relationshipData) {
    try {
      const response = await fetch(`${this.apiBase}/customers/${fromCustomerId}/relationships`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to_customer_id: toCustomerId,
          ...relationshipData
        })
      });

      const result = await response.json();
      
      if (result.success) {
        // 캐시 무효화
        this.invalidateCache();
        
        // 구독자들에게 알림
        this.notifySubscribers('relationship-created', {
          fromCustomerId,
          toCustomerId,
          relationship: result.data
        });
        
        // 모든 뷰 동기화를 위한 전역 이벤트 발생
        console.log('RelationshipService: dispatching relationshipChanged event');
        window.dispatchEvent(new CustomEvent('relationshipChanged'));
        
        return result.data;
      } else {
        throw new Error(result.error || '관계 생성 실패');
      }
    } catch (error) {
      console.error('RelationshipService.createRelationship:', error);
      throw error;
    }
  }

  // 관계 삭제
  async deleteRelationship(customerId, relationshipId) {
    try {
      const response = await fetch(`${this.apiBase}/customers/${customerId}/relationships/${relationshipId}`, {
        method: 'DELETE'
      });

      const result = await response.json();
      
      if (result.success) {
        // 캐시 무효화
        this.invalidateCache();
        
        // 구독자들에게 알림
        this.notifySubscribers('relationship-deleted', {
          customerId,
          relationshipId
        });
        
        // 모든 뷰 동기화를 위한 전역 이벤트 발생
        console.log('RelationshipService: dispatching relationshipChanged event');
        window.dispatchEvent(new CustomEvent('relationshipChanged'));
        
        return true;
      } else {
        throw new Error(result.error || '관계 삭제 실패');
      }
    } catch (error) {
      console.error('RelationshipService.deleteRelationship:', error);
      throw error;
    }
  }

  // 관계 업데이트
  async updateRelationship(customerId, relationshipId, updateData) {
    try {
      const response = await fetch(`${this.apiBase}/customers/${customerId}/relationships/${relationshipId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      const result = await response.json();
      
      if (result.success) {
        // 캐시 무효화
        this.invalidateCache();
        
        // 구독자들에게 알림
        this.notifySubscribers('relationship-updated', {
          customerId,
          relationshipId,
          relationship: result.data
        });
        
        // 모든 뷰 동기화를 위한 전역 이벤트 발생
        console.log('RelationshipService: dispatching relationshipChanged event');
        window.dispatchEvent(new CustomEvent('relationshipChanged'));
        
        return result.data;
      } else {
        throw new Error(result.error || '관계 업데이트 실패');
      }
    } catch (error) {
      console.error('RelationshipService.updateRelationship:', error);
      throw error;
    }
  }

  // 양방향 관계 생성
  async createBidirectionalRelationship(customerA, customerB, relationshipType, reverseType) {
    try {
      // 트랜잭션처럼 동작하도록 둘 다 성공해야 완료
      const [relationA, relationB] = await Promise.all([
        this.createRelationship(customerA, customerB, { 
          relationship_type: relationshipType,
          is_bidirectional: true
        }),
        this.createRelationship(customerB, customerA, { 
          relationship_type: reverseType || relationshipType,
          is_bidirectional: true
        })
      ]);

      return { relationA, relationB };
    } catch (error) {
      console.error('RelationshipService.createBidirectionalRelationship:', error);
      throw error;
    }
  }

  // 수동 캐시 새로고침 (사용자 요청 시)
  async refreshCache() {
    this.invalidateCache();
    
    // 주요 데이터들을 미리 로드
    await Promise.all([
      this.getRelationshipTypes(),
      this.getAllRelationshipsWithCustomers()
    ]);

    this.notifySubscribers('cache-refreshed', {});
  }
}

// 싱글톤 인스턴스 생성
const relationshipService = new RelationshipService();

export default relationshipService;