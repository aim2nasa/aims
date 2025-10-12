/**
 * AIMS UIX-3 Customer Entity Barrel Export
 * @since 2025-09-15
 * @version 1.0.0
 */

// Models and types
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

// API functions
export {
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
} from './api';

export type {
  CustomerStats,
  ImportCustomersResult,
} from './api';
