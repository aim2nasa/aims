/**
 * AIMS UIX-3 Address Archive Modal
 * @since 2025-10-11
 * @version 3.0.0
 *
 * 🍎 주소 보관소 모달 컴포넌트
 * - 고객의 모든 주소 이력 표시
 * - Document-Controller-View 패턴 준수 (Layer 5: View)
 * - 순수 View 컴포넌트 (비즈니스 로직 없음)
 * - 실제 API 데이터 구조와 완벽 호환
 */

import React from 'react';
import Modal from '@/shared/ui/Modal';
import { CloseButton } from '@/shared/ui/CloseButton';
import { Tooltip } from '@/shared/ui/Tooltip';
import type { AddressHistoryItem } from '@/entities/customer/model';
import { AddressService } from '@/services/addressService';
import './AddressArchiveModal.css';

/**
 * AddressArchiveModal Props 인터페이스
 */
interface AddressArchiveModalProps {
  /** 모달 열림/닫힘 상태 */
  isOpen: boolean;
  /** 모달 닫기 핸들러 */
  onClose: () => void;
  /** 주소 이력 목록 */
  addressHistory: AddressHistoryItem[];
  /** 로딩 상태 */
  isLoading: boolean;
  /** 에러 메시지 */
  error: string | null;
  /** 고객 이름 */
  customerName: string;
}

export const AddressArchiveModal: React.FC<AddressArchiveModalProps> = ({
  isOpen,
  onClose,
  addressHistory,
  isLoading,
  error,
  customerName
}) => {
  // 현재 주소인지 확인 (첫 번째 항목이 현재 주소)
  const isCurrentAddress = (index: number) => index === 0 && addressHistory.length > 0;

  return (
    <Modal
      visible={isOpen}
      onClose={onClose}
      size="md"
      showHeader={false}
      backdropClosable={true}
      className="address-archive-modal"
    >
      {/* Header */}
      <div className="address-archive-modal__header">
        <h2 className="address-archive-modal__title">
          🏠 {customerName}님의 주소 보관소
        </h2>
        <CloseButton onClick={onClose} ariaLabel="닫기" />
      </div>

      {/* Info */}
      <div className="address-archive-modal__info">
        총 <strong>{addressHistory.length}건</strong>의 주소 변경 이력이 있습니다.
      </div>

      {/* Content */}
      <div className="address-archive-modal__content">
        {/* 에러 표시 */}
        {error && (
          <div className="address-archive-modal__error">
            ⚠️ {error}
          </div>
        )}

        {/* 로딩 표시 */}
        {isLoading && (
          <div className="address-archive-modal__loading">
            주소 이력을 불러오는 중...
          </div>
        )}

        {/* 빈 상태 */}
        {!isLoading && !error && addressHistory.length === 0 && (
          <div className="address-archive-modal__empty">
            주소 이력이 없습니다.
          </div>
        )}

        {/* 주소 이력 목록 */}
        {!isLoading && addressHistory.map((item, index) => {
          const isCurrent = isCurrentAddress(index);

          return (
            <div
              key={item._id || index}
              className={`address-item ${isCurrent ? 'address-item--current' : ''}`}
            >
              <div className="address-item__header">
                <div className="address-item__date">
                  {AddressService.formatDate(item.changed_at)}
                </div>
                {isCurrent ? (
                  <span className="address-item__current-badge">현재 주소</span>
                ) : (
                  <span className="address-item__past-badge">과거 주소</span>
                )}
              </div>
              <div className="address-item__content">
                {/* 주소 검증 상태 아이콘 (고객 전체보기와 동일) */}
                {(() => {
                  const status = item.address?.verification_status;
                  const iconClass = status === 'verified' ? 'address-item__verified-icon--verified' : status === 'failed' ? 'address-item__verified-icon--failed' : 'address-item__verified-icon--pending';
                  const tooltipText = status === 'verified' ? '검증된 주소' : status === 'failed' ? '검증 실패' : '미검증 주소';
                  return (
                    <Tooltip content={tooltipText}>
                      <span className={`address-item__verified-icon ${iconClass}`}>
                        {status === 'verified' ? (
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm3.78 5.28l-4.5 6a.75.75 0 01-1.14.06l-2.25-2.25a.75.75 0 111.06-1.06l1.64 1.64 3.97-5.3a.75.75 0 111.22.88z"/>
                          </svg>
                        ) : status === 'failed' ? (
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm3.53 4.47a.75.75 0 010 1.06L9.06 8l2.47 2.47a.75.75 0 11-1.06 1.06L8 9.06l-2.47 2.47a.75.75 0 01-1.06-1.06L6.94 8 4.47 5.53a.75.75 0 011.06-1.06L8 6.94l2.47-2.47a.75.75 0 011.06 0z"/>
                          </svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm-.75 4.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zm.75 7.25a1 1 0 110-2 1 1 0 010 2z"/>
                          </svg>
                        )}
                      </span>
                    </Tooltip>
                  );
                })()}
                <div className="address-item__text">
                  {AddressService.formatAddress(item.address)}
                </div>
              </div>
              {/* 메모 표시 */}
              {item.notes && (
                <div className="address-item__notes">
                  메모: {item.notes}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
};

export default AddressArchiveModal;
