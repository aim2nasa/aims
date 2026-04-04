/**
 * Modal Service
 * @since 1.0.0
 *
 * 🍎 모달 관련 비즈니스 로직과 서비스 함수들을 제공
 * ARCHITECTURE.md의 Service Layer 패턴을 준수합니다.
 */

export interface ModalServiceParams {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  confirmStyle?: 'primary' | 'destructive'
  showCancel?: boolean
  iconType?: 'success' | 'error' | 'warning' | 'info'
}

/**
 * Modal Service
 *
 * Document-Controller-View 아키텍처의 Service Layer 구현
 * API 호출이나 복잡한 비즈니스 로직이 필요한 경우 여기서 처리합니다.
 */
export class ModalService {
  /**
   * 모달 메시지 검증 및 전처리
   */
  static validateMessage(message: string): string {
    if (!message || message.trim().length === 0) {
      throw new Error('Modal message cannot be empty')
    }

    // 메시지 길이 제한 (iOS Alert 권장사항)
    const maxLength = 200
    if (message.length > maxLength) {
      return message.substring(0, maxLength) + '...'
    }

    return message.trim()
  }

  /**
   * 모달 타이틀 검증 및 전처리
   */
  static validateTitle(title?: string): string {
    if (!title) return '확인'

    // 타이틀 길이 제한 (iOS Alert 권장사항)
    const maxLength = 50
    if (title.length > maxLength) {
      return title.substring(0, maxLength) + '...'
    }

    return title.trim()
  }

  /**
   * 모달 파라미터 전체 검증
   */
  static validateParams(params: ModalServiceParams): ModalServiceParams {
    return {
      title: this.validateTitle(params.title),
      message: this.validateMessage(params.message),
      confirmText: params.confirmText || '확인',
      cancelText: params.cancelText || '취소',
      confirmStyle: params.confirmStyle || 'primary',
      showCancel: params.showCancel !== undefined ? params.showCancel : true,
      iconType: params.iconType || 'warning'
    }
  }

  /**
   * 특별한 확인 메시지 템플릿들
   */
  static getFileDeleteMessage(fileName: string): string {
    return this.validateMessage(`"${fileName}"을(를) 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)
  }

  static getFileClearMessage(fileCount: number): string {
    return this.validateMessage(`${fileCount}개의 파일을 모두 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)
  }

  static getUploadCancelMessage(): string {
    return this.validateMessage('업로드를 취소하시겠습니까?\n\n진행 중인 업로드가 중단됩니다.')
  }

  static getFileSizeWarningMessage(maxSize: string): string {
    return this.validateMessage(`파일이 ${maxSize} 크기 제한을 초과합니다.\n\n계속 진행하시겠습니까?`)
  }

  /**
   * 모달 설정 사전 정의
   */
  static getDestructiveConfig(): Partial<ModalServiceParams> {
    return {
      confirmStyle: 'destructive',
      confirmText: '삭제',
      cancelText: '취소'
    }
  }

  static getWarningConfig(): Partial<ModalServiceParams> {
    return {
      confirmStyle: 'primary',
      confirmText: '계속 진행',
      cancelText: '취소',
      title: '주의'
    }
  }

  static getCancelConfig(): Partial<ModalServiceParams> {
    return {
      confirmStyle: 'destructive',
      confirmText: '중단',
      cancelText: '계속',
      title: '작업 중단'
    }
  }
}

