/**
 * AIMS UIX-3 Address Archive Modal
 * @since 2025-10-11
 * @version 2.0.0
 *
 * 🍎 주소 보관소 모달 컴포넌트
 * - 고객의 모든 주소 이력 표시
 * - Document-Controller-View 패턴 준수
 * - 순수 View 컴포넌트 (비즈니스 로직 없음)
 */

import React from 'react';
import type { AddressHistoryItem } from '../../controllers/useAddressArchiveController';
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

          {/* 주소 이력 목록 */}
          {!isLoading && !error && addressHistory.length === 0 && (
            <div className="address-archive-modal__empty">
              주소 이력이 없습니다.
            </div>
          )}

          {!isLoading && addressHistory.map((item) => (
            <div
              key={item.id}
              className={`address-item ${item.isCurrent ? 'address-item--current' : ''}`}
            >
              <div className="address-item__header">
                <div className="address-item__date">
                  <span className={`address-item__icon ${item.isCurrent ? 'current' : 'past'}`}>
                    {item.isCurrent ? '✓' : '○'}
                  </span>
                  {item.date}
                </div>
                {!item.isCurrent && (
                  <button
                    className="address-item__button secondary"
                    onClick={() => onSetCurrent(item.id)}
                    disabled={isLoading}
                  >
                    현재 주소로 설정
                  </button>
                )}
                {item.isCurrent && (
                  <span className="address-item__button">현재 주소</span>
                )}
              </div>
              <div className="address-item__content">
                <div className="address-item__pin">📍</div>
                <div className="address-item__text">
                  [{item.postalCode}] {item.address}
                  {item.detailAddress && ` ${item.detailAddress}`}
                  {!item.isCurrent && (
                    <span className="address-item__label">과거 보관</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AddressArchiveModal;
