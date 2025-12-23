import { z, ZodError } from 'zod';
import { ObjectId } from 'mongodb';
import { getDB, toSafeObjectId, COLLECTIONS, formatZodError } from '../db.js';
import { getCurrentUserId } from '../auth.js';
import { sendErrorLog } from '../systemLogger.js';

// 스키마 정의
export const getAnnualReportsSchema = z.object({
  customerId: z.string().describe('고객 ID'),
  limit: z.number().optional().default(10).describe('결과 개수 제한 (기본: 10)')
});

export const getArParsingStatusSchema = z.object({
  fileId: z.string().optional().describe('특정 문서 ID (선택)'),
  customerId: z.string().optional().describe('고객 ID (선택) - 해당 고객의 모든 AR 상태')
});

export const triggerArParsingSchema = z.object({
  fileId: z.string().optional().describe('파싱할 문서 ID (선택)'),
  customerId: z.string().optional().describe('고객 ID (선택) - 해당 고객의 모든 pending AR 파싱')
});

export const getArQueueStatusSchema = z.object({
  limit: z.number().optional().default(20).describe('결과 개수 제한')
});

// Tool 정의
export const annualReportToolDefinitions = [
  {
    name: 'get_annual_reports',
    description: '고객의 Annual Report(연차보고서) 목록을 조회합니다. 계약 정보, 보험료, 발행일 등을 확인할 수 있습니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: '고객 ID' },
        limit: { type: 'number', description: '결과 개수 제한 (기본: 10)' }
      },
      required: ['customerId']
    }
  },
  {
    name: 'get_ar_parsing_status',
    description: 'Annual Report 파싱 상태를 조회합니다. 특정 문서나 고객의 AR 파싱 진행 상황을 확인합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        fileId: { type: 'string', description: '특정 문서 ID (선택)' },
        customerId: { type: 'string', description: '고객 ID (선택)' }
      }
    }
  },
  {
    name: 'trigger_ar_parsing',
    description: 'Annual Report 파싱을 요청합니다. 문서가 파싱 큐에 추가되며, 백그라운드에서 처리됩니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        fileId: { type: 'string', description: '파싱할 문서 ID (선택)' },
        customerId: { type: 'string', description: '고객 ID (선택) - 해당 고객의 모든 pending AR 파싱' }
      }
    }
  },
  {
    name: 'get_ar_queue_status',
    description: 'Annual Report 파싱 큐 상태를 조회합니다. 대기 중, 처리 중, 실패한 작업을 확인합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: '결과 개수 제한 (기본: 20)' }
      }
    }
  }
];

/**
 * Annual Reports 조회 핸들러
 */
