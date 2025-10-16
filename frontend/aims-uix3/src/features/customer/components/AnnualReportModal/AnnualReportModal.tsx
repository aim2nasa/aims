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
                  <th>보험사</th>
                  <th>증권번호</th>
                  <th>보험상품</th>
                  <th>계약자</th>
                  <th>피보험자</th>
                  <th>계약일</th>
                  <th>계약상태</th>
                  <th>가입금액(만원)</th>
                  <th>보험기간</th>
                  <th>납입기간</th>
                  <th>보험료(원)</th>
                </tr>
              </thead>
              <tbody>
                {report.contracts.map((contract: InsuranceContract, index: number) => (
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
