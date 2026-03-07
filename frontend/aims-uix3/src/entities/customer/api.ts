/**
 * AIMS UIX-3 Customer API Interface
 * @since 2025-09-15
 * @version 2.0.0
 *
 * 고객 엔티티의 API 인터페이스 정의
 * 실제 구현은 services/customerService.ts에 위임
 * ARCHITECTURE.md의 Service Layer 패턴을 따름
 */

// Service Layer로 위임
export {
  getCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  restoreCustomer,
  searchCustomers,
  getCustomerStats,
  exportCustomers,
  importCustomers,
  type CustomerStats,
  type ImportCustomersResult,
} from '@/services/customerService';

/**
 * 마이그레이션 노트:
 *
 * 이 파일은 ARCHITECTURE.md의 Service Layer 패턴을 따르기 위해
 * 실제 구현을 services/customerService.ts로 이동했습니다.
 *
 * 이전 구조:
 * entities/customer/api.ts -> 직접 API 호출 구현
 *
 * 새로운 구조:
 * entities/customer/api.ts -> services/customerService.ts로 위임
 * services/customerService.ts -> 실제 API 호출 구현
 *
 * 이를 통해 다음과 같은 이점을 얻습니다:
 * 1. 비즈니스 로직의 중앙화
 * 2. 의존성 관리 개선
 * 3. 테스트 용이성 향상
 * 4. 확장성 증대
 */