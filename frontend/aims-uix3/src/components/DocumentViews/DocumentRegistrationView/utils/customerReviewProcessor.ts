/**
 * Customer Review 처리 유틸리티
 *
 * CRS 문서 중복 검사 로직을 제공
 * - 해시 중복 체크
 * - 동일 발행일 + 동일 증권번호 체크
 */

import { DocumentService } from '@/services/DocumentService';
import { calculateFileHash } from '@/features/customer/utils/fileHash';
import { errorReporter } from '@/shared/lib/errorReporter';
import { getAuthToken } from '@/shared/lib/api';
import { CustomerReviewApi } from '@/features/customer/api/customerReviewApi';
import type { UploadFile } from '../types/uploadTypes';
import type { LogLevel } from '../types/logTypes';

/**
 * 발행일을 한글 형식으로 변환 (YYYY-MM-DD → YYYY년 MM월 DD일)
 */
export function formatIssueDateKorean(dateStr?: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[0]}년 ${parseInt(parts[1], 10)}월 ${parseInt(parts[2], 10)}일`;
}

export interface ProcessCustomerReviewFileResult {
  /** 문서 업로드를 진행해야 하는가 */
  shouldUploadDoc: boolean;
  /** 문서 중복 여부 (해시 기반) */
  isDuplicateDoc: boolean;
  /** 발행일+증권번호 중복 여부 */
  isDuplicateIssueDatePolicy: boolean;
  /** 중복된 발행일 (있는 경우) */
  duplicateIssueDate?: string;
  /** 중복된 증권번호 (있는 경우) */
  duplicatePolicyNumber?: string;
}

/**
 * Customer Review 파일 처리
 *
 * 문서 중복 검사를 수행하여 문서 업로드 진행 여부를 결정
 * 1차: 파일 해시 기반 중복 체크
 * 2차: 발행일 + 증권번호 기반 중복 체크
 *
 * @param file - 업로드할 파일
 * @param customerId - 대상 고객 ID
 * @param issueDate - CRS 발행일 (YYYY-MM-DD 형식, optional)
 * @param policyNumber - 증권번호 (optional)
 * @returns 처리 결과 (업로드 여부, 중복 여부)
 */
export async function processCustomerReviewFile(
  file: File,
  customerId: string,
  issueDate?: string,
  policyNumber?: string
): Promise<ProcessCustomerReviewFileResult> {
  // 기본값
  let isDuplicateDoc = false;
  let isDuplicateIssueDatePolicy = false;
  let duplicateIssueDate: string | undefined;
  let duplicatePolicyNumber: string | undefined;

  // 1. 문서 중복 검사 (파일 해시 기반)
  try {
    const uploadFileHash = await calculateFileHash(file);

    // 고객의 문서 목록 조회
    const customerDocs = await DocumentService.getCustomerDocuments(customerId);

    if (customerDocs.documents && customerDocs.documents.length > 0) {
      // 각 document_id로 file_hash 조회
      for (const doc of customerDocs.documents) {
        try {
          const token = getAuthToken();
          const docStatus = await fetch(`/api/documents/${doc._id}/status`, {
            headers: {
              ...(token && { Authorization: `Bearer ${token}` })
            }
          });
          const docData = await docStatus.json();

          if (docData.success && docData.data?.raw?.meta?.file_hash) {
            const existingHash = docData.data.raw.meta.file_hash;

            if (uploadFileHash === existingHash) {
              isDuplicateDoc = true;
              break;
            }
          }
        } catch (error) {
          console.error('[processCustomerReviewFile] 문서 해시 조회 실패:', doc._id, error);
          errorReporter.reportApiError(error as Error, { component: 'customerReviewProcessor.processCustomerReviewFile.hashCheck', payload: { docId: doc._id } });
        }
      }
    }
  } catch (error) {
    console.error('[processCustomerReviewFile] 문서 중복 검사 실패:', error);
    errorReporter.reportApiError(error as Error, { component: 'customerReviewProcessor.processCustomerReviewFile', payload: { customerId } });
    isDuplicateDoc = false;
  }

  // 2. 발행일 + 증권번호 중복 검사 (해시 중복이 아닌 경우만)
  if (!isDuplicateDoc && issueDate && policyNumber) {
    try {
      const crListResponse = await CustomerReviewApi.getCustomerReviews(customerId, 100);

      if (crListResponse.success && crListResponse.data?.reviews) {
        // 발행일 정규화 (YYYY-MM-DD 형식으로 비교)
        const normalizedUploadDate = issueDate.split('T')[0];

        for (const existingCr of crListResponse.data.reviews) {
          const existingPolicyNumber = existingCr.contract_info?.policy_number;
          if (existingCr.issue_date && existingPolicyNumber) {
            const normalizedExistingDate = existingCr.issue_date.split('T')[0];

            // 발행일 + 증권번호 모두 일치해야 중복
            if (normalizedUploadDate === normalizedExistingDate && policyNumber === existingPolicyNumber) {
              isDuplicateIssueDatePolicy = true;
              duplicateIssueDate = normalizedExistingDate;
              duplicatePolicyNumber = existingPolicyNumber;
              console.log(`[processCustomerReviewFile] 발행일+증권번호 중복 감지: ${normalizedUploadDate}, ${policyNumber}`);
              break;
            }
          }
        }
      }
    } catch (error) {
      console.error('[processCustomerReviewFile] 발행일+증권번호 중복 검사 실패:', error);
      errorReporter.reportApiError(error as Error, { component: 'customerReviewProcessor.processCustomerReviewFile.issueDatePolicyCheck', payload: { customerId, issueDate, policyNumber } });
      isDuplicateIssueDatePolicy = false;
    }
  }

  // 처리 결정: 해시 중복 또는 발행일+증권번호 중복 시 업로드 안 함
  const shouldUploadDoc = !isDuplicateDoc && !isDuplicateIssueDatePolicy;

  return {
    shouldUploadDoc,
    isDuplicateDoc,
    isDuplicateIssueDatePolicy,
    duplicateIssueDate,
    duplicatePolicyNumber
  };
}

/**
 * CRS 문서 등록 처리
 *
 * 중복 검사 → CRS 파싱 → 문서 업로드를 일괄 처리
 *
 * @param file - 업로드할 CRS 파일
 * @param customerId - 대상 고객 ID
 * @param issueDate - CRS 발행일 (YYYY-MM-DD 형식)
 * @param policyNumber - 증권번호
 * @param callbacks - 외부 함수 콜백 객체
 * @returns 처리 결과 (성공 여부, 중복 여부)
 */
export async function registerCrDocument(
  file: File,
  customerId: string,
  issueDate: string | undefined,
  policyNumber: string | undefined,
  callbacks: {
    addLog: (level: LogLevel, message: string, details?: string) => void;
    generateFileId: () => string;
    addToUploadQueue: (uploadFile: UploadFile) => void;
    trackCrFile: (fileName: string, customerId: string) => void;
  }
): Promise<{ success: boolean; isDuplicate: boolean; isDuplicateIssueDatePolicy?: boolean }> {
  const { addLog, generateFileId, addToUploadQueue, trackCrFile } = callbacks;

  // 1. 문서 중복 검사 (해시 + 발행일+증권번호)
  const checkResult = await processCustomerReviewFile(file, customerId, issueDate, policyNumber);

  if (checkResult.isDuplicateDoc) {
    // 해시 중복이면 경고 후 종료
    addLog('warning', `중복 문서 감지: ${file.name}`, '이미 존재하는 파일이므로 업로드를 건너뜁니다.');
    return { success: false, isDuplicate: true, isDuplicateIssueDatePolicy: false };
  }

  if (checkResult.isDuplicateIssueDatePolicy) {
    // 발행일+증권번호 중복이면 경고 후 종료
    const formattedDate = formatIssueDateKorean(checkResult.duplicateIssueDate);
    addLog(
      'warning',
      `${formattedDate} 발행, 증권번호 ${checkResult.duplicatePolicyNumber} CRS 이미 존재`,
      `${file.name} 업로드를 건너뜁니다.`
    );
    return { success: false, isDuplicate: false, isDuplicateIssueDatePolicy: true };
  }

  // 2. CRS 파일 추적 등록
  trackCrFile(file.name, customerId);

  // 3. 문서 업로드 큐에 추가
  const uploadFile: UploadFile = {
    id: generateFileId(),
    file,
    fileSize: file.size,
    status: 'pending',
    progress: 0,
    error: undefined,
    completedAt: undefined,
  };
  addToUploadQueue(uploadFile);

  return { success: true, isDuplicate: false, isDuplicateIssueDatePolicy: false };
}
