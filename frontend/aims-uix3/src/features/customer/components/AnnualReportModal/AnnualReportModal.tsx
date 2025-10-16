/**
 * AIMS UIX-3 Annual Report Modal
 * @since 2025-10-16
 * @version 3.0.0
 *
 * 🍎 Annual Report 모달 컴포넌트
 * - 고객의 보험 계약 현황 표시 (Annual Review Report)
 * - Document-Controller-View 패턴 준수 (Layer 5: View)
 * - 순수 View 컴포넌트 (비즈니스 로직 없음)
 * - 문서 프리뷰 모달 디자인 적용
 */

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/shared/ui/Button';
import SFSymbol, { SFSymbolSize, SFSymbolWeight } from '../../../../components/SFSymbol';
import type { AnnualReport, InsuranceContract } from '../../api/annualReportApi';
import { AnnualReportApi } from '../../api/annualReportApi';
import './AnnualReportModal.css';

/**
 * AnnualReportModal Props 인터페이스
 */
interface AnnualReportModalProps {
  /** 모달 열림/닫힘 상태 */
  isOpen: boolean;
  /** 모달 닫기 핸들러 */
  onClose: () => void;
  /** Annual Report 데이터 */
  report: AnnualReport | null;
  /** 로딩 상태 */
  isLoading: boolean;
  /** 에러 메시지 */
  error: string | null;
  /** 고객 이름 */
  customerName: string;
}

// 정렬 설정 타입
type SortConfig = {
  key: keyof InsuranceContract;
  direction: 'asc' | 'desc';
} | null;

