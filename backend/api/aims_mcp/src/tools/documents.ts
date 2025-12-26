import { z, ZodError } from 'zod';
import { getDB, escapeRegex, toSafeObjectId, COLLECTIONS, formatZodError } from '../db.js';
import { getCurrentUserId } from '../auth.js';
import { sendErrorLog } from '../systemLogger.js';

// 스키마 정의
export const searchDocumentsSchema = z.object({
  query: z.string().describe('검색어'),
  searchMode: z.enum(['semantic', 'keyword']).optional().default('semantic').describe('검색 모드'),
  customerId: z.string().optional().describe('특정 고객의 문서만 검색'),
  limit: z.number().optional().default(10).describe('결과 개수 제한')
});

export const getDocumentSchema = z.object({
  documentId: z.string().describe('문서 ID')
});

export const listCustomerDocumentsSchema = z.object({
  customerId: z.string().describe('고객 ID'),
  limit: z.number().optional().default(20).describe('결과 개수 제한'),
  offset: z.number().optional().default(0).describe('시작 위치 (페이지네이션용)')
});

export const deleteDocumentSchema = z.object({
  documentId: z.string().describe('삭제할 문서 ID')
});

export const deleteDocumentsSchema = z.object({
  documentIds: z.array(z.string()).min(1).describe('삭제할 문서 ID 목록')
});

// Tool 정의
export const documentToolDefinitions = [
  {
    name: 'search_documents',
    description: '문서를 검색합니다. semantic 모드는 AI 기반 의미 검색, keyword 모드는 키워드 검색입니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: '검색어' },
        searchMode: { type: 'string', enum: ['semantic', 'keyword'], description: '검색 모드 (기본: semantic)' },
        customerId: { type: 'string', description: '특정 고객의 문서만 검색' },
        limit: { type: 'number', description: '결과 개수 제한 (기본: 10)' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_document',
    description: '특정 문서의 상세 정보를 조회합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        documentId: { type: 'string', description: '문서 ID' }
      },
      required: ['documentId']
    }
  },
  {
    name: 'list_customer_documents',
    description: '특정 고객의 문서 목록을 조회합니다. offset을 사용하여 페이지네이션이 가능합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: '고객 ID' },
        limit: { type: 'number', description: '결과 개수 제한 (기본: 20)' },
        offset: { type: 'number', description: '시작 위치 (기본: 0, 페이지네이션용)' }
      },
      required: ['customerId']
    }
  },
  {
    name: 'delete_document',
    description: '단일 문서를 삭제합니다. 삭제된 문서는 복구할 수 없으니 주의하세요.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        documentId: { type: 'string', description: '삭제할 문서 ID' }
      },
      required: ['documentId']
    }
  },
  {
    name: 'delete_documents',
    description: '여러 문서를 한 번에 삭제합니다. 삭제된 문서는 복구할 수 없으니 주의하세요.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        documentIds: {
          type: 'array',
          items: { type: 'string' },
          description: '삭제할 문서 ID 목록'
        }
      },
      required: ['documentIds']
    }
  }
];

// RAG API 타임아웃 (30초)
const RAG_API_TIMEOUT_MS = 30000;

/**
 * 문서 검색 핸들러 (RAG API 연동)
 */
