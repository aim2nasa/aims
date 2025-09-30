/**
 * AIMS UIX-3 Document API Interface
 * @since 2025-09-30
 * @version 1.0.0
 *
 * 문서 엔티티의 API 인터페이스 정의
 * 실제 구현은 services/documentService.ts에 위임
 * ARCHITECTURE.md의 Service Layer 패턴을 따름
 */

// Service Layer로 위임
export {
  getDocuments,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument,
  searchDocuments,
  getDocumentsByCustomer,
  getDocumentTags,
  getDocumentStats,
  uploadDocument,
  downloadDocument,
  type DocumentStats,
  type UploadDocumentResult,
} from '@/services/DocumentService';

/**
 * 마이그레이션 노트:
 *
 * 이 파일은 ARCHITECTURE.md의 Service Layer 패턴을 따르기 위해
 * 실제 구현을 services/documentService.ts로 이동했습니다.
 *
 * 새로운 구조:
 * entities/document/api.ts -> services/documentService.ts로 위임
 * services/documentService.ts -> 실제 API 호출 구현
 *
 * 이를 통해 다음과 같은 이점을 얻습니다:
 * 1. 비즈니스 로직의 중앙화
 * 2. 의존성 관리 개선
 * 3. 테스트 용이성 향상
 * 4. 확장성 증대
 */