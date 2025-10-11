/**
 * AIMS UIX-3 Document Service Layer
 * @since 2025-09-30
 * @version 1.0.0
 *
 * 문서 관련 비즈니스 로직 및 API 호출을 담당하는 서비스 레이어
 * ARCHITECTURE.md의 Service Layer 패턴을 따름
 */

import { api } from '@/shared/lib/api';
import {
  Document,
  CreateDocumentData,
  UpdateDocumentData,
  DocumentSearchQuery,
  DocumentSearchResponse,
  DocumentUtils,
} from '@/entities/document';

/**
 * 문서 API 엔드포인트
 */
const ENDPOINTS = {
  DOCUMENTS: '/api/documents',
  DOCUMENT: (id: string) => `/api/documents/${id}`,
  DOCUMENT_SEARCH: '/api/documents/search',
  DOCUMENT_TAGS: '/api/documents/tags',
  DOCUMENT_STATS: '/api/documents/stats',
  DOCUMENT_UPLOAD: '/api/documents/upload',
  DOCUMENT_DOWNLOAD: (id: string) => `/api/documents/${id}/download`,
  CUSTOMER_DOCUMENTS: (customerId: string) => `/api/customers/${customerId}/documents`,
} as const;

/**
 * 고객 문서 연결 정보
 */
export interface CustomerDocumentItem {
  _id: string;
  originalName?: string;
  uploadedAt?: string;
  fileSize?: number;
  mimeType?: string;
  relationship?: string;
  notes?: string;
  linkedAt?: string;
  status?: string;
  progress?: number;
}

export interface CustomerDocumentsResult {
  customer_id: string;
  customer_name?: string;
  documents: CustomerDocumentItem[];
  total: number;
}

export interface DocumentCustomerLinkPayload {
  document_id: string;
  relationship_type: string;
  notes?: string;
  assigned_by?: string | null;
}

/**
 * 문서 서비스 클래스
 * 모든 문서 관련 비즈니스 로직과 API 호출을 중앙화
 */
export class DocumentService {
  /**
   * 문서 목록 조회
   */
  static async getDocuments(
    query: Partial<DocumentSearchQuery> = {}
  ): Promise<DocumentSearchResponse> {
    // 백엔드 페이지네이션 파라미터 구성
    const params = new URLSearchParams();
    if (query.limit) params.append('limit', String(query.limit));
    if (query.offset !== undefined) params.append('offset', String(query.offset));

    // 검색어 파라미터 추가 (백엔드 검색 기능 사용)
    if (query.q) params.append('search', query.q);

    // 백엔드는 'sort' 파라미터를 조합 형식으로 받음
    // 예: 'uploadTime_desc', 'filename_asc', 'size_desc', 'fileType_asc'
    if (query.sortBy && query.sortOrder) {
      const sortByMap: Record<string, string> = {
        'time': 'uploadTime',
        'name': 'filename',
        'size': 'size',
        'uploadDate': 'uploadTime',
        'filename': 'filename',
        'createdAt': 'uploadTime',
        'updatedAt': 'uploadTime',
        'fileType': 'fileType',  // 파일 형식 정렬 추가
      };
      const backendSortBy = sortByMap[query.sortBy] || 'uploadTime';
      const sortValue = `${backendSortBy}_${query.sortOrder}`;
      params.append('sort', sortValue);
    }

    const url = params.toString() ? `${ENDPOINTS.DOCUMENTS}?${params.toString()}` : ENDPOINTS.DOCUMENTS;
    const response = await api.get<any>(url);

    // 백엔드 응답 구조: { success: true, data: { documents: [...] } }
    if (response.success && response.data && Array.isArray(response.data.documents)) {
      const documents = response.data.documents.map((doc: any) => {
        // uploadTime에서 'xxx' 제거하고 유효한 ISO 날짜로 변환
        let uploadDate = doc.uploadTime || doc.uploaded_at || new Date().toISOString();
        if (uploadDate.includes('xxx')) {
          uploadDate = uploadDate.replace('xxx', '000Z');
        }

        return {
          _id: doc._id,
          filename: doc.filename,
          originalName: doc.filename,
          mimeType: doc.mimeType,
          size: parseInt(doc.fileSize) || 0,
          uploadDate: uploadDate,
          ocrStatus: doc.status === 'completed' ? 'completed' as const : 'pending' as const,
          status: 'active' as const,
          createdAt: uploadDate,
          updatedAt: uploadDate,
          tags: [],
        };
      });

      // 백엔드 페이지네이션 정보 사용
      const pagination = response.data.pagination || {};
      const total = pagination.totalCount || documents.length;
      const hasMore = pagination.hasNext || false;

      // 백엔드에서 검색이 완료된 결과를 그대로 사용
      return {
        documents: documents,
        total: total,
        hasMore: hasMore,
        offset: query.offset || 0,
        limit: query.limit || 10,
      };
    }

    // 빈 응답 반환
    return {
      documents: [],
      total: 0,
      hasMore: false,
      offset: 0,
      limit: 20,
    };
  }

