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
  /** 현재 주소로 설정 핸들러 */
  onSetCurrent: (addressId: string) => Promise<void>;
  /** 고객 이름 */
  customerName: string;
}

export const AddressArchiveModal: React.FC<AddressArchiveModalProps> = ({
  isOpen,
  onClose,
  addressHistory,
  isLoading,
  error,
  onSetCurrent,
  customerName
}) => {
  if (!isOpen) return null;

  // 현재 주소인지 확인 (첫 번째 항목이 현재 주소)
  const isCurrentAddress = (index: number) => index === 0 && addressHistory.length > 0;

  return (
    <div className="address-archive-modal-overlay" onClick={onClose}>
      <div className="address-archive-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="address-archive-modal__header">
          <h2 className="address-archive-modal__title">
            🏠 {customerName}님의 주소 보관소
          </h2>
          <button className="address-archive-modal__close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
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
                  {!isCurrent && item._id && (
                    <button
                      className="address-item__button secondary"
                      onClick={() => onSetCurrent(item._id!)}
                      disabled={isLoading}
                    >
                      현재 주소로 설정
                    </button>
                  )}
                  {isCurrent && (
                    <span className="address-item__button current-badge">현재 주소</span>
                  )}
                </div>
                <div className="address-item__content">
                  <div className="address-item__pin">📍</div>
                  <div className="address-item__text">
                    {AddressService.formatAddress(item.address)}
                    {!isCurrent && (
                      <span className="address-item__label">과거 보관</span>
                    )}
                  </div>
                </div>
                {/* 변경 사유 표시 */}
                {item.reason && (
                  <div className="address-item__reason">
                    {item.reason}
                  </div>
                )}
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
      </div>
    </div>
  );
};

export default AddressArchiveModal;
