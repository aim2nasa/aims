/**
 * AIMS UIX-3 Document Entity
 * @since 2025-09-30
 *
 * 타입, 스키마, 유틸리티만 export합니다.
 * API 함수는 @/services/DocumentService에서 직접 import하세요.
 */

export type {
  Document,
  CreateDocumentData,
  UpdateDocumentData,
  DocumentSearchQuery,
  DocumentSearchResponse,
  DocumentTypeInput,
} from './model';

export {
  DocumentSchema,
  CreateDocumentSchema,
  UpdateDocumentSchema,
  DocumentSearchQuerySchema,
  DocumentSearchResponseSchema,
  DocumentUtils,
} from './model';

// Document Processing Module
export {
  DocumentProcessingModule,
  type ProcessingStatus,
  type CustomerLinkStatus,
  type AvailableActions,
} from './DocumentProcessingModule';
