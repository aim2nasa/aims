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
  CUSTOMER_DOCUMENT: (customerId: string, documentId: string) =>
    `/api/customers/${customerId}/documents/${documentId}`,
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const toString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

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
    const response = await api.get<unknown>(url);

    const extractDocuments = (input: unknown): {
      documents: Record<string, unknown>[];
      pagination?: Record<string, unknown>;
    } => {
      if (!isRecord(input)) {
        return { documents: [] };
      }

      const dataRecord = isRecord(input['data']) ? (input['data'] as Record<string, unknown>) : undefined;
      const dataDocs = dataRecord?.['documents'];
      const rootDocs = input['documents'];

      const documentsSource = Array.isArray(dataDocs)
        ? dataDocs
        : Array.isArray(rootDocs)
          ? rootDocs
          : [];

      const documents = documentsSource.filter((doc): doc is Record<string, unknown> => isRecord(doc));

      const pagination =
        (dataRecord && isRecord(dataRecord['pagination'])
          ? (dataRecord['pagination'] as Record<string, unknown>)
          : isRecord(input['pagination'])
            ? (input['pagination'] as Record<string, unknown>)
            : undefined);

      if (pagination) {
        return { documents, pagination };
      }

      return { documents };
    };

    const { documents: rawDocuments, pagination } = extractDocuments(response);

    const documents: Document[] = rawDocuments.map((doc) => {
      const record = doc as Record<string, unknown>;
      const generatedId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const id =
        toString(record['_id']) ??
        toString(record['id']) ??
        generatedId;

      const filename = toString(record['filename']) ?? '이름 없는 문서';
      const originalName = toString(record['originalName']) ?? filename;
      const mimeType = toString(record['mimeType']);
      const uploadTimeRaw =
        toString(record['uploadTime']) ??
        toString(record['uploaded_at']) ??
        new Date().toISOString();
      const uploadDate = uploadTimeRaw.includes('xxx')
        ? uploadTimeRaw.replace('xxx', '000Z')
        : uploadTimeRaw;
      const fileSize = toNumber(record['fileSize']);

      const rawStatus = toString(record['status']);
      const status: Document['status'] =
        rawStatus === 'archived' || rawStatus === 'deleted' ? rawStatus : 'active';

      const rawOcrStatus = toString(record['ocrStatus']);
      const ocrStatus: Document['ocrStatus'] =
        rawOcrStatus === 'processing' || rawOcrStatus === 'completed' || rawOcrStatus === 'failed'
          ? rawOcrStatus
          : 'pending';

      const document: Document = {
        _id: id,
        filename,
        originalName,
        uploadDate,
        status,
        ocrStatus,
        createdAt: uploadDate,
        updatedAt: uploadDate,
        tags: []
      };

      if (mimeType) {
        document.mimeType = mimeType;
      }

      if (typeof fileSize === 'number') {
        document.size = fileSize;
      }

      return document;
    });

    const total = toNumber(pagination?.totalCount) ?? documents.length;
    const hasMore = Boolean(pagination?.hasNext);
    return {
      documents,
      total,
      hasMore,
      offset: query.offset || 0,
      limit: query.limit || 10
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

    const response = await api.get<unknown>(ENDPOINTS.CUSTOMER_DOCUMENTS(customerId));

    const collectDocuments = (value: unknown): CustomerDocumentItem[] => {
      if (!Array.isArray(value)) {
        return [];
      }

      return value
        .map((item): CustomerDocumentItem | null => {
          if (!isRecord(item)) {
            return null;
          }

          const id = toString(item['_id']) ?? toString(item['id']);
          if (!id) {
            return null;
          }

          const originalName = toString(item['originalName']) ?? toString(item['filename']);
          const uploadedAt = toString(item['uploadedAt']) ?? toString(item['linkedAt']);
          const fileSize = toNumber(item['fileSize']);
          const mimeType = toString(item['mimeType']);
          const relationship = toString(item['relationship']);
          const notes = toString(item['notes']);
          const linkedAt = toString(item['linkedAt']);
          const status = toString(item['status']) ?? undefined;
          const progress = toNumber(item['progress']);

          const result: CustomerDocumentItem = {
            _id: id
          };

          if (originalName) result.originalName = originalName;
          if (uploadedAt) result.uploadedAt = uploadedAt;
          if (typeof fileSize === 'number') result.fileSize = fileSize;
          if (mimeType) result.mimeType = mimeType;
          if (relationship) result.relationship = relationship;
          if (notes) result.notes = notes;
          if (linkedAt) result.linkedAt = linkedAt;
          if (status) result.status = status;
          if (typeof progress === 'number') result.progress = progress;

          return result;
        })
        .filter((item): item is CustomerDocumentItem => item !== null);
    };

    const responseRecord = isRecord(response) ? response : null;
    const dataRecord = responseRecord && isRecord(responseRecord['data'])
      ? (responseRecord['data'] as Record<string, unknown>)
      : undefined;
    const topLevelDocuments = responseRecord ? responseRecord['documents'] : undefined;
    const documents = collectDocuments(
      (dataRecord ? dataRecord['documents'] : undefined) ?? topLevelDocuments
    );

    const total =
      toNumber((dataRecord ? dataRecord['total'] : undefined) ?? (responseRecord ? responseRecord['total'] : undefined)) ??
      documents.length;

    const derivedCustomerId =
      toString(dataRecord ? dataRecord['customer_id'] : undefined) ??
      toString(responseRecord ? responseRecord['customer_id'] : undefined) ??
      customerId;

    return {
      customer_id: derivedCustomerId,
      documents,
      total,
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
   * 고객과 문서 연결 해제
   */
  static async unlinkDocumentFromCustomer(customerId: string, documentId: string): Promise<void> {
    if (!customerId.trim()) {
      throw new Error('고객 ID가 필요합니다');
    }

    if (!documentId.trim()) {
      throw new Error('문서 ID가 필요합니다');
    }

    await api.delete(ENDPOINTS.CUSTOMER_DOCUMENT(customerId, documentId));
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
