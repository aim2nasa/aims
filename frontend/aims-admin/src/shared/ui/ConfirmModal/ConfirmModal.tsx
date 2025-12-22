import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../Button/Button';
import './ConfirmModal.css';

export type ConfirmModalVariant = 'info' | 'warning' | 'danger';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmModalVariant;
  /** 확인 입력이 필요한 경우 (예: "삭제" 입력) */
  confirmInput?: string;
  /** 로딩 상태 */
  isLoading?: boolean;
}

const VARIANT_ICONS: Record<ConfirmModalVariant, string> = {
  info: '💬',
  warning: '⚠️',
  danger: '🗑️',
};

export const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = '확인',
  cancelText = '취소',
  variant = 'info',
  confirmInput,
  isLoading = false,
}: ConfirmModalProps) => {
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
      setInputValue('');
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose, isLoading]);

  if (!isOpen) return null;

  const canConfirm = !confirmInput || inputValue === confirmInput;

  const handleConfirm = () => {
    if (canConfirm && !isLoading) {
      onConfirm();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canConfirm && !isLoading) {
      onConfirm();
    }
  };

  return createPortal(
    <div className="confirm-modal-backdrop" onClick={isLoading ? undefined : onClose}>
      <div
        className={`confirm-modal confirm-modal--${variant}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="confirm-modal__icon">
          {VARIANT_ICONS[variant]}
        </div>
        <div className="confirm-modal__content">
          <h3 className="confirm-modal__title">{title}</h3>
          <div className="confirm-modal__message">{message}</div>

          {confirmInput && (
            <div className="confirm-modal__input-section">
              <p className="confirm-modal__input-hint">
                계속하려면 <strong>"{confirmInput}"</strong>을(를) 입력하세요.
              </p>
              <input
                type="text"
                className="confirm-modal__input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={confirmInput}
                autoFocus
                disabled={isLoading}
              />
            </div>
          )}
        </div>

        <div className="confirm-modal__actions">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            variant={variant === 'danger' ? 'destructive' : 'primary'}
            onClick={handleConfirm}
            disabled={!canConfirm || isLoading}
          >
            {isLoading ? '처리 중...' : confirmText}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
};