  /**
   * 문서 상세 조회
   */
  static async getDocument(id: string): Promise<Document> {
    if (!id.trim()) {
      throw new Error('문서 ID가 필요합니다');
    }

    const response = await api.get<unknown>(ENDPOINTS.DOCUMENT(id));

    // 응답 검증
    return DocumentUtils.validate(response);
  }

  /**
   * 문서 생성
   */
  static async createDocument(data: CreateDocumentData): Promise<Document> {
    // 입력 데이터 검증
    const validatedData = DocumentUtils.validateCreateData(data);

    const response = await api.post<unknown>(ENDPOINTS.DOCUMENTS, validatedData);

    // 응답 검증
    return DocumentUtils.validate(response);
  }

  /**
   * 문서 정보 수정
   */
  static async updateDocument(
    id: string,
    data: UpdateDocumentData
  ): Promise<Document> {
    if (!id.trim()) {
      throw new Error('문서 ID가 필요합니다');
    }

    // 입력 데이터 검증
    const validatedData = DocumentUtils.validateUpdateData(data);

    const response = await api.put<unknown>(ENDPOINTS.DOCUMENT(id), validatedData);

    // 응답 검증
    return DocumentUtils.validate(response);
  }

  /**
   * 문서 삭제 (소프트 삭제)
   */
  static async deleteDocument(id: string): Promise<void> {
    if (!id.trim()) {
      throw new Error('문서 ID가 필요합니다');
    }

    // 실제로는 status를 'deleted'로 변경
    await DocumentService.updateDocument(id, { status: 'deleted' });
  }

  /**
   * 문서 검색 (텍스트 검색)
   */
  static async searchDocuments(
    searchTerm: string,
    options: Partial<DocumentSearchQuery> = {}
  ): Promise<DocumentSearchResponse> {
    if (!searchTerm.trim()) {
      // 빈 검색어인 경우 전체 목록 반환
      return DocumentService.getDocuments(options);
    }

    const validatedOptions = DocumentUtils.validateSearchQuery(options);
    const query: DocumentSearchQuery = {
      ...validatedOptions,
      q: searchTerm.trim(),
    };

    return DocumentService.getDocuments(query);
  }

  /**
   * 고객별 문서 조회
   */
  static async getDocumentsByCustomer(
    customerId: string,
    options: Partial<DocumentSearchQuery> = {}
  ): Promise<DocumentSearchResponse> {
    if (!customerId.trim()) {
      throw new Error('고객 ID가 필요합니다');
    }

    const validatedOptions = DocumentUtils.validateSearchQuery(options);
    const query: DocumentSearchQuery = {
      ...validatedOptions,
      customerId: customerId.trim(),
    };

    return DocumentService.getDocuments(query);
  }

  /**
   * 특정 고객과 연결된 문서 목록 조회
   */
  static async getCustomerDocuments(customerId: string): Promise<CustomerDocumentsResult> {
    if (!customerId.trim()) {
      throw new Error('고객 ID가 필요합니다');
    }

    const response = await api.get<any>(ENDPOINTS.CUSTOMER_DOCUMENTS(customerId));

    if (response && typeof response === 'object') {
      if ('data' in response && response.data) {
        return response.data as CustomerDocumentsResult;
      }

      if ('documents' in response) {
        return response as CustomerDocumentsResult;
      }
    }

    return {
      customer_id: customerId,
      documents: [],
      total: 0,
    };
  }

