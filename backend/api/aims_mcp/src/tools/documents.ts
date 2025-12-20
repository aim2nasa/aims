import { z } from 'zod';
import { getDB, escapeRegex, toSafeObjectId, COLLECTIONS } from '../db.js';
import { getCurrentUserId } from '../auth.js';

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
  limit: z.number().optional().default(20).describe('결과 개수 제한')
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
    description: '특정 고객의 문서 목록을 조회합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: '고객 ID' },
        limit: { type: 'number', description: '결과 개수 제한 (기본: 20)' }
      },
      required: ['customerId']
    }
  }
];

/**
 * 문서 검색 핸들러 (RAG API 연동)
 */
export async function handleSearchDocuments(args: unknown) {
  try {
    const params = searchDocumentsSchema.parse(args);
    const userId = getCurrentUserId();

    // RAG API 호출
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
      })
    });

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
  } catch (error) {
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `문서 검색 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
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
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `문서 조회 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
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

    const documents = await db.collection(COLLECTIONS.FILES)
      .find({
        'customer_relation.customer_id': objectId,
        ownerId: userId
      })
      .sort({ 'upload.uploaded_at': -1 })
      .limit(params.limit || 20)
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
      'customer_relation.customer_id': objectId,
      ownerId: userId
    });

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          customerId: params.customerId,
          customerName: customer.personal_info?.name,
          count: documents.length,
          totalCount,
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
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `문서 목록 조회 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
      }]
    };
  }
}