export async function handleSearchDocuments(args: unknown) {
  try {
    const params = searchDocumentsSchema.parse(args);
    const userId = getCurrentUserId();

    // AbortController로 타임아웃 설정
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RAG_API_TIMEOUT_MS);

    try {
      // RAG API 호출 (타임아웃 적용)
      const response = await fetch('http://localhost:8000/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: params.query,
          search_mode: params.searchMode || 'semantic',
          user_id: userId,
          customer_id: params.customerId,
          top_k: params.limit || 10
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`RAG API 오류: ${response.status}`);
      }

      const result = await response.json() as {
        search_mode: string;
        answer: string | null;
        search_results: Array<{
          doc_id: string;
          score: number;
          final_score?: number;
          payload: {
            original_name: string;
            preview: string;
            mime: string;
            uploaded_at: string;
          };
        }>;
      };

      // 결과 포맷팅
      const formattedResult = {
        searchMode: result.search_mode,
        answer: result.answer,
        resultCount: result.search_results?.length || 0,
        documents: (result.search_results || []).map((doc: {
          doc_id: string;
          score: number;
          final_score?: number;
          payload: {
            original_name: string;
            preview: string;
            mime: string;
            uploaded_at: string;
          };
        }) => ({
          id: doc.doc_id,
          filename: doc.payload?.original_name,
          preview: doc.payload?.preview?.substring(0, 200) + '...',
          mimeType: doc.payload?.mime,
          uploadedAt: doc.payload?.uploaded_at,
          score: doc.final_score || doc.score
        }))
      };

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(formattedResult, null, 2)
        }]
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      // AbortController 타임아웃 에러 처리
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        throw new Error(`RAG API 응답 시간 초과 (${RAG_API_TIMEOUT_MS / 1000}초)`);
      }
      throw fetchError;
    }
  } catch (error) {
    // 에러 로깅
    console.error('[MCP] search_documents 에러:', error);
    sendErrorLog('aims_mcp', 'search_documents 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `문서 검색 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * 문서 상세 조회 핸들러
 */
export async function handleGetDocument(args: unknown) {
  try {
    const params = getDocumentSchema.parse(args);
    const db = getDB();
    const userId = getCurrentUserId();

    const objectId = toSafeObjectId(params.documentId);
    if (!objectId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '유효하지 않은 문서 ID입니다.' }]
      };
    }

    const document = await db.collection(COLLECTIONS.FILES).findOne({
      _id: objectId,
      ownerId: userId
    });

    if (!document) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '문서를 찾을 수 없습니다.' }]
      };
    }

    const safeDocument = {
      id: document._id.toString(),
      filename: document.upload?.originalName,
      mimeType: document.upload?.mimeType,
      size: document.upload?.size,
      uploadedAt: document.upload?.uploaded_at,
      customerId: document.customer_relation?.customer_id?.toString(),
      customerName: document.customer_relation?.customer_name,
      tags: document.meta?.tags || document.ocr?.tags || [],
      summary: document.meta?.summary || document.ocr?.summary,
      status: document.status,
      processedAt: document.processedAt
    };

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(safeDocument, null, 2)
      }]
    };
  } catch (error) {
    // 에러 로깅
    console.error('[MCP] get_document 에러:', error);
    sendErrorLog('aims_mcp', 'get_document 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `문서 조회 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * 고객별 문서 목록 조회 핸들러
 */
export async function handleListCustomerDocuments(args: unknown) {
  try {
    const params = listCustomerDocumentsSchema.parse(args);
    const db = getDB();
    const userId = getCurrentUserId();

    const objectId = toSafeObjectId(params.customerId);
    if (!objectId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '유효하지 않은 고객 ID입니다.' }]
      };
    }

    // 해당 고객이 현재 사용자의 고객인지 확인
    const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
      _id: objectId,
      'meta.created_by': userId
    });

    if (!customer) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '고객을 찾을 수 없습니다.' }]
      };
    }

    const limit = params.limit || 20;
    const offset = params.offset || 0;

    const documents = await db.collection(COLLECTIONS.FILES)
      .find({
        customerId: objectId,
        ownerId: userId
      })
      .sort({ 'upload.uploaded_at': -1 })
      .skip(offset)
      .limit(limit)
      .project({
        _id: 1,
        'upload.originalName': 1,
        'upload.mimeType': 1,
        'upload.size': 1,
        'upload.uploaded_at': 1,
        'meta.tags': 1,
        'ocr.tags': 1,
        status: 1
      })
      .toArray();

    const totalCount = await db.collection(COLLECTIONS.FILES).countDocuments({
      customerId: objectId,
      ownerId: userId
    });

    const hasMore = offset + documents.length < totalCount;
    const nextOffset = hasMore ? offset + documents.length : null;

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          customerId: params.customerId,
          customerName: customer.personal_info?.name,
          count: documents.length,
          totalCount,
          offset,
          hasMore,
          nextOffset,
          // AI 지시: 사용자가 "더 보여줘"하면 이 customerId와 nextOffset 사용
          _paginationHint: hasMore
            ? `다음 페이지: list_customer_documents(customerId="${params.customerId}", offset=${nextOffset})`
            : null,
          documents: documents.map(doc => ({
            id: doc._id.toString(),
            filename: doc.upload?.originalName,
            mimeType: doc.upload?.mimeType,
            size: doc.upload?.size,
            uploadedAt: doc.upload?.uploaded_at,
            tags: doc.meta?.tags || doc.ocr?.tags || [],
            status: doc.status
          }))
        }, null, 2)
      }]
    };
  } catch (error) {
    // 에러 로깅
    console.error('[MCP] list_customer_documents 에러:', error);
    sendErrorLog('aims_mcp', 'list_customer_documents 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `문서 목록 조회 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * 단일 문서 삭제 핸들러
 */
export async function handleDeleteDocument(args: unknown) {
  try {
    const params = deleteDocumentSchema.parse(args);
    const db = getDB();
    const userId = getCurrentUserId();

    const objectId = toSafeObjectId(params.documentId);
    if (!objectId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '유효하지 않은 문서 ID입니다.' }]
      };
    }

    // 소유권 검증: 해당 설계사의 문서만 삭제 가능
    const document = await db.collection(COLLECTIONS.FILES).findOne({
      _id: objectId,
      ownerId: userId
    });

    if (!document) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '문서를 찾을 수 없거나 접근 권한이 없습니다.' }]
      };
    }

    const filename = document.upload?.originalName || '알 수 없는 파일';

    // 고객 참조 정리 - 이 문서를 참조하는 모든 고객의 documents 배열에서 제거
    await db.collection(COLLECTIONS.CUSTOMERS).updateMany(
      { 'documents.document_id': objectId },
      {
        $pull: { documents: { document_id: objectId } } as any,
        $set: { 'meta.updated_at': new Date() }
      }
    );

    // 문서 삭제
    await db.collection(COLLECTIONS.FILES).deleteOne({ _id: objectId });

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          deletedDocumentId: params.documentId,
          filename,
          message: `문서가 성공적으로 삭제되었습니다: ${filename}`
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] delete_document 에러:', error);
    sendErrorLog('aims_mcp', 'delete_document 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `문서 삭제 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * 복수 문서 삭제 핸들러
 */
export async function handleDeleteDocuments(args: unknown) {
  try {
    const params = deleteDocumentsSchema.parse(args);
    const db = getDB();
    const userId = getCurrentUserId();

    // ObjectId 변환 및 유효성 검사
    const objectIds = params.documentIds
      .map(id => toSafeObjectId(id))
      .filter((id): id is import('mongodb').ObjectId => id !== null);

    if (objectIds.length === 0) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '유효한 문서 ID가 없습니다.' }]
      };
    }

    // 소유권 검증: 해당 설계사의 문서만 삭제 가능
    const ownedDocs = await db.collection(COLLECTIONS.FILES)
      .find({ _id: { $in: objectIds }, ownerId: userId })
      .toArray();

    const ownedDocIds = ownedDocs.map(d => d._id.toString());
    const unauthorizedIds = params.documentIds.filter(id => !ownedDocIds.includes(id));

    if (unauthorizedIds.length > 0 && ownedDocs.length === 0) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '삭제 권한이 있는 문서가 없습니다.' }]
      };
    }

    const filenames = ownedDocs.map(d => d.upload?.originalName || '알 수 없는 파일');
    const ownedObjectIds = ownedDocs.map(d => d._id);

    // 고객 참조 정리
    await db.collection(COLLECTIONS.CUSTOMERS).updateMany(
      { 'documents.document_id': { $in: ownedObjectIds } },
      {
        $pull: { documents: { document_id: { $in: ownedObjectIds } } } as any,
        $set: { 'meta.updated_at': new Date() }
      }
    );

    // 문서 삭제
    const deleteResult = await db.collection(COLLECTIONS.FILES).deleteMany({
      _id: { $in: ownedObjectIds }
    });

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          requestedCount: params.documentIds.length,
          deletedCount: deleteResult.deletedCount,
          deletedFilenames: filenames,
          unauthorizedIds: unauthorizedIds.length > 0 ? unauthorizedIds : undefined,
          message: `${deleteResult.deletedCount}개의 문서가 성공적으로 삭제되었습니다.`
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] delete_documents 에러:', error);
    sendErrorLog('aims_mcp', 'delete_documents 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `문서 삭제 실패: ${errorMessage}`
      }]
    };
  }
}