export async function handleGetAnnualReports(args: unknown) {
  try {
    const params = getAnnualReportsSchema.parse(args);
    const db = getDB();
    const userId = getCurrentUserId();

    const objectId = toSafeObjectId(params.customerId);
    if (!objectId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '유효하지 않은 고객 ID입니다.' }]
      };
    }

    // 고객이 해당 설계사의 고객인지 확인
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

    const customerName = customer.personal_info?.name || '알 수 없음';

    // annual_reports 배열에서 조회 (최신순)
    const annualReports = customer.annual_reports || [];

    // 최신순 정렬 및 limit 적용
    const sortedReports = annualReports
      .sort((a: any, b: any) => {
        const dateA = new Date(a.parsed_at || a.issue_date || 0);
        const dateB = new Date(b.parsed_at || b.issue_date || 0);
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, params.limit);

    // 요약 정보 생성
    const formattedReports = sortedReports.map((report: any, index: number) => ({
      index,
      issueDate: report.issue_date,
      parsedAt: report.parsed_at,
      customerName: report.customer_name || customerName,
      totalContracts: report.contracts?.length || 0,
      totalMonthlyPremium: report.total_monthly_premium || 0,
      sourceFileId: report.source_file_id?.toString(),
      contracts: (report.contracts || []).slice(0, 5).map((c: any) => ({
        순번: c['순번'],
        보험상품: c['보험상품'],
        보험사: c['보험사'],
        월보험료: c['월보험료'],
        계약상태: c['계약상태']
      }))
    }));

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          customerId: params.customerId,
          customerName,
          totalReports: annualReports.length,
          count: formattedReports.length,
          reports: formattedReports,
          message: annualReports.length > 0
            ? `${customerName}님의 Annual Report ${annualReports.length}건 중 ${formattedReports.length}건을 조회했습니다.`
            : `${customerName}님의 Annual Report가 없습니다.`
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] get_annual_reports 에러:', error);
    sendErrorLog('aims_mcp', 'get_annual_reports 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `Annual Report 조회 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * AR 파싱 상태 조회 핸들러
 */
export async function handleGetArParsingStatus(args: unknown) {
  try {
    const params = getArParsingStatusSchema.parse(args || {});
    const db = getDB();
    const userId = getCurrentUserId();

    if (!params.fileId && !params.customerId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: 'fileId 또는 customerId 중 하나를 지정해주세요.' }]
      };
    }

    const results: any[] = [];

    if (params.fileId) {
      // 특정 파일의 상태 조회
      const fileObjectId = toSafeObjectId(params.fileId);
      if (!fileObjectId) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: '유효하지 않은 문서 ID입니다.' }]
        };
      }

      const file = await db.collection(COLLECTIONS.FILES).findOne({
        _id: fileObjectId,
        ownerId: userId
      });

      if (!file) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: '문서를 찾을 수 없습니다.' }]
        };
      }

      // 큐 상태도 확인
      const queueItem = await db.collection('ar_parse_queue').findOne({
        file_id: fileObjectId
      });

      results.push({
        fileId: params.fileId,
        filename: file.upload?.originalName,
        isAnnualReport: file.is_annual_report || false,
        parsingStatus: file.ar_parsing_status || 'not_started',
        parsingError: file.ar_parsing_error,
        retryCount: file.ar_retry_count || 0,
        queueStatus: queueItem?.status,
        queueRetryCount: queueItem?.retry_count
      });
    }

    if (params.customerId) {
      // 고객의 모든 AR 문서 상태 조회
      const customerObjectId = toSafeObjectId(params.customerId);
      if (!customerObjectId) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: '유효하지 않은 고객 ID입니다.' }]
        };
      }

      // 고객 소유권 확인
      const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
        _id: customerObjectId,
        'meta.created_by': userId
      });

      if (!customer) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: '고객을 찾을 수 없습니다.' }]
        };
      }

      // 해당 고객의 AR 문서들 조회
      const arFiles = await db.collection(COLLECTIONS.FILES)
        .find({
          customerId: customerObjectId,
          is_annual_report: true,
          ownerId: userId
        })
        .sort({ 'upload.uploaded_at': -1 })
        .limit(20)
        .toArray();

      for (const file of arFiles) {
        const queueItem = await db.collection('ar_parse_queue').findOne({
          file_id: file._id
        });

        results.push({
          fileId: file._id.toString(),
          filename: file.upload?.originalName,
          parsingStatus: file.ar_parsing_status || 'not_started',
          parsingError: file.ar_parsing_error,
          retryCount: file.ar_retry_count || 0,
          queueStatus: queueItem?.status,
          uploadedAt: file.upload?.uploaded_at
        });
      }
    }

    // 상태별 통계
    const stats = {
      total: results.length,
      completed: results.filter(r => r.parsingStatus === 'completed').length,
      pending: results.filter(r => r.parsingStatus === 'pending' || r.parsingStatus === 'not_started').length,
      processing: results.filter(r => r.parsingStatus === 'processing').length,
      error: results.filter(r => r.parsingStatus === 'error').length
    };

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          stats,
          documents: results,
          message: `AR 파싱 상태: 완료 ${stats.completed}건, 대기 ${stats.pending}건, 처리중 ${stats.processing}건, 오류 ${stats.error}건`
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] get_ar_parsing_status 에러:', error);
    sendErrorLog('aims_mcp', 'get_ar_parsing_status 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `AR 파싱 상태 조회 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * AR 파싱 트리거 핸들러
 */
export async function handleTriggerArParsing(args: unknown) {
  try {
    const params = triggerArParsingSchema.parse(args || {});
    const db = getDB();
    const userId = getCurrentUserId();

    if (!params.fileId && !params.customerId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: 'fileId 또는 customerId 중 하나를 지정해주세요.' }]
      };
    }

    let enqueuedCount = 0;
    let skippedCount = 0;
    const enqueuedFiles: string[] = [];

    if (params.fileId) {
      // 특정 파일 파싱 요청
      const fileObjectId = toSafeObjectId(params.fileId);
      if (!fileObjectId) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: '유효하지 않은 문서 ID입니다.' }]
        };
      }

      const file = await db.collection(COLLECTIONS.FILES).findOne({
        _id: fileObjectId,
        ownerId: userId
      });

      if (!file) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: '문서를 찾을 수 없습니다.' }]
        };
      }

      if (!file.is_annual_report) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: '이 문서는 Annual Report가 아닙니다.' }]
        };
      }

      // 이미 완료된 경우 스킵
      if (file.ar_parsing_status === 'completed') {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: '이 문서는 이미 파싱이 완료되었습니다.',
              enqueuedCount: 0
            }, null, 2)
          }]
        };
      }

      // 큐에 이미 있는지 확인
      const existingQueue = await db.collection('ar_parse_queue').findOne({
        file_id: fileObjectId
      });

      if (existingQueue && existingQueue.status !== 'failed') {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: '이 문서는 이미 파싱 큐에 있습니다.',
              queueStatus: existingQueue.status,
              enqueuedCount: 0
            }, null, 2)
          }]
        };
      }

      // 큐에 추가
      const customerId = file.customerId;
      if (!customerId) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: '문서에 고객이 연결되어 있지 않습니다.' }]
        };
      }

      await db.collection('ar_parse_queue').insertOne({
        file_id: fileObjectId,
        customer_id: customerId,
        status: 'pending',
        retry_count: 0,
        created_at: new Date(),
        metadata: { trigger_source: 'mcp', user_id: userId }
      });

      // 파일 상태 업데이트
      await db.collection(COLLECTIONS.FILES).updateOne(
        { _id: fileObjectId },
        { $set: { ar_parsing_status: 'pending' } }
      );

      enqueuedCount = 1;
      enqueuedFiles.push(file.upload?.originalName || params.fileId);
    }

    if (params.customerId) {
      // 고객의 모든 pending AR 파싱 요청
      const customerObjectId = toSafeObjectId(params.customerId);
      if (!customerObjectId) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: '유효하지 않은 고객 ID입니다.' }]
        };
      }

      // 고객 소유권 확인
      const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
        _id: customerObjectId,
        'meta.created_by': userId
      });

      if (!customer) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: '고객을 찾을 수 없습니다.' }]
        };
      }

      // pending 상태의 AR 문서들 조회
      const pendingFiles = await db.collection(COLLECTIONS.FILES)
        .find({
          customerId: customerObjectId,
          is_annual_report: true,
          ownerId: userId,
          ar_parsing_status: { $in: ['pending', null, 'error'] }
        })
        .limit(20)
        .toArray();

      for (const file of pendingFiles) {
        // 큐에 이미 있는지 확인
        const existingQueue = await db.collection('ar_parse_queue').findOne({
          file_id: file._id,
          status: { $ne: 'failed' }
        });

        if (existingQueue) {
          skippedCount++;
          continue;
        }

        // 큐에 추가
        await db.collection('ar_parse_queue').insertOne({
          file_id: file._id,
          customer_id: customerObjectId,
          status: 'pending',
          retry_count: 0,
          created_at: new Date(),
          metadata: { trigger_source: 'mcp', user_id: userId }
        });

        // 파일 상태 업데이트
        await db.collection(COLLECTIONS.FILES).updateOne(
          { _id: file._id },
          { $set: { ar_parsing_status: 'pending' } }
        );

        enqueuedCount++;
        enqueuedFiles.push(file.upload?.originalName || file._id.toString());
      }
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          enqueuedCount,
          skippedCount,
          enqueuedFiles: enqueuedFiles.slice(0, 10),
          message: enqueuedCount > 0
            ? `${enqueuedCount}건의 AR 파싱 작업이 큐에 등록되었습니다.`
            : '등록할 파싱 작업이 없습니다.'
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] trigger_ar_parsing 에러:', error);
    sendErrorLog('aims_mcp', 'trigger_ar_parsing 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `AR 파싱 트리거 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * AR 파싱 큐 상태 조회 핸들러
 */
export async function handleGetArQueueStatus(args: unknown) {
  try {
    const params = getArQueueStatusSchema.parse(args || {});
    const db = getDB();
    const userId = getCurrentUserId();

    // 전체 큐 통계
    const stats = {
      pending: await db.collection('ar_parse_queue').countDocuments({ status: 'pending' }),
      processing: await db.collection('ar_parse_queue').countDocuments({ status: 'processing' }),
      failed: await db.collection('ar_parse_queue').countDocuments({ status: 'failed' })
    };

    // 해당 사용자의 큐 항목들 (파일 소유권 기반)
    const queueItems = await db.collection('ar_parse_queue')
      .aggregate([
        {
          $lookup: {
            from: 'files',
            localField: 'file_id',
            foreignField: '_id',
            as: 'file'
          }
        },
        { $unwind: '$file' },
        { $match: { 'file.ownerId': userId } },
        { $sort: { created_at: -1 } },
        { $limit: params.limit }
      ])
      .toArray();

    const formattedItems = queueItems.map((item: any) => ({
      fileId: item.file_id.toString(),
      filename: item.file?.upload?.originalName,
      status: item.status,
      retryCount: item.retry_count,
      error: item.error,
      createdAt: item.created_at,
      lastUpdatedAt: item.updated_at
    }));

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          globalStats: stats,
          userQueueItems: formattedItems,
          userQueueCount: formattedItems.length,
          message: `전체 큐: 대기 ${stats.pending}건, 처리중 ${stats.processing}건, 실패 ${stats.failed}건`
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] get_ar_queue_status 에러:', error);
    sendErrorLog('aims_mcp', 'get_ar_queue_status 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `AR 큐 상태 조회 실패: ${errorMessage}`
      }]
    };
  }
}
