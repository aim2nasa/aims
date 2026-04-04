/**
 * AIMS UIX-3 Customer Detail - Basic Info Tab
 * @since 2025-10-09
 * @version 2.0.0
 *
 * 🍎 고객 기본 정보 탭 컴포넌트
 * - 기본, 연락처, 주소, 보험 정보 섹션
 * - CustomerDetailView에서 추출한 순수 컴포넌트
 * - Document-Controller-View 패턴 준수
 */

import React from 'react';
import type { Customer } from '@/entities/customer/model';
import { AddressArchiveModal } from '../../../components/AddressArchiveModal';
import { useAddressArchiveController } from '../../../controllers/useAddressArchiveController';
import Tooltip from '@/shared/ui/Tooltip';

interface BasicInfoTabProps {
  customer: Customer;
}

export const BasicInfoTab: React.FC<BasicInfoTabProps> = ({ customer }) => {
  // 🍎 Controller Hook - 비즈니스 로직 분리
  const addressArchiveController = useAddressArchiveController(customer._id);

  return (
    <>
      {/* 🍎 기본 정보 섹션 */}
      <div className="form-section">
        <h3 className="form-section__title form-section__title--basic">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="5" r="2.5"/>
            <path d="M8 9c-2.5 0-4.5 1.5-4.5 3v1.5h9V12c0-1.5-2-3-4.5-3z"/>
          </svg>
          <span>기본</span>
        </h3>
        <div className="form-section__content">
          {/* 이름 */}
          <div className="form-row">
            <label className="form-row__label">이름</label>
            <div className="form-row__value">{customer.personal_info?.name || ''}</div>
          </div>

          {/* 이름 (영문) */}
          <div className="form-row">
            <label className="form-row__label">이름 (영문)</label>
            <div className="form-row__value">{customer.personal_info?.name_en || ''}</div>
          </div>

          {/* 생년월일 */}
          <div className="form-row">
            <label className="form-row__label">생년월일</label>
            <div className="form-row__value">{customer.personal_info?.birth_date || ''}</div>
          </div>

          {/* 성별 */}
          <div className="form-row">
            <label className="form-row__label">성별</label>
            <div className="form-row__value">
              {customer.personal_info?.gender === 'M' ? '남성' : customer.personal_info?.gender === 'F' ? '여성' : ''}
            </div>
          </div>
        </div>
      </div>

      {/* 🍎 연락처 정보 섹션 */}
      <div className="form-section">
        <h3 className="form-section__title form-section__title--contact">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.5 1A1.5 1.5 0 002 2.5v11A1.5 1.5 0 003.5 15h9a1.5 1.5 0 001.5-1.5v-11A1.5 1.5 0 0012.5 1h-9zM8 4a1 1 0 011 1v1a1 1 0 01-2 0V5a1 1 0 011-1zm-2 7a1 1 0 011-1h2a1 1 0 110 2H7a1 1 0 01-1-1z"/>
          </svg>
          <span>연락처</span>
        </h3>
        <div className="form-section__content">
          {/* 휴대폰 */}
          <div className="form-row">
            <label className="form-row__label">휴대폰</label>
            <div className="form-row__value">{customer.personal_info?.mobile_phone || ''}</div>
          </div>

          {/* 집 전화 */}
          <div className="form-row">
            <label className="form-row__label">집 전화</label>
            <div className="form-row__value">{customer.personal_info?.home_phone || ''}</div>
          </div>

          {/* 회사 전화 */}
          <div className="form-row">
            <label className="form-row__label">회사 전화</label>
            <div className="form-row__value">{customer.personal_info?.work_phone || ''}</div>
          </div>

          {/* 이메일 */}
          <div className="form-row">
            <label className="form-row__label">이메일</label>
            <div className="form-row__value">{customer.personal_info?.email || ''}</div>
          </div>
        </div>
      </div>

      {/* 🍎 주소 정보 섹션 */}
      <div className="form-section">
        <h3 className="form-section__title form-section__title--address">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0a6 6 0 00-6 6c0 4.5 6 10 6 10s6-5.5 6-10a6 6 0 00-6-6zm0 8a2 2 0 110-4 2 2 0 010 4z"/>
          </svg>
          <span>주소</span>
        </h3>
        <div className="form-section__content">
          {/* 우편번호 */}
          <div className="form-row">
            <label className="form-row__label">우편번호</label>
            <div className="form-row__value">{customer.personal_info?.address?.postal_code || ''}</div>
          </div>

          {/* 주소 */}
          <div className="form-row">
            <label className="form-row__label">주소</label>
            <div className="form-row__value">{customer.personal_info?.address?.address1 || ''}</div>
          </div>

          {/* 상세주소 */}
          <div className="form-row form-row--with-action">
            <label className="form-row__label">상세주소</label>
            <div className="form-row__value">{customer.personal_info?.address?.address2 || ''}</div>
            <span className="address-archive-label">
              주소 변경 이력({addressArchiveController.addressHistory.length})
            </span>
            <Tooltip content="주소 변경 이력 보기">
              <button
                className="address-archive-icon-button"
                onClick={addressArchiveController.open}
                aria-label="주소 변경 이력"
                type="button"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2 2h12v3H2V2zm0 4h12v8a1 1 0 01-1 1H3a1 1 0 01-1-1V6zm3 3h6v1H5V9z"/>
                </svg>
                {addressArchiveController.addressHistory.length > 0 && (
                  <span className="address-archive-badge">
                    {addressArchiveController.addressHistory.length}
                  </span>
                )}
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* 🍎 보험 정보 섹션 */}
      <div className="form-section">
        <h3 className="form-section__title form-section__title--insurance">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0L2 3v5c0 3.5 2.5 6.5 6 7 3.5-.5 6-3.5 6-7V3L8 0zm0 2l4 2v4c0 2.5-1.5 4.5-4 5-2.5-.5-4-2.5-4-5V4l4-2z"/>
          </svg>
          <span>보험</span>
        </h3>
        <div className="form-section__content">
          {/* 고객 유형 */}
          <div className="form-row">
            <label className="form-row__label">고객 유형</label>
            <div className="form-row__value">{customer.insurance_info?.customer_type || ''}</div>
          </div>
        </div>
      </div>

      {/* 🍎 메모 섹션 */}
      <div className="form-section">
        <h3 className="form-section__title form-section__title--memo">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2.5 1A1.5 1.5 0 001 2.5v11A1.5 1.5 0 002.5 15h11a1.5 1.5 0 001.5-1.5v-11A1.5 1.5 0 0013.5 1h-11zM4 4h8v1H4V4zm0 3h8v1H4V7zm0 3h5v1H4v-1z"/>
          </svg>
          <span>메모</span>
        </h3>
        <div className="form-section__content">
          <div className="form-row form-row--memo">
            <div className="form-row__value form-row__value--memo">
              {customer.memo || <span className="form-row__placeholder">메모 없음 (정보 수정에서 추가 가능)</span>}
            </div>
          </div>
        </div>
      </div>

      {/* 🍎 주소 보관소 모달 */}
      <AddressArchiveModal
        isOpen={addressArchiveController.isOpen}
        onClose={addressArchiveController.close}
        addressHistory={addressArchiveController.addressHistory}
        isLoading={addressArchiveController.isLoading}
        error={addressArchiveController.error}
        customerName={customer.personal_info?.name || ''}
      />
    </>
  );
};

