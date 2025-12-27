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

export const linkDocumentToCustomerSchema = z.object({
  documentId: z.string().describe('연결할 문서의 내부 식별자'),
  customerId: z.string().describe('연결할 고객의 내부 식별자'),
  relationship: z.string().optional().default('general').describe('문서와 고객의 관계 유형 (예: general, contract, claim, annual_report)'),
  notes: z.string().optional().describe('문서 관련 메모')
});

export const findDocumentByFilenameSchema = z.object({
  filename: z.string().describe('찾을 파일명 (부분 일치 검색)'),
  limit: z.number().optional().default(5).describe('결과 개수 제한')
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
  },
  {
    name: 'link_document_to_customer',
    description: `문서를 고객에게 연결합니다.

중요 지시사항:
- 사용자가 파일을 업로드하면서 고객명을 언급했다면, 확인 없이 바로 연결하세요
- "연결할까요?"라고 묻지 말고 즉시 실행하세요
- 먼저 find_document_by_filename으로 파일을 찾고, search_customers로 고객을 찾은 후 연결하세요
- 사용자에게 내부 식별자를 언급하지 마세요`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        documentId: { type: 'string', description: '문서 내부 식별자 (find_document_by_filename으로 조회)' },
        customerId: { type: 'string', description: '고객 내부 식별자 (search_customers로 조회)' },
        relationship: {
          type: 'string',
          description: '문서와 고객의 관계 유형 (기본: general). 옵션: general, contract, claim, annual_report'
        },
        notes: { type: 'string', description: '메모 (선택)' }
      },
      required: ['documentId', 'customerId']
    }
  },
  {
    name: 'find_document_by_filename',
    description: `파일명으로 최근 업로드된 문서를 검색합니다.

용도: 사용자가 업로드한 파일을 고객에게 연결하기 전에 내부 식별자를 찾을 때 사용
- 사용자에게 검색 결과의 내부 식별자를 보여주지 마세요
- 이 도구는 내부 처리용이며, 결과를 바로 link_document_to_customer에 사용하세요`,
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

/**
 * 문서를 고객에게 연결하는 핸들러
 */
export async function handleLinkDocumentToCustomer(args: unknown) {
  try {
    const params = linkDocumentToCustomerSchema.parse(args);
    const db = getDB();
    const userId = getCurrentUserId();

    // 문서 ID 검증
    const documentObjectId = toSafeObjectId(params.documentId);
    if (!documentObjectId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '유효하지 않은 문서 ID입니다.' }]
      };
    }

    // 고객 ID 검증
    const customerObjectId = toSafeObjectId(params.customerId);
    if (!customerObjectId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '유효하지 않은 고객 ID입니다.' }]
      };
    }

    // 문서 존재 및 소유권 확인
    const document = await db.collection(COLLECTIONS.FILES).findOne({
      _id: documentObjectId,
      ownerId: userId
    });

    if (!document) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '문서를 찾을 수 없거나 접근 권한이 없습니다.' }]
      };
    }

    // 고객 존재 및 소유권 확인
    const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
      _id: customerObjectId,
      'meta.created_by': userId
    });

    if (!customer) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '고객을 찾을 수 없거나 접근 권한이 없습니다.' }]
      };
    }

    const filename = document.upload?.originalName || '알 수 없는 파일';
    const customerName = customer.personal_info?.name || '알 수 없는 고객';

    // 기존 고객 연결 해제 (이전에 다른 고객에게 연결되어 있었다면)
    const previousCustomerId = document.customerId;
    if (previousCustomerId && previousCustomerId.toString() !== customerObjectId.toString()) {
      await db.collection(COLLECTIONS.CUSTOMERS).updateOne(
        { _id: previousCustomerId },
        {
          $pull: { documents: { document_id: documentObjectId } } as any,
          $set: { 'meta.updated_at': new Date() }
        }
      );
    }

    // 문서에 고객 정보 업데이트
    await db.collection(COLLECTIONS.FILES).updateOne(
      { _id: documentObjectId },
      {
        $set: {
          customerId: customerObjectId,
          customer_relation: {
            customer_id: customerObjectId,
            customer_name: customerName,
            relationship: params.relationship || 'general',
            linked_at: new Date(),
            notes: params.notes
          }
        }
      }
    );

    // 고객의 documents 배열에 문서 추가 (이미 있으면 업데이트)
    const existingDocInCustomer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
      _id: customerObjectId,
      'documents.document_id': documentObjectId
    });

    if (existingDocInCustomer) {
      // 이미 있으면 업데이트
      await db.collection(COLLECTIONS.CUSTOMERS).updateOne(
        { _id: customerObjectId, 'documents.document_id': documentObjectId },
        {
          $set: {
            'documents.$.relationship': params.relationship || 'general',
            'documents.$.notes': params.notes,
            'documents.$.linked_at': new Date(),
            'meta.updated_at': new Date()
          }
        }
      );
    } else {
      // 없으면 추가
      await db.collection(COLLECTIONS.CUSTOMERS).updateOne(
        { _id: customerObjectId },
        {
          $push: {
            documents: {
              document_id: documentObjectId,
              relationship: params.relationship || 'general',
              notes: params.notes,
              linked_at: new Date()
            }
          } as any,
          $set: { 'meta.updated_at': new Date() }
        }
      );
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          documentId: params.documentId,
          customerId: params.customerId,
          filename,
          customerName,
          relationship: params.relationship || 'general',
          notes: params.notes,
          message: `문서 "${filename}"이(가) 고객 "${customerName}"에게 성공적으로 연결되었습니다.`
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] link_document_to_customer 에러:', error);
    sendErrorLog('aims_mcp', 'link_document_to_customer 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `문서 연결 실패: ${errorMessage}`
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
