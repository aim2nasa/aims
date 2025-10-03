/**
 * AIMS UIX-3 Customer Detail View
 * @since 2025-10-03
 * @version 1.0.0
 *
 * 고객 상세 정보 표시 (RightPane)
 * AIMS-UIX2 방식: BaseViewer 상속받아 구현
 */

import React, { useState, useEffect, useCallback } from 'react';
import BaseViewer from '../../../../components/BaseViewer/BaseViewer';
import type { Customer } from '@/entities/customer/model';
import './CustomerDetailView.css';

interface CustomerDetailViewProps {
  /** 고객 정보 */
  customer: Customer;
  /** 닫기 핸들러 */
  onClose: () => void;
  /** RightPane과의 좌측 간격 (px) */
  gapLeft?: number;
  /** RightPane과의 우측 간격 (px) */
  gapRight?: number;
  /** RightPane과의 상단 간격 (px) */
  gapTop?: number;
  /** RightPane과의 하단 간격 (px) */
  gapBottom?: number;
}

/**
 * CustomerDetailView React Component
 *
 * RightPane에 표시되는 고객 상세 정보
 * BaseViewer를 상속받아 문서 뷰어와 동일한 UI/UX 패턴 적용
 *
 * @example
 * ```tsx
 * <CustomerDetailView
 *   customer={customerData}
 *   onClose={handleClose}
 * />
 * ```
 */
