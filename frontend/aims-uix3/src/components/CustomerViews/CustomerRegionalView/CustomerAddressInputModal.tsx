/**
 * Customer Address Input Modal
 * @since 2025-11-24
 * @updated 2025-12-09 - Apple 스타일 디자인 개선
 *
 * 주소가 없는 고객의 주소를 입력하기 위한 모달
 * 지역별 보기에서 "주소 미입력" 고객 클릭 시 사용
 */

import React, { useState } from 'react';
import Modal from '@/shared/ui/Modal';
import { AddressSearchModal } from '@/features/customer/components/AddressSearchModal';
import type { FormattedAddress } from '@/features/customer/api/addressApi';
import type { Customer } from '@/entities/customer';
import { Button } from '@/shared/ui/Button';
import { errorReporter } from '@/shared/lib/errorReporter';
import './CustomerAddressInputModal.css';

interface CustomerAddressInputModalProps {
  /** 모달 표시 여부 */
  isOpen: boolean;
  /** 주소를 입력할 고객 정보 */
  customer: Customer | null;
  /** 모달 닫기 핸들러 */
  onClose: () => void;
  /** 주소 저장 핸들러 */
  onSave: (customerId: string, address: FormattedAddress) => Promise<void>;
  /** Geocoding 실패로 인한 모달인지 여부 */
  isGeocodingFailure?: boolean;
}

/**
 * CustomerAddressInputModal Component
 *
 * 주소 미입력 고객의 주소를 입력하기 위한 모달
 * AddressSearchModal을 사용하여 주소 검색 및 선택 기능 제공
 */
export const CustomerAddressInputModal: React.FC<CustomerAddressInputModalProps> = ({
  isOpen,
  customer,
  onClose,
  onSave,
  isGeocodingFailure = false,
}) => {
  const [isAddressSearchOpen, setIsAddressSearchOpen] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<FormattedAddress | null>(null);
  const [address2Input, setAddress2Input] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const customerName = customer?.personal_info?.name || '이름 없음';
  const currentAddress = customer?.personal_info?.address?.address1;

  // 모달 제목
  const modalTitle = isGeocodingFailure
    ? `주소 수정 - ${customerName}`
    : `주소 입력 - ${customerName}`;

  // 설명 메시지
  const descriptionMessage = isGeocodingFailure
    ? `현재 주소를 인식할 수 없습니다. 새로운 주소를 검색하여 선택해주세요.`
    : `지도에 표시하려면 주소를 입력해주세요.`;

  const handleAddressSelect = (address: FormattedAddress) => {
    setSelectedAddress(address);
    setAddress2Input(address.address2 || '');
    if (import.meta.env.DEV) {
      console.log('[CustomerAddressInputModal] 주소 선택됨:', address);
    }
  };

  const handleSave = async () => {
    if (!selectedAddress || !customer?._id) return;

    setIsSaving(true);
    try {
      // address2Input 값을 사용하여 최종 주소 생성
      const finalAddress: FormattedAddress = {
        ...selectedAddress,
        address2: address2Input.trim()
      };
      await onSave(customer._id, finalAddress);
      // 성공 시 모달 닫기
      handleClose();
    } catch (error) {
      console.error('[CustomerAddressInputModal] 주소 저장 실패:', error);
      errorReporter.reportApiError(error as Error, { component: 'CustomerAddressInputModal.handleSave' });
      // 에러는 부모 컴포넌트에서 처리
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setSelectedAddress(null);
    setAddress2Input('');
    setIsSaving(false);
    onClose();
  };

  return (
    <>
      <Modal
        visible={isOpen}
        onClose={handleClose}
        title={modalTitle}
        size="md"
      >
        <div className="customer-address-input-modal">
          {/* 헤더 섹션 - 아이콘과 설명 */}
          <div className="address-modal-header">
            <div className={`address-modal-icon ${isGeocodingFailure ? 'warning' : ''}`}>
              {isGeocodingFailure ? '📍' : '🏠'}
            </div>
            <p className="address-input-description">
              {descriptionMessage}
            </p>
          </div>

          <div className="address-input-section">
            {/* Geocoding 오류 알림 */}
            {isGeocodingFailure && currentAddress && (
              <div className="geocoding-error-notice">
                <span className="notice-icon">⚠️</span>
                <span className="notice-text">
                  현재 주소 "{currentAddress}"가 지도에서 인식되지 않습니다
                </span>
              </div>
            )}

            {/* 주소 검색 카드 */}
            {!selectedAddress && (
              <div
                className="address-search-card"
                onClick={() => setIsAddressSearchOpen(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setIsAddressSearchOpen(true);
                  }
                }}
              >
                <div className="search-card-icon">🔍</div>
                <div className="search-card-content">
                  <div className="search-card-title">주소 검색</div>
                  <div className="search-card-subtitle">도로명 또는 지번 주소로 검색</div>
                </div>
                <span className="search-card-arrow">›</span>
              </div>
            )}

            {/* 선택된 주소 표시 및 상세주소 입력 */}
            {selectedAddress && (
              <div className="selected-address-display">
                <div className="selected-address-header">
                  <span className="check-icon">✓</span>
                  <h4>주소가 선택되었습니다</h4>
                </div>
                <div className="address-fields">
                  <div className="address-field">
                    <span className="address-label">우편번호</span>
                    <span className="address-value">{selectedAddress.postal_code}</span>
                  </div>
                  <div className="address-field">
                    <span className="address-label">기본주소</span>
                    <span className="address-value">{selectedAddress.address1}</span>
                  </div>
                  <div className="address-field address-field--input">
                    <label className="address-label" htmlFor="address2-input">
                      상세주소 (선택)
                    </label>
                    <input
                      id="address2-input"
                      type="text"
                      className="address-input"
                      placeholder="동, 호수 등 상세주소 입력"
                      value={address2Input}
                      onChange={(e) => setAddress2Input(e.target.value)}
                    />
                  </div>
                </div>

                {/* 다시 검색 버튼 */}
                <div className="address-change-button-wrapper">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsAddressSearchOpen(true)}
                  >
                    다른 주소 검색
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* 액션 버튼 */}
          <div className="address-input-actions">
            <Button
              variant="ghost"
              size="md"
              onClick={handleClose}
              disabled={isSaving}
            >
              취소
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleSave}
              disabled={!selectedAddress || isSaving}
              loading={isSaving}
            >
              저장
            </Button>
          </div>
        </div>
      </Modal>

      {/* 주소 검색 모달 */}
      {isAddressSearchOpen && (
        <AddressSearchModal
          isOpen={isAddressSearchOpen}
          onClose={() => setIsAddressSearchOpen(false)}
          onAddressSelect={handleAddressSelect}
        />
      )}
    </>
  );
};

export default CustomerAddressInputModal;
