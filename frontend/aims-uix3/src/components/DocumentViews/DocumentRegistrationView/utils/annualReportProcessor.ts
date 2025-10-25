/**
 * Annual Report 처리 유틸리티
 *
 * AR과 문서의 중복 검사 및 처리 로직을 독립 함수로 제공
 */

import { AnnualReportApi } from '@/features/customer/api/annualReportApi';
import { DocumentService } from '@/services/DocumentService';
import { calculateFileHash } from '@/features/customer/utils/fileHash';
import type { CheckAnnualReportResult } from '@/features/customer/utils/pdfParser';

export interface ProcessAnnualReportFileResult {
  /** AR 파싱을 진행해야 하는가 */
  shouldParseAr: boolean;
  /** 문서 업로드를 진행해야 하는가 */
  shouldUploadDoc: boolean;
  /** AR 중복 여부 */
  isDuplicateAr: boolean;
  /** 문서 중복 여부 */
  isDuplicateDoc: boolean;
}

/**
 * Annual Report 파일 처리
 *
 * AR 중복 검사와 문서 중복 검사를 수행하여
 * AR 파싱 및 문서 업로드 진행 여부를 결정
 *
 * @param file - 업로드할 파일
 * @param customerId - 대상 고객 ID
 * @param metadata - AR 메타데이터 (PDF 파싱 결과)
 * @returns 처리 결과 (파싱/업로드 여부, 중복 여부)
 */
export async function processAnnualReportFile(
  file: File,
  customerId: string,
  metadata?: CheckAnnualReportResult['metadata']
): Promise<ProcessAnnualReportFileResult> {
  // 기본값
  let isDuplicateAr = false;
  let isDuplicateDoc = false;

  // 1. AR 중복 검사 (메타데이터가 있는 경우에만)
  if (metadata?.issue_date) {
    try {
      const existingReports = await AnnualReportApi.getAnnualReports(customerId, 100);

      if (existingReports.success && existingReports.data) {
        const existingIssueDates = existingReports.data.reports
          .map(r => r.issue_date?.substring(0, 10))
          .filter(date => date); // 빈 문자열 제거

        const currentIssueDate = metadata.issue_date;
        isDuplicateAr = existingIssueDates.includes(currentIssueDate);
      }
    } catch (error) {
      console.error('[processAnnualReportFile] AR 중복 검사 실패:', error);
      // 에러 발생 시 중복 아닌 것으로 처리 (안전하게 진행)
      isDuplicateAr = false;
    }
  }

  // 2. 문서 중복 검사 (파일 해시 기반)
  try {
    const uploadFileHash = await calculateFileHash(file);

    // 고객의 문서 목록 조회
    const customerDocs = await DocumentService.getCustomerDocuments(customerId);

    if (customerDocs.documents && customerDocs.documents.length > 0) {
      // 각 document_id로 file_hash 조회
      for (const doc of customerDocs.documents) {
        try {
          const docStatus = await fetch(`http://tars.giize.com:3010/api/documents/${doc._id}/status`);
          const docData = await docStatus.json();

          if (docData.success && docData.data?.raw?.meta?.file_hash) {
            const existingHash = docData.data.raw.meta.file_hash;

            if (uploadFileHash === existingHash) {
              isDuplicateDoc = true;
              break;
            }
          }
        } catch (error) {
          console.error('[processAnnualReportFile] 문서 해시 조회 실패:', doc._id, error);
          // 개별 문서 조회 실패는 무시하고 계속 진행
        }
      }
    }
  } catch (error) {
    console.error('[processAnnualReportFile] 문서 중복 검사 실패:', error);
    // 에러 발생 시 중복 아닌 것으로 처리 (안전하게 진행)
    isDuplicateDoc = false;
  }

  // 3. 처리 결정
  const shouldParseAr = !isDuplicateAr;
  const shouldUploadDoc = !isDuplicateDoc;

  return {
    shouldParseAr,
    shouldUploadDoc,
    isDuplicateAr,
    isDuplicateDoc
  };
}
