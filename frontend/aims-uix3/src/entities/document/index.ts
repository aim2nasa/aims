/**
 * AIMS UIX-3 Document Entity
 * @since 2025-09-30
 * @version 1.0.0
 *
 * 문서 엔티티의 공개 인터페이스
 */

// 타입 및 스키마 내보내기
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

// API 함수 내보내기
export type {
  DocumentStats,
  UploadDocumentResult,
} from './api';

export {
  getDocuments,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument,
  searchDocuments,
  getDocumentsByCustomer,

  getDocumentStats,
  uploadDocument,
  downloadDocument,
} from './api';

// Document Processing Module
export {
  DocumentProcessingModule,
  type ProcessingStatus,
  type CustomerLinkStatus,
  type AvailableActions,
} from './DocumentProcessingModule';