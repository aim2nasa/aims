/**
 * AIMS UIX-3 Customer Registration - Address Section
 * @since 2025-10-03
 * @version 2.0.0 - UIX2 주소 검색 기능 통합
 *
 * 주소 정보 입력 섹션
 * iOS Settings 스타일 적용
 */

import React, { useState } from 'react';
import { AddressSearchModal } from '../../../components/AddressSearchModal';
import type { FormattedAddress } from '../../../api/addressApi';
import type { CustomerRegistrationFormData } from '../../../controllers/useCustomerRegistrationController';

export type AddressFormData = Pick<CustomerRegistrationFormData, 'postal_code' | 'address1' | 'address2'>;

interface AddressSectionProps {
  formData: AddressFormData;
  errors: Record<string, string>;
  onChange: (field: keyof AddressFormData, value: AddressFormData[keyof AddressFormData]) => void;
}

export const AddressSection: React.FC<AddressSectionProps> = ({
  formData,
  onChange,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleAddressSelect = (address: FormattedAddress) => {
    if (import.meta.env.DEV) {
      console.log('✅ 주소 선택됨:', address);
    }
    onChange('postal_code', address.postal_code);
    onChange('address1', address.address1);
    onChange('address2', address.address2);
  };

  const handleSearchClick = () => {
    if (import.meta.env.DEV) {
      console.log('🔍 주소 검색 버튼 클릭!');
    }
    setIsModalOpen(true);
  };

  return (
    <div className="form-section">
      <h3 className="form-section__title form-section__title--address">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1l-7 6h2v7h4V9h2v5h4V7h2L8 1zm0 2.5L12 7v6h-2V8H6v5H4V7l4-3.5z"/>
        </svg>
        <span>주소</span>
      </h3>

      <div className="form-section__content">
        {/* 주소 검색 */}
        <div className="form-row">
          <label className="form-row__label">주소 검색</label>
          <div className="form-row__input">
            <input
              type="text"
              value=""
              readOnly
              placeholder="도로명 또는 지번주소를 검색하세요 (예: 테헤란로 123)"
              className="address-search-placeholder"
            />
          </div>
          <button
            type="button"
            className="form-row__search-btn"
            onClick={handleSearchClick}
          >
            🔍 검색
          </button>
        </div>

        {/* 검색된 주소 */}
        <div className="form-row">
          <label className="form-row__label">우편번호</label>
          <div className="form-row__input">
            <input
              type="text"
              value={formData.postal_code || ''}
              readOnly
              placeholder="우편번호"
              className="address-field-readonly"
            />
          </div>
        </div>

        <div className="form-row">
          <label className="form-row__label">기본주소</label>
          <div className="form-row__input">
            <input
              type="text"
              value={formData.address1 || ''}
              readOnly
              placeholder="서울 강남구 테헤란로 123"
              className="address-field-readonly"
            />
          </div>
        </div>

        {/* 상세주소 */}
        <div className="form-row">
          <label className="form-row__label">상세주소</label>
          <div className="form-row__input">
            {formData.address1 ? (
              <input
                type="text"
                value={formData.address2 || ''}
                onChange={(e) => onChange('address2', e.target.value)}
                placeholder="상세주소를 입력하세요 (동/호수, 건물명 등)"
              />
            ) : (
              <div className="address-disabled-message">
                ❌ 주소검색을 먼저 해주세요
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 주소 검색 모달 */}
      {isModalOpen && (
        <AddressSearchModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onAddressSelect={handleAddressSelect}
        />
      )}
    </div>
  );
};

export default AddressSection;