export const CustomerDetailView: React.FC<CustomerDetailViewProps> = ({
  customer,
  onClose,
  gapLeft = 2,
  gapRight = 2,
  gapTop = 2,
  gapBottom = 2,
}) => {
  const [activeTab, setActiveTab] = useState<string>('info');

  if (!customer) return null;

  return (
    <BaseViewer
      visible={true}
      title={customer.personal_info?.name || '고객 정보'}
      onClose={onClose}
      gapLeft={gapLeft}
      gapRight={gapRight}
      gapTop={gapTop}
      gapBottom={gapBottom}
    >
      <div className="customer-detail-view">
        {/* 탭 네비게이션 */}
        <div className="customer-detail-view__tabs">
          <button
            className={`customer-detail-view__tab ${activeTab === 'info' ? 'customer-detail-view__tab--active' : ''}`}
            onClick={() => setActiveTab('info')}
          >
            기본 정보
          </button>
          <button
            className={`customer-detail-view__tab ${activeTab === 'contact' ? 'customer-detail-view__tab--active' : ''}`}
            onClick={() => setActiveTab('contact')}
          >
            연락처
          </button>
          <button
            className={`customer-detail-view__tab ${activeTab === 'insurance' ? 'customer-detail-view__tab--active' : ''}`}
            onClick={() => setActiveTab('insurance')}
          >
            보험 정보
          </button>
        </div>

        {/* 탭 콘텐츠 */}
        <div className="customer-detail-view__content">
          {/* 기본 정보 탭 */}
          {activeTab === 'info' && (
            <div className="customer-detail-view__section">
              <div className="customer-detail-view__field-group">
                <div className="customer-detail-view__field">
                  <label className="customer-detail-view__label">이름</label>
                  <span className="customer-detail-view__value">
                    {customer.personal_info?.name || '-'}
                  </span>
                </div>

                {customer.personal_info?.name_en && (
                  <div className="customer-detail-view__field">
                    <label className="customer-detail-view__label">영문 이름</label>
                    <span className="customer-detail-view__value">
                      {customer.personal_info.name_en}
                    </span>
                  </div>
                )}

                {customer.personal_info?.birth_date && (
                  <div className="customer-detail-view__field">
                    <label className="customer-detail-view__label">생년월일</label>
                    <span className="customer-detail-view__value">
                      {customer.personal_info.birth_date}
                    </span>
                  </div>
                )}

                {customer.personal_info?.gender && (
                  <div className="customer-detail-view__field">
                    <label className="customer-detail-view__label">성별</label>
                    <span className="customer-detail-view__value">
                      {customer.personal_info.gender === 'M' ? '남성' : '여성'}
                    </span>
                  </div>
                )}
              </div>

              {/* 주소 정보 */}
              {customer.personal_info?.address && (
                <>
                  <div className="customer-detail-view__divider" />
                  <h3 className="customer-detail-view__section-title">주소</h3>
                  <div className="customer-detail-view__field-group">
                    {customer.personal_info.address.postal_code && (
                      <div className="customer-detail-view__field">
                        <label className="customer-detail-view__label">우편번호</label>
                        <span className="customer-detail-view__value">
                          {customer.personal_info.address.postal_code}
                        </span>
                      </div>
                    )}
                    {customer.personal_info.address.address1 && (
                      <div className="customer-detail-view__field">
                        <label className="customer-detail-view__label">주소</label>
                        <span className="customer-detail-view__value">
                          {customer.personal_info.address.address1}
                        </span>
                      </div>
                    )}
                    {customer.personal_info.address.address2 && (
                      <div className="customer-detail-view__field">
                        <label className="customer-detail-view__label">상세 주소</label>
                        <span className="customer-detail-view__value">
                          {customer.personal_info.address.address2}
                        </span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* 연락처 탭 */}
          {activeTab === 'contact' && (
            <div className="customer-detail-view__section">
              <div className="customer-detail-view__field-group">
                {customer.personal_info?.mobile_phone && (
                  <div className="customer-detail-view__field">
                    <label className="customer-detail-view__label">휴대전화</label>
                    <span className="customer-detail-view__value">
                      {customer.personal_info.mobile_phone}
                    </span>
                  </div>
                )}

                {customer.personal_info?.home_phone && (
                  <div className="customer-detail-view__field">
                    <label className="customer-detail-view__label">집 전화</label>
                    <span className="customer-detail-view__value">
                      {customer.personal_info.home_phone}
                    </span>
                  </div>
                )}

                {customer.personal_info?.work_phone && (
                  <div className="customer-detail-view__field">
                    <label className="customer-detail-view__label">직장 전화</label>
                    <span className="customer-detail-view__value">
                      {customer.personal_info.work_phone}
                    </span>
                  </div>
                )}

                {customer.personal_info?.email && (
                  <div className="customer-detail-view__field">
                    <label className="customer-detail-view__label">이메일</label>
                    <span className="customer-detail-view__value">
                      {customer.personal_info.email}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 보험 정보 탭 */}
          {activeTab === 'insurance' && (
            <div className="customer-detail-view__section">
              <div className="customer-detail-view__field-group">
                <div className="customer-detail-view__field">
                  <label className="customer-detail-view__label">고객 유형</label>
                  <span className="customer-detail-view__value">
                    {customer.insurance_info?.customer_type || '-'}
                  </span>
                </div>

                {customer.insurance_info?.risk_level && (
                  <div className="customer-detail-view__field">
                    <label className="customer-detail-view__label">위험도</label>
                    <span className="customer-detail-view__value">
                      {customer.insurance_info.risk_level}
                    </span>
                  </div>
                )}

                {customer.insurance_info?.annual_premium && (
                  <div className="customer-detail-view__field">
                    <label className="customer-detail-view__label">연간 보험료</label>
                    <span className="customer-detail-view__value">
                      {customer.insurance_info.annual_premium.toLocaleString()}원
                    </span>
                  </div>
                )}

                {customer.insurance_info?.total_coverage && (
                  <div className="customer-detail-view__field">
                    <label className="customer-detail-view__label">총 보장액</label>
                    <span className="customer-detail-view__value">
                      {customer.insurance_info.total_coverage.toLocaleString()}원
                    </span>
                  </div>
                )}
              </div>

              <div className="customer-detail-view__divider" />
              <h3 className="customer-detail-view__section-title">관리 정보</h3>
              <div className="customer-detail-view__field-group">
                <div className="customer-detail-view__field">
                  <label className="customer-detail-view__label">상태</label>
                  <span className={`customer-detail-view__status customer-detail-view__status--${customer.meta?.status || 'active'}`}>
                    {customer.meta?.status === 'active' ? '활성' : '비활성'}
                  </span>
                </div>

                {customer.meta?.created_at && (
                  <div className="customer-detail-view__field">
                    <label className="customer-detail-view__label">등록일</label>
                    <span className="customer-detail-view__value">
                      {new Date(customer.meta.created_at).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                )}

                {customer.meta?.updated_at && (
                  <div className="customer-detail-view__field">
                    <label className="customer-detail-view__label">수정일</label>
                    <span className="customer-detail-view__value">
                      {new Date(customer.meta.updated_at).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </BaseViewer>
  );
};

export default CustomerDetailView;
