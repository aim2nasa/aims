/**
 * Annual Report 처리 유틸리티
 *
 * 문서 중복 검사 로직을 제공
 */

import { DocumentService } from '@/services/DocumentService';
import { calculateFileHash } from '@/features/customer/utils/fileHash';
import type { UploadFile } from '../types/uploadTypes';
import type { LogLevel } from '../types/logTypes';

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
          const userId = typeof window !== 'undefined' ? localStorage.getItem('aims-current-user-id') || 'tester' : 'tester';
      const docStatus = await fetch(`/api/documents/${doc._id}/status`, {
        headers: { 'x-user-id': userId }
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

/**
 * AR 문서 등록 처리
 *
 * 중복 검사 → AR 파싱 → 문서 업로드를 일괄 처리
 *
 * @param file - 업로드할 AR 파일
 * @param customerId - 대상 고객 ID
 * @param callbacks - 외부 함수 콜백 객체
 * @returns 처리 결과 (성공 여부, 중복 여부)
 */
export async function registerArDocument(
  file: File,
  customerId: string,
  _issueDate: string | undefined,
  callbacks: {
    addLog: (level: LogLevel, message: string, details?: string) => void;
    generateFileId: () => string;
    addToUploadQueue: (uploadFile: UploadFile) => void;
    trackArFile: (fileName: string, customerId: string) => void;
  }
): Promise<{ success: boolean; isDuplicate: boolean }> {
  const { addLog, generateFileId, addToUploadQueue, trackArFile } = callbacks;

  // 1. 문서 중복 검사
  const checkResult = await processAnnualReportFile(file, customerId);

  if (checkResult.isDuplicateDoc) {
    // 중복이면 경고 후 종료
    addLog('warning', `중복 문서 감지: ${file.name}`, '이미 존재하는 파일이므로 업로드를 건너뜁니다.');
    return { success: false, isDuplicate: true };
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

  return { success: true, isDuplicate: false };
}