  /**
   * 문서를 고객에게 연결
   */
  static async linkDocumentToCustomer(
    customerId: string,
    payload: DocumentCustomerLinkPayload
  ): Promise<void> {
    if (!customerId.trim()) {
      throw new Error('고객 ID가 필요합니다');
    }

    if (!payload.document_id?.trim()) {
      throw new Error('문서 ID가 필요합니다');
    }

    await api.post(ENDPOINTS.CUSTOMER_DOCUMENTS(customerId), payload);
  }

  /**
   * 사용 중인 모든 태그 조회
   */
  static async getDocumentTags(): Promise<string[]> {
    const response = await api.get<string[]>(ENDPOINTS.DOCUMENT_TAGS);

    // 기본 검증 (문자열 배열인지 확인)
    if (!Array.isArray(response)) {
      throw new Error('Invalid tags response format');
    }

    return response.filter((tag): tag is string => typeof tag === 'string');
  }

  /**
   * 문서 통계 조회
   */
  static async getDocumentStats(): Promise<DocumentStats> {
    const response = await api.get<DocumentStats>(ENDPOINTS.DOCUMENT_STATS);

    // 기본 구조 검증
    if (!response || typeof response !== 'object') {
      throw new Error('Invalid stats response format');
    }

    return {
      total: Number(response.total) || 0,
      active: Number(response.active) || 0,
      archived: Number(response.archived) || 0,
      deleted: Number(response.deleted) || 0,
      totalSize: Number(response.totalSize) || 0,
      ocrCompleted: Number(response.ocrCompleted) || 0,
      ocrPending: Number(response.ocrPending) || 0,
      mostUsedTags: Array.isArray(response.mostUsedTags) ? response.mostUsedTags : [],
    };
  }

  /**
   * 문서 업로드
   */
  static async uploadDocument(file: File, metadata?: Partial<CreateDocumentData>): Promise<UploadDocumentResult> {
    if (!file) {
      throw new Error('파일이 필요합니다');
    }

    const formData = new FormData();
    formData.append('file', file);

    // 메타데이터가 있으면 추가
    if (metadata) {
      Object.entries(metadata).forEach(([key, value]) => {
        if (value !== undefined) {
          if (Array.isArray(value)) {
            formData.append(key, JSON.stringify(value));
          } else {
            formData.append(key, String(value));
          }
        }
      });
    }

    const response = await api.post<UploadDocumentResult>(ENDPOINTS.DOCUMENT_UPLOAD, formData);

    return response;
  }

  /**
   * 문서 다운로드
   */
  static async downloadDocument(id: string): Promise<Blob> {
    if (!id.trim()) {
      throw new Error('문서 ID가 필요합니다');
    }

    const response = await api.get<Blob>(ENDPOINTS.DOCUMENT_DOWNLOAD(id));

    return response;
  }

  /**
   * 문서 일괄 삭제 (소프트 삭제)
   */
  static async deleteDocuments(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      throw new Error('삭제할 문서 ID가 필요합니다');
    }

    // 병렬로 삭제 처리
    await Promise.all(ids.map(id => DocumentService.deleteDocument(id)));
  }

  /**
   * 문서 보관 처리
   */
  static async archiveDocument(id: string): Promise<Document> {
    if (!id.trim()) {
      throw new Error('문서 ID가 필요합니다');
    }

    return DocumentService.updateDocument(id, { status: 'archived' });
  }

  /**
   * 문서 일괄 보관
   */
  static async archiveDocuments(ids: string[]): Promise<Document[]> {
    if (ids.length === 0) {
      throw new Error('보관할 문서 ID가 필요합니다');
    }

    // 병렬로 보관 처리
    return Promise.all(ids.map(id => DocumentService.archiveDocument(id)));
  }
}

/**
 * 문서 통계 인터페이스
 */
export interface DocumentStats {
  total: number;
  active: number;
  archived: number;
  deleted: number;
  totalSize: number;
  ocrCompleted: number;
  ocrPending: number;
  mostUsedTags: Array<{ tag: string; count: number }>;
}

/**
 * 문서 업로드 결과 인터페이스
 */
export interface UploadDocumentResult {
  success: boolean;
  document?: Document;
  error?: string;
}

/**
 * 편의를 위한 함수 내보내기 (기존 API와 호환성 유지)
 */
export const {
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
} = DocumentService;

/**
 * 기본 내보내기
 */
export default DocumentService;
