/**
 * AIMS UIX-3 Customer Detail - Memo Field
 * @since 2025-12-10
 * @version 2.0.0 - 단일 메모 필드로 단순화
 *
 * 고객 메모 (단일 필드)
 * - customers.memo 필드 직접 수정
 * - 심플한 textarea + 저장 버튼
 */

import React, { useState, useCallback, useEffect } from 'react';
import type { Customer } from '@/entities/customer/model';
import { CustomerService } from '@/services/customerService';
import SFSymbol, {
  SFSymbolSize,
  SFSymbolWeight,
} from '../../../../../components/SFSymbol';
import './MemosTab.css';

interface MemosTabProps {
  customer: Customer;
  onCustomerUpdated?: () => void;
}

export const MemosTab: React.FC<MemosTabProps> = ({
  customer,
  onCustomerUpdated,
}) => {
  const [memo, setMemo] = useState(customer.memo || '');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // 고객 변경 시 메모 초기화
  useEffect(() => {
    setMemo(customer.memo || '');
    setHasChanges(false);
  }, [customer._id, customer.memo]);

  // 변경 감지
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setMemo(newValue);
    setHasChanges(newValue !== (customer.memo || ''));
  }, [customer.memo]);

  // 저장
  const handleSave = useCallback(async () => {
    if (!hasChanges || isSaving) return;

    setIsSaving(true);
    try {
      await CustomerService.updateCustomer(customer._id, { memo });
      setHasChanges(false);
      onCustomerUpdated?.();
      console.log('[MemosTab] 메모 저장 완료');
    } catch (error) {
      console.error('[MemosTab] 메모 저장 실패:', error);
    } finally {
      setIsSaving(false);
    }
  }, [customer._id, memo, hasChanges, isSaving, onCustomerUpdated]);

  // Ctrl+Enter로 저장
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    }
  }, [handleSave]);

  return (
    <div className="memo-field">
      <div className="memo-field__header">
        <div className="memo-field__title">
          <SFSymbol
            name="note.text"
            size={SFSymbolSize.CAPTION_1}
            weight={SFSymbolWeight.REGULAR}
          />
          <span>메모</span>
        </div>
        {hasChanges && (
          <button
            type="button"
            className="memo-field__save"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? '저장 중...' : '저장'}
          </button>
        )}
      </div>
      <textarea
        className="memo-field__textarea"
        placeholder="메모 입력... (Ctrl+Enter로 저장)"
        title="고객 메모"
        value={memo}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={isSaving}
        rows={2}
      />
    </div>
  );
};

export default MemosTab;
