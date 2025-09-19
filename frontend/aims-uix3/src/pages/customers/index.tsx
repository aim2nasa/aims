/**
 * AIMS UIX-3 Customers Page (View Layer)
 * @since 2025-09-15
 * @version 2.0.0
 *
 * 고객 관리 페이지 - 순수 View 컴포넌트
 * ARCHITECTURE.md의 Document-Controller-View 패턴을 따름
 * 비즈니스 로직은 useCustomersController에 위임
 */

import React, { useState } from 'react';
import { Button } from '@/shared/ui/Button';
import { CardSkeleton } from '@/shared/ui/LoadingSkeleton';
import { useCustomersController } from '@/controllers/useCustomersController';
import {
  type Customer,
  type CreateCustomerData,
  CustomerUtils,
} from '@/entities/customer';
import './CustomersPage.css';

/**
 * 고객 카드 컴포넌트
 */
interface CustomerCardProps {
  customer: Customer;
  onEdit?: (customer: Customer) => void;
  onDelete?: (customer: Customer) => void;
}

const CustomerCard: React.FC<CustomerCardProps> = ({ customer, onEdit, onDelete }) => {
  return (
    <div className="customer-card">
      <div className="customer-card__header">
        <div className="customer-card__info">
          <h3 className="customer-card__name">
            {CustomerUtils.getDisplayName(customer)}
          </h3>
          <p className="customer-card__contact">
            {CustomerUtils.getContactInfo(customer)}
          </p>
        </div>
        <div className={`customer-card__status customer-card__status--${customer.isActive ? 'active' : 'inactive'}`}>
          {CustomerUtils.getStatusText(customer)}
        </div>
      </div>

      {customer.tags.length > 0 && (
        <div className="customer-card__tags">
          {customer.tags.slice(0, 3).map(tag => (
            <span key={tag} className="customer-card__tag">
              {tag}
            </span>
          ))}
          {customer.tags.length > 3 && (
            <span className="customer-card__tag customer-card__tag--more">
              +{customer.tags.length - 3}개 더
            </span>
          )}
        </div>
      )}

      <div className="customer-card__meta">
        <span className="customer-card__date">
          {new Date(customer.createdAt).toLocaleDateString('ko-KR')} 등록
        </span>
        {customer.birthDate && (
          <span className="customer-card__age">
            {CustomerUtils.getAge(customer)}세
          </span>
        )}
      </div>

      <div className="customer-card__actions">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onEdit?.(customer)}
        >
          수정
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete?.(customer)}
        >
          삭제
        </Button>
      </div>
    </div>
  );
};

/**
 * 고객 생성 폼 컴포넌트
 */
