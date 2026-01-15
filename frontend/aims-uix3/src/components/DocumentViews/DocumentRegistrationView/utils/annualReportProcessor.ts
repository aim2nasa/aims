/**
 * Annual Report 처리 유틸리티
 *
 * 문서 중복 검사 로직을 제공
 */

import { DocumentService } from '@/services/DocumentService';
import { calculateFileHash } from '@/features/customer/utils/fileHash';
import { errorReporter } from '@/shared/lib/errorReporter';
import { getAuthToken } from '@/shared/lib/api';
import { AnnualReportApi } from '@/features/customer/api/annualReportApi';
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

export interface ProcessAnnualReportFileResult {
  /** 문서 업로드를 진행해야 하는가 */
  shouldUploadDoc: boolean;
  /** 문서 중복 여부 (해시 기반) */
  isDuplicateDoc: boolean;
  /** 발행일 중복 여부 */
  isDuplicateIssueDate: boolean;
  /** 중복된 발행일 (있는 경우) */
  duplicateIssueDate?: string;
}

/**
 * Annual Report 파일 처리
 *
 * 문서 중복 검사를 수행하여 문서 업로드 진행 여부를 결정
 * 1차: 파일 해시 기반 중복 체크
 * 2차: 발행일 기반 중복 체크
 *
 * @param file - 업로드할 파일
 * @param customerId - 대상 고객 ID
 * @param issueDate - AR 발행일 (YYYY-MM-DD 형식, optional)
 * @returns 처리 결과 (업로드 여부, 중복 여부)
 */
export async function processAnnualReportFile(
  file: File,
  customerId: string,
  issueDate?: string
): Promise<ProcessAnnualReportFileResult> {
  // 기본값
  let isDuplicateDoc = false;
  let isDuplicateIssueDate = false;
  let duplicateIssueDate: string | undefined;

  // 1. 문서 중복 검사 (파일 해시 기반)
  try {
    const uploadFileHash = await calculateFileHash(file);

    // 고객의 문서 목록 조회
    const customerDocs = await DocumentService.getCustomerDocuments(customerId);

    if (customerDocs.documents && customerDocs.documents.length > 0) {
      // 각 document_id로 file_hash 조회
      for (const doc of customerDocs.documents) {
        try {
          const userId = typeof window !== 'undefined' ? localStorage.getItem('aims-current-user-id') || 'tester' : 'tester';
          // 🔒 보안: getAuthToken()으로 토큰 통합 관리 (v1/v2 호환)
          const token = getAuthToken();
          const docStatus = await fetch(`/api/documents/${doc._id}/status`, {
            headers: {
              'x-user-id': userId,
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
          console.error('[processAnnualReportFile] 문서 해시 조회 실패:', doc._id, error);
          errorReporter.reportApiError(error as Error, { component: 'annualReportProcessor.processAnnualReportFile.hashCheck', payload: { docId: doc._id } });
          // 개별 문서 조회 실패는 무시하고 계속 진행
        }
      }
    }
  } catch (error) {
    console.error('[processAnnualReportFile] 문서 중복 검사 실패:', error);
    errorReporter.reportApiError(error as Error, { component: 'annualReportProcessor.processAnnualReportFile', payload: { customerId } });
    // 에러 발생 시 중복 아닌 것으로 처리 (안전하게 진행)
    isDuplicateDoc = false;
  }

  // 2. 발행일 중복 검사 (해시 중복이 아닌 경우만)
  if (!isDuplicateDoc && issueDate) {
    try {
      const userId = typeof window !== 'undefined' ? localStorage.getItem('aims-current-user-id') || 'tester' : 'tester';
      const arListResponse = await AnnualReportApi.getAnnualReports(customerId, userId, 100);

      if (arListResponse.success && arListResponse.data?.reports) {
        // 발행일 정규화 (YYYY-MM-DD 형식으로 비교)
        const normalizedUploadDate = issueDate.split('T')[0];

        for (const existingAr of arListResponse.data.reports) {
          if (existingAr.issue_date) {
            const normalizedExistingDate = existingAr.issue_date.split('T')[0];

            if (normalizedUploadDate === normalizedExistingDate) {
              isDuplicateIssueDate = true;
              duplicateIssueDate = normalizedExistingDate;
              console.log(`[processAnnualReportFile] 발행일 중복 감지: ${normalizedUploadDate}`);
              break;
            }
          }
        }
      }
    } catch (error) {
      console.error('[processAnnualReportFile] 발행일 중복 검사 실패:', error);
      errorReporter.reportApiError(error as Error, { component: 'annualReportProcessor.processAnnualReportFile.issueDateCheck', payload: { customerId, issueDate } });
      // 에러 발생 시 중복 아닌 것으로 처리 (안전하게 진행)
      isDuplicateIssueDate = false;
    }
  }

  // 처리 결정: 해시 중복 또는 발행일 중복 시 업로드 안 함
  const shouldUploadDoc = !isDuplicateDoc && !isDuplicateIssueDate;

  return {
    shouldUploadDoc,
    isDuplicateDoc,
    isDuplicateIssueDate,
    duplicateIssueDate
  };
}

/**
 * AR 문서 등록 처리
 *
 * 중복 검사 → AR 파싱 → 문서 업로드를 일괄 처리
 *
 * @param file - 업로드할 AR 파일
 * @param customerId - 대상 고객 ID
 * @param issueDate - AR 발행일 (YYYY-MM-DD 형식)
 * @param callbacks - 외부 함수 콜백 객체
 * @returns 처리 결과 (성공 여부, 중복 여부, 발행일 중복 여부)
 */
export async function registerArDocument(
  file: File,
  customerId: string,
  issueDate: string | undefined,
  callbacks: {
    addLog: (level: LogLevel, message: string, details?: string) => void;
    generateFileId: () => string;
    addToUploadQueue: (uploadFile: UploadFile) => void;
    trackArFile: (fileName: string, customerId: string) => void;
  }
): Promise<{ success: boolean; isDuplicate: boolean; isDuplicateIssueDate?: boolean }> {
  const { addLog, generateFileId, addToUploadQueue, trackArFile } = callbacks;

  // 1. 문서 중복 검사 (해시 + 발행일)
  const checkResult = await processAnnualReportFile(file, customerId, issueDate);

  if (checkResult.isDuplicateDoc) {
    // 해시 중복이면 경고 후 종료
    addLog('warning', `중복 문서 감지: ${file.name}`, '이미 존재하는 파일이므로 업로드를 건너뜁니다.');
    return { success: false, isDuplicate: true, isDuplicateIssueDate: false };
  }

  if (checkResult.isDuplicateIssueDate) {
    // 발행일 중복이면 경고 후 종료
    const formattedDate = formatIssueDateKorean(checkResult.duplicateIssueDate);
    addLog(
      'warning',
      `${formattedDate} 발행일 보고서 이미 존재`,
      `${file.name} 업로드를 건너뜁니다.`
    );
    return { success: false, isDuplicate: false, isDuplicateIssueDate: true };
  }

  // 2. AR 파일 추적 등록
  trackArFile(file.name, customerId);

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

  return { success: true, isDuplicate: false, isDuplicateIssueDate: false };
}
