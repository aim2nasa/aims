/**
 * AIMS UIX-3 Customer Entity Barrel Export
 * @since 2025-09-15
 *
 * 타입, 스키마, 유틸리티만 export합니다.
 * API 함수는 @/services/customerService에서 직접 import하세요.
 */

export {
  CustomerSchema,
  CreateCustomerSchema,
  UpdateCustomerSchema,
  CustomerSearchQuerySchema,
  CustomerSearchPaginationSchema,
  CustomerSearchResponseSchema,
  CustomerUtils,
  CustomerTypeUtils,
} from './model';

export type {
  Customer,
  CreateCustomerData,
  UpdateCustomerData,
  CustomerSearchQuery,
  CustomerSearchPagination,
  CustomerSearchResponse,
} from './model';