export const AnnualReportModal: React.FC<AnnualReportModalProps> = ({
  isOpen,
  onClose,
  report,
  isLoading,
  error,
  customerName
}) => {
  // 드래그 상태
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  // 정렬 상태
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  // 모달이 열릴 때 위치 초기화
  useEffect(() => {
    if (isOpen) {
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen]);

  // ESC 키로 닫기
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // 드래그 시작
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).closest('.annual-report-modal__title')) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  };

  // 드래그 중
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  if (!isOpen) return null;

  /**
   * 계약 상태에 따른 배지 스타일
   */
  const getStatusBadgeClass = (status?: string) => {
    if (!status) return 'contract-item__status--default';

    const lowerStatus = status.toLowerCase();
    if (lowerStatus.includes('유지') || lowerStatus.includes('정상')) {
      return 'contract-item__status--active';
    }
    if (lowerStatus.includes('만기') || lowerStatus.includes('해지')) {
      return 'contract-item__status--inactive';
    }
    return 'contract-item__status--default';
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.currentTarget === event.target) {
      onClose();
    }
  };

  /**
   * 정렬 핸들러 - 컬럼 클릭 시 오름차순/내림차순 토글
   */
  const handleSort = (key: keyof InsuranceContract) => {
    let direction: 'asc' | 'desc' = 'asc';

    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }

    setSortConfig({ key, direction });
  };

  /**
   * 정렬된 계약 목록 생성
   */
  const getSortedContracts = (contracts: InsuranceContract[]): InsuranceContract[] => {
    if (!sortConfig) return contracts;

    const sortedContracts = [...contracts];

    sortedContracts.sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      // null/undefined 처리
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;

      // 숫자 비교
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }

      // 문자열 비교
      const aStr = String(aValue);
      const bStr = String(bValue);
      const comparison = aStr.localeCompare(bStr, 'ko-KR');

      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });

    return sortedContracts;
  };

  /**
   * 정렬 아이콘 렌더링
   */
  const renderSortIcon = (columnKey: keyof InsuranceContract) => {
    if (!sortConfig || sortConfig.key !== columnKey) {
      return <SFSymbol name="chevron.up.chevron.down" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.REGULAR} />;
    }

    return sortConfig.direction === 'asc'
      ? <SFSymbol name="chevron.up" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.SEMIBOLD} />
      : <SFSymbol name="chevron.down" size={SFSymbolSize.CAPTION_2} weight={SFSymbolWeight.SEMIBOLD} />;
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="annual-report-modal__center">
          <span>Annual Report를 불러오는 중...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="annual-report-modal__center annual-report-modal__center--error">
          <SFSymbol
            name="exclamationmark.triangle.fill"
            size={SFSymbolSize.TITLE_3}
            weight={SFSymbolWeight.MEDIUM}
          />
          <p>{error}</p>
        </div>
      );
    }

    if (!report) {
      return (
        <div className="annual-report-modal__center">
          <SFSymbol
            name="doc.text.slash"
            size={SFSymbolSize.TITLE_3}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>Annual Report가 없습니다.</span>
        </div>
      );
    }

    return (
      <>
        {/* Summary Section */}
        <div className="annual-report-summary">
          <div className="annual-report-summary__item">
            <span className="annual-report-summary__label">발행일</span>
            <span className="annual-report-summary__value">
              {report.issue_date.split('T')[0]}
            </span>
          </div>
          <div className="annual-report-summary__item">
            <span className="annual-report-summary__label">총 월보험료</span>
            <span className="annual-report-summary__value annual-report-summary__value--primary">
              {AnnualReportApi.formatCurrency(report.total_monthly_premium)}
            </span>
          </div>
          <div className="annual-report-summary__item">
            <span className="annual-report-summary__label">계약 건수</span>
            <span className="annual-report-summary__value">
              {AnnualReportApi.formatContractCount(report.contract_count)}
            </span>
          </div>
        </div>

        {/* Contracts Table */}
        <div className="annual-report-contracts">
          <h3 className="annual-report-contracts__title">
            보험 계약 목록 ({report.contract_count}건)
          </h3>

          <div className="contracts-table-wrapper">
            <table className="contracts-table">
              <thead>
                <tr>
                  <th>순번</th>
                  <th className="contracts-table__th--sortable" onClick={() => handleSort('insurance_company')}>
                    <span>보험사</span>
                    {renderSortIcon('insurance_company')}
                  </th>
                  <th className="contracts-table__th--sortable" onClick={() => handleSort('contract_number')}>
                    <span>증권번호</span>
                    {renderSortIcon('contract_number')}
                  </th>
                  <th className="contracts-table__th--sortable" onClick={() => handleSort('product_name')}>
                    <span>보험상품</span>
                    {renderSortIcon('product_name')}
                  </th>
                  <th className="contracts-table__th--sortable" onClick={() => handleSort('contractor_name')}>
                    <span>계약자</span>
                    {renderSortIcon('contractor_name')}
                  </th>
                  <th className="contracts-table__th--sortable" onClick={() => handleSort('insured_name')}>
                    <span>피보험자</span>
                    {renderSortIcon('insured_name')}
                  </th>
                  <th className="contracts-table__th--sortable" onClick={() => handleSort('contract_date')}>
                    <span>계약일</span>
                    {renderSortIcon('contract_date')}
                  </th>
                  <th className="contracts-table__th--sortable" onClick={() => handleSort('status')}>
                    <span>계약상태</span>
                    {renderSortIcon('status')}
                  </th>
                  <th className="contracts-table__th--sortable" onClick={() => handleSort('coverage_amount')}>
                    <span>가입금액(만원)</span>
                    {renderSortIcon('coverage_amount')}
                  </th>
                  <th className="contracts-table__th--sortable" onClick={() => handleSort('insurance_period')}>
                    <span>보험기간</span>
                    {renderSortIcon('insurance_period')}
                  </th>
                  <th className="contracts-table__th--sortable" onClick={() => handleSort('premium_payment_period')}>
                    <span>납입기간</span>
                    {renderSortIcon('premium_payment_period')}
                  </th>
                  <th className="contracts-table__th--sortable" onClick={() => handleSort('monthly_premium')}>
                    <span>보험료(원)</span>
                    {renderSortIcon('monthly_premium')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {getSortedContracts(report.contracts).map((contract: InsuranceContract, index: number) => (
                  <tr key={index}>
                    <td className="contracts-table__cell--number">{index + 1}</td>
                    <td className="contracts-table__cell--company">{contract.insurance_company}</td>
                    <td className="contracts-table__cell--contract-number">{contract.contract_number}</td>
                    <td className="contracts-table__cell--product">{contract.product_name}</td>
                    <td className="contracts-table__cell--contractor">{contract.contractor_name || '-'}</td>
                    <td className="contracts-table__cell--insured">{contract.insured_name || '-'}</td>
                    <td className="contracts-table__cell--date">{contract.contract_date}</td>
                    <td className="contracts-table__cell--status">
                      <span className={`status-badge ${getStatusBadgeClass(contract.status)}`}>
                        {contract.status || '-'}
                      </span>
                    </td>
                    <td className="contracts-table__cell--coverage">
                      {(contract.coverage_amount / 10000).toLocaleString('ko-KR')}
                    </td>
                    <td className="contracts-table__cell--period">{contract.insurance_period || '-'}</td>
                    <td className="contracts-table__cell--payment">{contract.premium_payment_period || '-'}</td>
                    <td className="contracts-table__cell--premium contracts-table__cell--premium-highlight">
                      {contract.monthly_premium.toLocaleString('ko-KR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Info */}
        <div className="annual-report-modal__footer">
          <span className="annual-report-modal__footer-text">
            생성일: {new Date(report.created_at).toLocaleString('ko-KR')}
          </span>
        </div>
      </>
    );
  };

  const portalTarget =
    typeof window !== 'undefined' && window.document ? window.document.body : null;

  if (!portalTarget) {
    return null;
  }

  const modalContent = (
    <div
      className="customer-document-preview__backdrop"
      role="dialog"
      aria-modal="true"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className={`customer-document-preview ${isDragging ? 'customer-document-preview--dragging' : ''}`}
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - 드래그 가능 */}
        <header
          className="customer-document-preview__header"
          onMouseDown={handleMouseDown}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <div className="customer-document-preview__title">
            <SFSymbol
              name="chart.bar.doc.horizontal"
              size={SFSymbolSize.BODY}
              weight={SFSymbolWeight.REGULAR}
            />
            <div>
              <h2>{customerName}님의 Annual Report</h2>
              <p>
                {report?.issue_date ? `발행일: ${report.issue_date.split('T')[0]}` : '정보 없음'}
                {report && ` · ${report.contract_count}건`}
              </p>
            </div>
          </div>
          <div className="customer-document-preview__header-actions">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              style={{ cursor: 'pointer' }}
            >
              닫기
            </Button>
          </div>
        </header>

        <main className="customer-document-preview__content">
          {renderContent()}
        </main>
      </div>
    </div>
  );

  // Portal을 사용하여 document.body에 직접 렌더링
  return createPortal(modalContent, portalTarget);
};

export default AnnualReportModal;
