import { z, ZodError } from 'zod';
import { getDB, escapeRegex, toSafeObjectId, COLLECTIONS, formatZodError } from '../db.js';
import { getCurrentUserId } from '../auth.js';
import { sendErrorLog } from '../systemLogger.js';

// 스키마 정의
export const searchDocumentsSchema = z.object({
  query: z.string().describe('검색어'),
  searchMode: z.enum(['semantic', 'keyword']).optional().default('semantic').describe('검색 모드'),
  customerId: z.string().optional().describe('특정 고객의 문서만 검색'),
  limit: z.number().optional().default(10).describe('결과 개수 제한'),
  offset: z.number().optional().default(0).describe('시작 위치 (페이지네이션용)')
});

export const getDocumentSchema = z.object({
  documentId: z.string().describe('문서 ID')
});

export const listCustomerDocumentsSchema = z.object({
  customerId: z.string().describe('고객 ID'),
  limit: z.number().optional().default(20).describe('결과 개수 제한'),
  offset: z.number().optional().default(0).describe('시작 위치 (페이지네이션용)')
});

export const findDocumentByFilenameSchema = z.object({
  filename: z.string().describe('찾을 파일명 (부분 일치 검색)'),
  limit: z.number().optional().default(5).describe('결과 개수 제한')
});

// Tool 정의
export const documentToolDefinitions = [
  {
    name: 'search_documents',
    description: `문서를 검색합니다. semantic 모드는 AI 기반 의미 검색, keyword 모드는 키워드 검색입니다.

페이지네이션 지원:
- offset을 사용하여 추가 결과를 조회할 수 있습니다
- 응답의 hasMore가 true이면 nextOffset으로 다음 페이지 조회 가능
- 사용자가 "더 보여줘"하면 동일한 query와 searchMode로 nextOffset 사용`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: '검색어' },
        searchMode: { type: 'string', enum: ['semantic', 'keyword'], description: '검색 모드 (기본: semantic)' },
        customerId: { type: 'string', description: '특정 고객의 문서만 검색' },
        limit: { type: 'number', description: '결과 개수 제한 (기본: 10)' },
        offset: { type: 'number', description: '시작 위치 (기본: 0, 페이지네이션용)' }
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
    name: 'find_document_by_filename',
    description: `파일명으로 최근 업로드된 문서를 검색합니다.

용도: 사용자가 업로드한 파일의 정보를 확인할 때 사용
- 파일명 부분 일치로 검색합니다
- 최근 업로드된 문서부터 표시됩니다`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        filename: { type: 'string', description: '파일명 (부분 일치)' },
        limit: { type: 'number', description: '결과 개수 (기본: 5)' }
      },
      required: ['filename']
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
      const limit = params.limit || 10;
      const offset = params.offset || 0;

      // RAG API 호출 (타임아웃 적용)
      const response = await fetch('http://localhost:8000/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.RAG_API_KEY || 'iWgbzs5Rbgfb7Xxy6o9P6KkrGkYpfdOK8iaGsT1lcjM'
        },
        body: JSON.stringify({
          query: params.query,
          search_mode: params.searchMode || 'semantic',
          user_id: userId,
          customer_id: params.customerId,
          top_k: limit,
          offset: offset
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`RAG API 오류: ${response.status}`);
      }

      // RAG API 응답 구조 (키워드 검색과 시맨틱 검색이 다른 구조를 반환)
      const result = await response.json() as {
        search_mode: string;
        answer: string | null;
        total_count?: number;
        has_more?: boolean;
        search_results: Array<{
          // 시맨틱 검색 형식
          doc_id?: string;
          score?: number;
          final_score?: number;
          payload?: {
            original_name: string;
            preview: string;
            mime: string;
            uploaded_at: string;
          };
          // 키워드 검색 형식 (MongoDB 문서 직접 반환)
          _id?: string;
          upload?: {
            originalName: string;
            uploaded_at: string;
          };
          meta?: {
            mime: string;
            summary: string;
          };
          ocr?: {
            summary: string;
          };
        }>;
      };

      // 페이지네이션 계산
      const resultCount = result.search_results?.length || 0;
      const totalCount = result.total_count || resultCount;
      const hasMore = result.has_more ?? (offset + resultCount < totalCount);
      const nextOffset = hasMore ? offset + resultCount : null;

      // 결과 포맷팅 (두 가지 응답 구조 모두 처리)
      const formattedResult = {
        searchMode: result.search_mode,
        query: params.query,
        answer: result.answer,
        resultCount,
        totalCount,
        offset,
        hasMore,
        nextOffset,
        // AI 지시: 사용자가 "더 보여줘"하면 이 query, searchMode, nextOffset 사용
        _paginationHint: hasMore
          ? `다음 페이지: search_documents(query="${params.query}", searchMode="${params.searchMode || 'semantic'}", offset=${nextOffset})`
          : null,
        documents: (result.search_results || []).map((doc) => {
          // 키워드 검색 형식 (MongoDB 문서)
          if (doc._id) {
            const preview = doc.ocr?.summary || doc.meta?.summary || '';
            return {
              id: doc._id,
              filename: doc.upload?.originalName || '알 수 없는 파일',
              preview: preview.substring(0, 200) + (preview.length > 200 ? '...' : ''),
              mimeType: doc.meta?.mime,
              uploadedAt: doc.upload?.uploaded_at
            };
          }
          // 시맨틱 검색 형식
          return {
            id: doc.doc_id,
            filename: doc.payload?.original_name,
            preview: doc.payload?.preview?.substring(0, 200) + '...',
            mimeType: doc.payload?.mime,
            uploadedAt: doc.payload?.uploaded_at,
            score: doc.final_score || doc.score
          };
        })
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
        'meta.summary': 1,
        'ocr.tags': 1,
        'ocr.summary': 1,
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
            summary: doc.meta?.summary || doc.ocr?.summary || null,
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
 * 파일명으로 문서 검색 핸들러
 */
export async function handleFindDocumentByFilename(args: unknown) {
  try {
    const params = findDocumentByFilenameSchema.parse(args);
    const db = getDB();
    const userId = getCurrentUserId();

    const limit = params.limit || 5;

    // 파일명으로 검색 (부분 일치, 최근 업로드 순)
    const documents = await db.collection(COLLECTIONS.FILES)
      .find({
        ownerId: userId,
        'upload.originalName': { $regex: escapeRegex(params.filename), $options: 'i' }
      })
      .sort({ 'upload.uploaded_at': -1 })
      .limit(limit)
      .project({
        _id: 1,
        'upload.originalName': 1,
        'upload.uploaded_at': 1,
        customerId: 1
      })
      .toArray();

    if (documents.length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            found: false,
            message: `"${params.filename}" 파일을 찾을 수 없습니다.`
          }, null, 2)
        }]
      };
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          found: true,
          count: documents.length,
          documents: documents.map(doc => ({
            id: doc._id.toString(),
            filename: doc.upload?.originalName,
            uploadedAt: doc.upload?.uploaded_at,
            hasCustomer: !!doc.customerId
          }))
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] find_document_by_filename 에러:', error);
    sendErrorLog('aims_mcp', 'find_document_by_filename 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `파일 검색 실패: ${errorMessage}`
      }]
    };
  }
}
