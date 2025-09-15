/**
 * AIMS UIX-3 Services Layer Index
 * @since 2025-09-15
 * @version 1.0.0
 *
 * 서비스 레이어의 통합 인터페이스
 * ARCHITECTURE.md의 Service Layer 패턴을 따름
 */

// Customer Service
export {
  CustomerService,
  getCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  restoreCustomer,
  searchCustomers,
  getCustomersByTags,
  getCustomerTags,
  getCustomerStats,
  exportCustomers,
  importCustomers,
  type CustomerStats,
  type ImportCustomersResult,
} from './customerService';

// Document Service (미래 확장용)
// export {
//   DocumentService,
//   getDocuments,
//   getDocument,
//   uploadDocument,
//   updateDocument,
//   deleteDocument,
//   searchDocuments,
//   type DocumentStats,
// } from './documentService';

// Relationship Service (미래 확장용)
// export {
//   RelationshipService,
//   getRelationships,
//   getRelationship,
//   createRelationship,
//   updateRelationship,
//   deleteRelationship,
//   type RelationshipStats,
// } from './relationshipService';

/**
 * 서비스 레이어 설계 원칙:
 *
 * 1. 단일 책임 원칙 (SRP)
 *    - 각 서비스는 하나의 Entity(도메인)만 담당
 *    - CustomerService -> Customer 관련 비즈니스 로직
 *    - DocumentService -> Document 관련 비즈니스 로직
 *    - RelationshipService -> Relationship 관련 비즈니스 로직
 *
 * 2. 의존성 역전 원칙 (DIP)
 *    - 서비스는 Entity 모델에 의존
 *    - 서비스는 shared/lib/api에 의존
 *    - 상위 레이어(Context, Controller)는 서비스에 의존
 *
 * 3. 인터페이스 분리 원칙 (ISP)
 *    - 각 서비스는 필요한 메서드만 노출
 *    - 편의 함수와 클래스 메서드 모두 제공
 *    - 타입 안전성을 위한 TypeScript 인터페이스 활용
 *
 * 4. 확장성
 *    - 새로운 Entity 추가 시 동일한 패턴 적용
 *    - 서비스별 독립적인 확장 가능
 *    - 공통 로직은 shared/lib에서 관리
 */

/**
 * 서비스 레이어 사용 가이드:
 *
 * 1. Controller에서 사용:
 *    import { CustomerService } from '@/services';
 *    const customers = await CustomerService.getCustomers(query);
 *
 * 2. Context에서 사용:
 *    import { createCustomer, updateCustomer } from '@/services';
 *    const newCustomer = await createCustomer(data);
 *
 * 3. 타입 안전성:
 *    import type { CustomerStats } from '@/services';
 *    const stats: CustomerStats = await getCustomerStats();
 */