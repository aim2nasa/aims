/**
 * Annual Report 처리 유틸리티
 *
 * 문서 중복 검사 로직을 제공
 *
 * 성능 최적화:
 * - 고객별 해시/발행일 캐시로 중복 검사 API 호출 최소화
 * - 기존: 파일마다 고객 문서 N개 × 순차 API 호출 → 수만 건
 * - 개선: 고객당 1번 일괄 조회 → 로컬 Set 비교
 */

import { calculateFileHash } from '@/features/customer/utils/fileHash';
import { errorReporter } from '@/shared/lib/errorReporter';
import { getAuthToken, getCurrentUserId } from '@/shared/lib/api';
import { AnnualReportApi } from '@/features/customer/api/annualReportApi';
import type { UploadFile } from '../types/uploadTypes';
import type { LogLevel } from '../types/logTypes';

// ── 배치 등록 세션 캐시 ──
// 파일 해시 캐시: 파일명 → 해시 (사전 계산된 해시)
const fileHashCache = new Map<string, string>();
// 고객별 해시 캐시: 고객 ID → 해당 고객의 모든 문서 해시 Set
const hashCache = new Map<string, Set<string>>();
// 고객별 AR 발행일 캐시: 고객 ID → 해당 고객의 모든 AR 발행일 Set
const arDatesCache = new Map<string, Set<string>>();

/**
 * 중복 검사 캐시 초기화 (배치 등록 시작/종료 시 호출)
 */
export function clearDuplicateCheckCache(): void {
  fileHashCache.clear();
  hashCache.clear();
  arDatesCache.clear();
}

/**
 * 🚀 Phase 3: 파일 해시 병렬 사전 계산
 * 기존: 등록 루프에서 파일마다 순차 계산 (1개씩)
 * 개선: 루프 전 10개씩 병렬 계산
 *
 * @param files - 해시를 계산할 File 배열
 * @param onProgress - 진행률 콜백
 */
export async function precomputeFileHashes(
  files: File[],
  onProgress?: (completed: number, total: number) => void
): Promise<void> {
  const CONCURRENCY = 10;

  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (file) => {
      try {
        const hash = await calculateFileHash(file);
        fileHashCache.set(file.name, hash);
      } catch {
        // 실패해도 루프에서 재시도 가능
      }
    }));
    onProgress?.(Math.min(i + CONCURRENCY, files.length), files.length);
  }
}

/**
 * 🚀 Phase 2: 배치 등록 전 고객 데이터 병렬 프리페치
 *
 * 기존: 등록 루프에서 새 고객 만날 때마다 2 API 순차 호출
 *   → 745 고객 × 2 API = 1,490회 순차 (빨랐다-멈췄다 패턴 원인)
 * 개선: 루프 시작 전 10개씩 병렬 프리페치
 *   → 75 라운드 × 병렬 10개 = 동일 데이터를 ~10x 빠르게 확보
 *
 * @param customerIds - 프리페치할 고객 ID 배열 (중복 허용, 내부에서 제거)
 * @param onProgress - 진행률 콜백 (completed, total)
 */
export async function prefetchCustomerData(
  customerIds: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<void> {
  const uniqueIds = [...new Set(customerIds)];
  if (uniqueIds.length === 0) return;

  const CONCURRENCY = 10;

  for (let i = 0; i < uniqueIds.length; i += CONCURRENCY) {
    const batch = uniqueIds.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (customerId) => {
      // 각 고객에 대해 해시 + 발행일 조회를 병렬 실행
      await Promise.all([
        getCustomerDocumentHashes(customerId),
        getCustomerArIssueDates(customerId),
      ]);
    }));
    onProgress?.(Math.min(i + CONCURRENCY, uniqueIds.length), uniqueIds.length);
  }
}

/**
 * 고객의 모든 문서 해시를 일괄 조회 (캐시 우선)
 * 기존: 문서 N개 → N번 /api/documents/:id/status 호출
 * 개선: 1번 /api/customers/:id/document-hashes 호출 → Set으로 반환
 */
async function getCustomerDocumentHashes(customerId: string): Promise<Set<string>> {
  // 캐시 히트
  const cached = hashCache.get(customerId);
  if (cached) return cached;

  // 캐시 미스 → API 일괄 조회
  try {
    const token = getAuthToken();
    const userId = getCurrentUserId() || 'tester';
    const res = await fetch(`/api/customers/${customerId}/document-hashes`, {
      headers: {
        'x-user-id': userId,
        ...(token && { Authorization: `Bearer ${token}` })
      }
    });
    const data = await res.json();

    const hashSet = new Set<string>(data.success ? data.hashes : []);
    hashCache.set(customerId, hashSet);
    return hashSet;
  } catch (error) {
    console.error('[annualReportProcessor] 해시 일괄 조회 실패:', error);
    errorReporter.reportApiError(error as Error, { component: 'annualReportProcessor.getCustomerDocumentHashes', payload: { customerId } });
    // 실패 시 빈 Set (중복 아닌 것으로 처리)
    const emptySet = new Set<string>();
    hashCache.set(customerId, emptySet);
    return emptySet;
  }
}

