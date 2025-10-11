/**
 * User Context Service
 * @since 1.0.0
 *
 * 사용자별 파일 업로드를 위한 컨텍스트 관리 서비스
 * 미래 확장성을 고려한 설계
 */

import { UploadContext, UserIdentifierType } from '../types/uploadTypes'

/**
 * 사용자 컨텍스트 관리 클래스
 *
 * 현재: 하드코딩된 userId 사용
 * 미래: 동적 사용자 선택 및 다양한 식별자 지원
 */
export class UserContextService {
  // 🔄 현재 기본 컨텍스트 (향후 동적으로 변경 예정)
  private static context: UploadContext = {
    identifierType: 'userId',
    identifierValue: 'rossi.kwak@gmail.com'
  }

  /**
   * 현재 업로드 컨텍스트 반환
   */
  static getContext(): UploadContext {
    return { ...this.context }
  }

  /**
   * 업로드 컨텍스트 설정
   * 🔮 미래 확장: 사용자 선택 UI에서 호출
   */
  static setContext(context: Partial<UploadContext>): void {
    this.context = { ...this.context, ...context }
  }

  /**
   * 사용자 식별자 변경
   * 🔮 미래 확장: 다양한 식별 방식 지원
   */
  static setUserIdentifier(type: UserIdentifierType, value: string): void {
    this.context.identifierType = type
    this.context.identifierValue = value
  }

  /**
   * 프로젝트 컨텍스트 설정
   * 🔮 미래 확장: 프로젝트별 파일 분류
   */
  static setProjectContext(projectId: string, departmentId?: string): void {
    this.context.projectId = projectId
    this.context.departmentId = departmentId
  }

  /**
   * 추가 메타데이터 설정
   * 🔮 미래 확장: 커스텀 분류 정보
   */
  static setMetadata(key: string, value: any): void {
    if (!this.context.metadata) {
      this.context.metadata = {}
    }
    this.context.metadata[key] = value
  }

  /**
   * 파일 업로드용 FormData 생성
   * 현재 컨텍스트 정보를 포함하여 FormData 생성
   */
  static createFormData(file: File): FormData {
    const formData = new FormData()

    // 필수: 파일
    formData.append('file', file)

    // 필수: 사용자 식별자
    formData.append(this.context.identifierType, this.context.identifierValue)

    // 선택적: 프로젝트 정보
    if (this.context.projectId) {
      formData.append('projectId', this.context.projectId)
    }

    if (this.context.departmentId) {
      formData.append('departmentId', this.context.departmentId)
    }

    // 선택적: 추가 메타데이터
    if (this.context.metadata) {
      Object.entries(this.context.metadata).forEach(([key, value]) => {
        formData.append(`metadata_${key}`, String(value))
      })
    }

    return formData
  }

  /**
   * 컨텍스트 초기화
   * 기본값으로 리셋
   */
  static reset(): void {
    this.context = {
      identifierType: 'userId',
      identifierValue: 'rossi.kwak@gmail.com'
    }
  }

  /**
   * 컨텍스트 유효성 검사
   */
  static isValid(): boolean {
    return !!(this.context.identifierType && this.context.identifierValue)
  }

  /**
   * 디버그용 컨텍스트 정보 출력
   */
  static debug(): void {
    console.log('[UserContextService] Current context:', this.context)
  }
}

/**
 * 업로드 설정 관리
 * 🔮 미래 확장: 설정 파일로 분리 예정
 */
export const uploadConfig = {
  // 현재 설정
  endpoints: {
    upload: 'https://n8nd.giize.com/webhook/docprep-main'
  },

  // 🔮 미래 확장 설정 (현재는 비활성화)
  features: {
    enableUserSelection: false,      // 사용자 선택 UI
    enableProjectCategories: false, // 프로젝트별 분류
    enableBulkUpload: true,         // 대량 업로드
    enableFolderUpload: true        // 폴더 업로드
  },

  // 업로드 제한
  limits: {
    maxConcurrentUploads: 3,        // 최대 동시 업로드
    maxFileSize: 50 * 1024 * 1024, // 50MB (Nginx 제한에 맞춤)
    maxFileCount: 100,              // 최대 파일 개수
    allowedMimeTypes: [             // 허용 파일 형식
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
  }
}

/**
 * 헬퍼 함수들
 */
export const uploadHelpers = {
  /**
   * 파일 크기를 사람이 읽기 쉬운 형태로 변환
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes'

    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  },

  /**
   * 파일 확장자 추출
   */
  getFileExtension(filename: string): string {
    return filename.split('.').pop()?.toLowerCase() || ''
  },

  /**
   * MIME 타입이 허용되는지 확인 - 모든 파일 형식 허용
   */
  isAllowedMimeType(mimeType: string): boolean {
    void mimeType
    return true  // 모든 파일 형식 허용
  },

  /**
   * 파일 크기가 허용 범위인지 확인
   */
  isAllowedFileSize(size: number): boolean {
    return size <= uploadConfig.limits.maxFileSize
  }
}
