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
import CustomerEditModal from '../CustomerEditModal';
import type { Customer } from '@/entities/customer/model';
import { CustomerService } from '@/services/customerService';
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
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [customerData, setCustomerData] = useState<Customer>(customer);

  // 고객 데이터 업데이트 시 동기화
  useEffect(() => {
    setCustomerData(customer);
  }, [customer]);

  /**
   * 수정 버튼 클릭 핸들러
   */
  const handleEditClick = useCallback(() => {
    setIsEditModalVisible(true);
  }, []);

  /**
   * 삭제 버튼 클릭 핸들러
   */
  const handleDeleteClick = useCallback(async () => {
    if (window.confirm(`"${customer.personal_info?.name}" 고객을 삭제하시겠습니까?`)) {
      try {
        await CustomerService.deleteCustomer(customer._id);
        console.log('[CustomerDetailView] 고객 삭제 성공:', customer._id);
        onClose(); // 삭제 성공 시 상세보기 닫기
      } catch (error) {
        console.error('[CustomerDetailView] 고객 삭제 실패:', error);
        alert(error instanceof Error ? error.message : '고객 삭제에 실패했습니다');
      }
    }
  }, [customer, onClose]);

  /**
   * 저장 성공 핸들러
   */
  const handleSaveSuccess = useCallback(() => {
    // TODO: 고객 데이터 새로고침 (부모 컴포넌트에서 처리)
    console.log('[CustomerDetailView] 고객 정보 수정 완료');
  }, []);

  if (!customerData) return null;

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
        {/* 탭 네비게이션 및 수정 버튼 */}
        <div className="customer-detail-view__header">
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
          <div className="customer-detail-view__actions">
            <button
              className="customer-detail-view__edit-button"
              onClick={handleEditClick}
              aria-label="고객 정보 수정"
              title="고객 정보 수정"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button
              className="customer-detail-view__delete-button"
              onClick={handleDeleteClick}
              aria-label="고객 삭제"
              title="고객 삭제"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
          </div>
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

      {/* 고객 정보 수정 모달 */}
      <CustomerEditModal
        visible={isEditModalVisible}
        customer={customerData}
        onClose={() => setIsEditModalVisible(false)}
        onSuccess={handleSaveSuccess}
      />
    </BaseViewer>
  );
};

export default CustomerDetailView;