/**
 * 고객의 모든 AR 발행일을 일괄 조회 (캐시 우선)
 */
async function getCustomerArIssueDates(customerId: string): Promise<Set<string>> {
  // 캐시 히트
  const cached = arDatesCache.get(customerId);
  if (cached) return cached;

  // 캐시 미스 → API 조회
  try {
    const userId = getCurrentUserId() || 'tester';
    const arListResponse = await AnnualReportApi.getAnnualReports(customerId, userId, 100);

    const dateSet = new Set<string>();
    if (arListResponse.success && arListResponse.data?.reports) {
      for (const ar of arListResponse.data.reports) {
        if (ar.issue_date) {
          dateSet.add(ar.issue_date.split('T')[0]);
        }
      }
    }
    arDatesCache.set(customerId, dateSet);
    return dateSet;
  } catch (error) {
    console.error('[annualReportProcessor] AR 발행일 조회 실패:', error);
    errorReporter.reportApiError(error as Error, { component: 'annualReportProcessor.getCustomerArIssueDates', payload: { customerId } });
    const emptySet = new Set<string>();
    arDatesCache.set(customerId, emptySet);
    return emptySet;
  }
}

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
  let isDuplicateDoc = false;
  let isDuplicateIssueDate = false;
  let duplicateIssueDate: string | undefined;

  // 1. 문서 중복 검사 (파일 해시 기반)
  // 캐시된 해시 Set으로 O(1) 비교 (기존: 문서 N개 × 순차 API 호출)
  try {
    // 사전 계산된 해시가 있으면 사용, 없으면 실시간 계산
    const uploadFileHash = fileHashCache.get(file.name) || await calculateFileHash(file);
    const existingHashes = await getCustomerDocumentHashes(customerId);

    if (existingHashes.has(uploadFileHash)) {
      isDuplicateDoc = true;
    } else {
      // 등록 예정 파일의 해시도 캐시에 추가 (같은 배치 내 중복 방지)
      existingHashes.add(uploadFileHash);
    }
  } catch (error) {
    console.error('[processAnnualReportFile] 문서 중복 검사 실패:', error);
    errorReporter.reportApiError(error as Error, { component: 'annualReportProcessor.processAnnualReportFile', payload: { customerId } });
    isDuplicateDoc = false;
  }

  // 2. 발행일 중복 검사 (해시 중복이 아닌 경우만)
  // 캐시된 발행일 Set으로 O(1) 비교 (기존: 파일마다 API 호출)
  if (!isDuplicateDoc && issueDate) {
    try {
      const normalizedUploadDate = issueDate.split('T')[0];
      const existingDates = await getCustomerArIssueDates(customerId);

      if (existingDates.has(normalizedUploadDate)) {
        isDuplicateIssueDate = true;
        duplicateIssueDate = normalizedUploadDate;
        console.log(`[processAnnualReportFile] 발행일 중복 감지: ${normalizedUploadDate}`);
      } else {
        // 등록 예정 파일의 발행일도 캐시에 추가 (같은 배치 내 중복 방지)
        existingDates.add(normalizedUploadDate);
      }
    } catch (error) {
      console.error('[processAnnualReportFile] 발행일 중복 검사 실패:', error);
      errorReporter.reportApiError(error as Error, { component: 'annualReportProcessor.processAnnualReportFile.issueDateCheck', payload: { customerId, issueDate } });
      isDuplicateIssueDate = false;
    }
  }

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
 * AR 파일 추적 등록 → 문서 업로드 큐 추가
 *
 * 주의: 중복 검사는 호출자가 사전에 processAnnualReportFile()로 수행해야 함.
 * registerArDocument는 등록 로직만 담당한다 (캐시 기반 중복 검사와의 이중 호출 방지).
 *
 * @param file - 업로드할 AR 파일
 * @param customerId - 대상 고객 ID
 * @param issueDate - AR 발행일 (YYYY-MM-DD 형식, 현재 미사용이나 확장성 유지)
 * @param callbacks - 외부 함수 콜백 객체
 * @returns 처리 결과 (항상 success: true)
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
  const { generateFileId, addToUploadQueue, trackArFile } = callbacks;

  // 1. AR 파일 추적 등록
  trackArFile(file.name, customerId);

  // 2. 문서 업로드 큐에 추가
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
