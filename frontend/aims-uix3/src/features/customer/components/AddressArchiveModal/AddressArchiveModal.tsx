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
                  <span className={`address-item__icon ${isCurrent ? 'current' : 'past'}`}>
                    {isCurrent ? '✓' : '○'}
                  </span>
                  {AddressService.formatDate(item.changed_at)}
                </div>
                {isCurrent ? (
                  <span className="address-item__current-badge">현재 주소</span>
                ) : (
                  <span className="address-item__past-badge">과거 주소</span>
                )}
              </div>
              <div className="address-item__content">
                <div className="address-item__pin">📍</div>
                <div className="address-item__text">
                  {AddressService.formatAddress(item.address)}
                </div>
                {/* 주소 검증 상태 배지 */}
                {(() => {
                  const status = item.address?.verification_status;
                  const badgeClass = status === 'verified' ? 'address-item__verified-badge--verified' : status === 'failed' ? 'address-item__verified-badge--failed' : 'address-item__verified-badge--pending';
                  const badgeText = status === 'verified' ? '✓ 검증됨' : status === 'failed' ? '✕ 검증실패' : '? 미검증';
                  const titleText = status === 'verified' ? '검증된 주소' : status === 'failed' ? '검증 실패' : '미검증 주소';
                  return (
                    <span className={`address-item__verified-badge ${badgeClass}`} title={titleText}>
                      {badgeText}
                    </span>
                  );
                })()}
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
