/**
 * Duplicate File Checker Utility
 * @since 2025-12-07
 * @version 2.0.0 - 공통 모듈로 이동 (2025-12-14)
 *
 * 파일 업로드 시 중복 파일 감지를 위한 유틸리티
 * - SHA-256 해시 기반 비교 (백엔드 지원 시)
 * - 파일명 기반 비교 (fallback)
 *
 * 사용처:
 * - 새 문서 등록 (DocumentRegistrationView)
 * - 문서 일괄등록 (BatchDocumentUploadView)
 */

import { api } from '../api'
import { calculateFileHash } from '../../../features/customer/utils/fileHash'
import { errorReporter } from '../errorReporter'

/**
 * 기존 파일 해시 정보
 */
export interface ExistingFileHash {
  documentId: string
  fileName: string
  fileHash: string
  fileSize: number
  uploadedAt: string
}

/**
 * 중복 검사 결과
 */
export interface DuplicateCheckResult {
  isDuplicate: boolean
  existingDoc?: ExistingFileHash
  newFileHash: string
}

/**
 * 고객 문서 목록 응답 타입
 */
interface CustomerDocumentsResponse {
  success?: boolean
  data?: {
    customer_id?: string
    documents?: Array<{
      _id: string
      originalName?: string
      filename?: string
      fileSize?: number
      uploadedAt?: string
      linkedAt?: string
    }>
    total?: number
  }
}

/**
 * 문서 상태 응답 타입
 */
interface DocumentStatusResponse {
  success?: boolean
  data?: {
    raw?: {
      meta?: {
        file_hash?: string
      }
    }
  }
}

/**
 * 고객의 기존 문서 해시 목록 조회
 *
 * @param customerId 고객 ID
 * @returns 기존 문서 해시 목록
 */
export async function getCustomerFileHashes(customerId: string): Promise<ExistingFileHash[]> {
  if (!customerId?.trim()) {
    return []
  }

  try {
    // 1. 고객의 문서 목록 조회
    const response = await api.get<CustomerDocumentsResponse>(
      `/api/customers/${customerId}/documents`
    )

    const documents = response?.data?.documents || []

    if (documents.length === 0) {
      return []
    }

    // 2. 각 문서의 해시 조회 (병렬 처리)
    // 해시가 없어도 파일명 기반 비교를 위해 정보 반환
    const hashPromises = documents.map(async (doc): Promise<ExistingFileHash> => {
      const fileName = doc.originalName || doc.filename || 'unknown'
      const fileSize = doc.fileSize || 0
      const uploadedAt = doc.uploadedAt || doc.linkedAt || ''

      try {
        const statusResponse = await api.get<DocumentStatusResponse>(
          `/api/documents/${doc._id}/status`
        )

        const fileHash = statusResponse?.data?.raw?.meta?.file_hash || ''

        return {
          documentId: doc._id,
          fileName,
          fileHash,
          fileSize,
          uploadedAt,
        }
      } catch {
        // 해시 조회 실패 시에도 파일명 정보는 반환 (fallback용)
        return {
          documentId: doc._id,
          fileName,
          fileHash: '',
          fileSize,
          uploadedAt,
        }
      }
    })

    const results = await Promise.all(hashPromises)
    return results
  } catch (error) {
    console.error('[duplicateChecker] 고객 문서 해시 조회 실패:', error)
    errorReporter.reportApiError(error as Error, { component: 'duplicateChecker.getCustomerFileHashes', payload: { customerId } })
    return []
  }
}

/**
 * 파일이 중복인지 확인
 *
 * 검사 우선순위:
 * 1. SHA-256 해시 비교 (정확한 중복 검사)
 * 2. 파일명 비교 (fallback - 백엔드에서 해시 미제공 시)
 *
 * @param file 확인할 파일
 * @param existingHashes 기존 문서 해시 목록
 * @returns 중복 검사 결과
 */
export async function checkDuplicateFile(
  file: File,
  existingHashes: ExistingFileHash[]
): Promise<DuplicateCheckResult> {
  // 파일 해시 계산
  const newFileHash = await calculateFileHash(file)

  // 1차: 해시 비교 (가장 정확)
  const hashMatch = existingHashes.find(
    (doc) => doc.fileHash && doc.fileHash === newFileHash
  )

  if (hashMatch) {
    return {
      isDuplicate: true,
      existingDoc: hashMatch,
      newFileHash,
    }
  }

  // 2차: 파일명 비교 (fallback - 해시가 없는 기존 문서와 비교)
  // 해시가 없는 문서들 중에서 파일명이 일치하는 것 찾기
  const nameMatch = existingHashes.find(
    (doc) => !doc.fileHash && doc.fileName === file.name
  )

  if (nameMatch) {
    return {
      isDuplicate: true,
      existingDoc: nameMatch,
      newFileHash,
    }
  }

  return {
    isDuplicate: false,
    newFileHash,
  }
}

/**
 * 여러 파일의 중복 일괄 검사
 *
 * @param files 검사할 파일 목록
 * @param existingHashes 기존 문서 해시 목록
 * @returns 중복 파일 목록 (파일과 중복 정보 매핑)
 */
export async function checkDuplicateFiles(
  files: File[],
  existingHashes: ExistingFileHash[]
): Promise<Map<File, DuplicateCheckResult>> {
  const results = new Map<File, DuplicateCheckResult>()

  // 병렬로 모든 파일 해시 계산 및 비교
  const checkPromises = files.map(async (file) => {
    const result = await checkDuplicateFile(file, existingHashes)
    return { file, result }
  })

  const checkResults = await Promise.all(checkPromises)

  for (const { file, result } of checkResults) {
    results.set(file, result)
  }

  return results
}

/**
 * 파일명에 번호 추가 (둘 다 유지 옵션용)
 *
 * @param fileName 원본 파일명
 * @param existingNames 기존 파일명 목록
 * @returns 중복되지 않는 새 파일명
 *
 * @example
 * getUniqueFileName('report.pdf', ['report.pdf']) // 'report (1).pdf'
 * getUniqueFileName('report.pdf', ['report.pdf', 'report (1).pdf']) // 'report (2).pdf'
 */
export function getUniqueFileName(fileName: string, existingNames: string[]): string {
  // 파일명에 확장자가 있는지 확인
  const lastDotIndex = fileName.lastIndexOf('.')
  const hasExtension = lastDotIndex > 0

  const baseName = hasExtension ? fileName.slice(0, lastDotIndex) : fileName
  const extension = hasExtension ? fileName.slice(lastDotIndex) : ''

  // 이미 유니크한 경우
  if (!existingNames.includes(fileName)) {
    return fileName
  }

  // 번호를 붙여서 유니크한 이름 찾기
  let counter = 1
  let newName = `${baseName} (${counter})${extension}`

  while (existingNames.includes(newName)) {
    counter++
    newName = `${baseName} (${counter})${extension}`
  }

  return newName
}
