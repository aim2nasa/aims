/**
 * Annual Report 처리 유틸리티
 *
 * 문서 중복 검사 로직을 제공
 */

import { DocumentService } from '@/services/DocumentService';
import { calculateFileHash } from '@/features/customer/utils/fileHash';

export interface ProcessAnnualReportFileResult {
  /** 문서 업로드를 진행해야 하는가 */
  shouldUploadDoc: boolean;
  /** 문서 중복 여부 */
  isDuplicateDoc: boolean;
}

/**
 * Annual Report 파일 처리
 *
 * 문서 중복 검사를 수행하여 문서 업로드 진행 여부를 결정
 * AR은 중복 여부와 관계없이 무조건 등록 진행
 *
 * @param file - 업로드할 파일
 * @param customerId - 대상 고객 ID
 * @returns 처리 결과 (업로드 여부, 중복 여부)
 */
export async function processAnnualReportFile(
  file: File,
  customerId: string
): Promise<ProcessAnnualReportFileResult> {
  // 기본값
  let isDuplicateDoc = false;

  // 문서 중복 검사 (파일 해시 기반)
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

  // 처리 결정
  const shouldUploadDoc = !isDuplicateDoc;

  return {
    shouldUploadDoc,
    isDuplicateDoc
  };
}