interface CustomerFormProps {
  onSubmit: (data: CreateCustomerData) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const CustomerForm: React.FC<CustomerFormProps> = ({ onSubmit, onCancel, isLoading }) => {
  const [formData, setFormData] = useState<Partial<CreateCustomerData>>({
    name: '',
    phone: '',
    email: '',
    address: '',
    birthDate: '',
    gender: undefined,
    occupation: '',
    notes: '',
    tags: [],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) return;

    onSubmit(formData as CreateCustomerData);
  };

  const handleChange = (field: keyof CreateCustomerData, value: string | string[]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="customer-form">
      <h3 className="customer-form__title">새 고객 추가</h3>

      <div className="customer-form__grid">
        <div className="customer-form__field">
          <label htmlFor="name" className="customer-form__label">
            이름 *
          </label>
          <input
            id="name"
            type="text"
            value={formData.name || ''}
            onChange={(e) => handleChange('name', e.target.value)}
            className="customer-form__input"
            required
          />
        </div>

        <div className="customer-form__field">
          <label htmlFor="phone" className="customer-form__label">
            전화번호
          </label>
          <input
            id="phone"
            type="tel"
            value={formData.phone || ''}
            onChange={(e) => handleChange('phone', e.target.value)}
            className="customer-form__input"
          />
        </div>

        <div className="customer-form__field">
          <label htmlFor="email" className="customer-form__label">
            이메일
          </label>
          <input
            id="email"
            type="email"
            value={formData.email || ''}
            onChange={(e) => handleChange('email', e.target.value)}
            className="customer-form__input"
          />
        </div>

        <div className="customer-form__field">
          <label htmlFor="birthDate" className="customer-form__label">
            생년월일
          </label>
          <input
            id="birthDate"
            type="date"
            value={formData.birthDate || ''}
            onChange={(e) => handleChange('birthDate', e.target.value)}
            className="customer-form__input"
          />
        </div>

        <div className="customer-form__field">
          <label htmlFor="gender" className="customer-form__label">
            성별
          </label>
          <select
            id="gender"
            value={formData.gender || ''}
            onChange={(e) => handleChange('gender', e.target.value)}
            className="customer-form__input"
          >
            <option value="">선택 안함</option>
            <option value="M">남성</option>
            <option value="F">여성</option>
            <option value="other">기타</option>
          </select>
        </div>

        <div className="customer-form__field">
          <label htmlFor="occupation" className="customer-form__label">
            직업
          </label>
          <input
            id="occupation"
            type="text"
            value={formData.occupation || ''}
            onChange={(e) => handleChange('occupation', e.target.value)}
            className="customer-form__input"
          />
        </div>
      </div>

      <div className="customer-form__field customer-form__field--full">
        <label htmlFor="address" className="customer-form__label">
          주소
        </label>
        <input
          id="address"
          type="text"
          value={formData.address || ''}
          onChange={(e) => handleChange('address', e.target.value)}
          className="customer-form__input"
        />
      </div>

      <div className="customer-form__field customer-form__field--full">
        <label htmlFor="notes" className="customer-form__label">
          메모
        </label>
        <textarea
          id="notes"
          value={formData.notes || ''}
          onChange={(e) => handleChange('notes', e.target.value)}
          className="customer-form__textarea"
          rows={3}
        />
      </div>

      <div className="customer-form__actions">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={isLoading}
        >
          취소
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={isLoading || false}
          disabled={!formData.name?.trim()}
        >
          추가하기
        </Button>
      </div>
    </form>
  );
};

/**
 * 고객관리 페이지 메인 컴포넌트 (View Layer)
 */
const CustomersPage: React.FC = () => {
  // Controller에서 모든 비즈니스 로직과 상태를 가져옴
  const {
    // 데이터
    customers,
    searchQuery,
    error,
    hasMore,

    // 로딩 상태
    isLoading,
    isCreating,
    isEmpty,
    searchResultMessage,

    // UI 상태
    showCreateForm,

    // 액션들
    createCustomer,
    handleSearchChange,
    loadMoreCustomers,
    handleEditCustomer,
    handleDeleteCustomer,
    handleOpenCreateForm,
    handleCloseCreateForm,
    clearError,
  } = useCustomersController();

  return (
    <div className="customers-page">
      {/* 에러 메시지 */}
      {error && (
        <div className="customers-error">
          <p>{error}</p>
          <Button variant="ghost" onClick={clearError}>
            닫기
          </Button>
        </div>
      )}

      {/* 헤더 섹션 */}
      <div className="customers-header">
        <div className="customers-header__content">
          <h1 className="customers-header__title">고객 관리</h1>
          <p className="customers-header__subtitle">
            등록된 고객 정보를 조회, 관리하고 새로운 고객을 추가할 수 있습니다.
          </p>
        </div>
      </div>

      {/* 액션바 */}
      <div className="customers-actions">
        <div className="customers-actions__left">
          <div className="customers-search">
            <input
              type="text"
              placeholder="고객 이름, 전화번호, 이메일로 검색..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="customers-search__input"
            />
            <div className="customers-search__results">
              <span className="customers-search__count">
                {searchResultMessage}
              </span>
            </div>
          </div>
        </div>

        <div className="customers-actions__right">
          <Button
            variant="primary"
            onClick={handleOpenCreateForm}
          >
            새 고객 추가
          </Button>
        </div>
      </div>

      {/* 고객 생성 폼 */}
      {showCreateForm && (
        <div className="customers-form-overlay">
          <div className="customers-form-container">
            <CustomerForm
              onSubmit={createCustomer}
              onCancel={handleCloseCreateForm}
              isLoading={isCreating}
            />
          </div>
        </div>
      )}

      {/* 고객 목록 */}
      <div className="customers-content">
        {isLoading && customers.length === 0 ? (
          // 초기 로딩 상태
          <div className="customers-loading">
            <div className="customers-grid">
              {Array.from({ length: 6 }).map((_, index) => (
                <CardSkeleton
                  key={index}
                  showAvatar={false}
                  titleLines={1}
                  contentLines={2}
                  showActions
                />
              ))}
            </div>
          </div>
        ) : isEmpty ? (
          // 빈 상태
          <div className="customers-empty">
            <h3>등록된 고객이 없습니다</h3>
            <p>첫 번째 고객을 추가해 보세요.</p>
            <Button
              variant="primary"
              onClick={handleOpenCreateForm}
            >
              고객 추가하기
            </Button>
          </div>
        ) : (
          // 정상 상태
          <>
            <div className="customers-grid">
              {customers.map(customer => (
                <CustomerCard
                  key={customer._id}
                  customer={customer}
                  onEdit={handleEditCustomer}
                  onDelete={handleDeleteCustomer}
                />
              ))}
            </div>

            {/* 더 보기 버튼 */}
            {hasMore && (
              <div className="customers-load-more">
                <Button
                  variant="secondary"
                  onClick={loadMoreCustomers}
                  loading={isLoading}
                  fullWidth
                >
                  더 보기
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CustomersPage;