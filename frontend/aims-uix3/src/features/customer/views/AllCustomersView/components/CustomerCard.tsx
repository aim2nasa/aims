/**
 * AIMS UIX-3 Customer Card Component
 * @since 2025-10-03
 * @version 1.0.0
 *
 * iOS 스타일의 고객 카드 컴포넌트
 */

import React from 'react';
import { Customer, CustomerUtils, CustomerTypeUtils } from '@/entities/customer/model';
import { formatDate } from '@/shared/lib/timeUtils';
import './CustomerCard.css';

interface CustomerCardProps {
  customer: Customer;
  onClick?: (customer: Customer) => void;
}

export const CustomerCard: React.FC<CustomerCardProps> = ({ customer, onClick }) => {
  const customerType = customer.insurance_info?.customer_type || '개인';
  const typeIcon = CustomerTypeUtils.getIcon(customerType);

  return (
    <div
      className="customer-card"
      onClick={() => onClick?.(customer)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(customer);
        }
      }}
    >
      {/* Header */}
      <div className="customer-card__header">
        <div className="customer-card__icon">{typeIcon}</div>
        <div className="customer-card__info">
          <h3 className="customer-card__name">
            {CustomerUtils.getDisplayName(customer)}
          </h3>
          <p className="customer-card__type">{customerType}</p>
        </div>
        <div
          className={`customer-card__status customer-card__status--${
            customer.meta?.status === 'active' ? 'active' : 'inactive'
          }`}
        >
          {CustomerUtils.getStatusText(customer)}
        </div>
      </div>

      {/* Contact Info */}
      <div className="customer-card__contact">
        <p>{CustomerUtils.getContactInfo(customer)}</p>
      </div>

      {/* Meta Info */}
      <div className="customer-card__meta">
        <span className="customer-card__date">
          {formatDate(customer.meta?.created_at)} 등록
        </span>
        {customer.personal_info?.birth_date && (
          <span className="customer-card__age">
            {CustomerUtils.getAge(customer)}세
          </span>
        )}
      </div>
    </div>
  );
};

export default CustomerCard;
