import React from 'react';
import { SFSymbol, SFSymbolSize, SFSymbolWeight, SFSymbolAnimation } from './SFSymbol';
import { HAPTIC_TYPES } from '../hooks/useHapticFeedback';
import Tooltip from '../shared/ui/Tooltip';
import './HamburgerButton.css';

interface HamburgerButtonProps {
  collapsed: boolean;
  onClick: () => void;
  className?: string;
  'aria-label'?: string;
}

const HamburgerButton: React.FC<HamburgerButtonProps> = ({
  collapsed,
  onClick,
  className = '',
  'aria-label': ariaLabel
}) => {
  // 애플 스타일 햅틱 피드백을 포함한 클릭 핸들러
  const handleClickWithHaptic = () => {
    if (window.aimsHaptic) {
      window.aimsHaptic.triggerHaptic(HAPTIC_TYPES.LIGHT)
    }
    onClick()
  }

  return (
    <Tooltip content={collapsed ? '메뉴 펼치기' : '메뉴 접기'}>
      <button
        className={`hamburger-button apple-interactive haptic-enabled micro-button micro-haptic-light ${className}`.trim()}
        onClick={handleClickWithHaptic}
        aria-label={ariaLabel || (collapsed ? '메뉴 펼치기' : '메뉴 접기')}
      >
        <SFSymbol
          name={collapsed ? "sidebar-left" : "sidebar-leading"}
          size={SFSymbolSize.CALLOUT}
          weight={SFSymbolWeight.MEDIUM}
          animation={SFSymbolAnimation.SCALE}
          className="hamburger-icon"
          interactive={true}
          hapticType="light"
          decorative={true}
        />
      </button>
    </Tooltip>
  );
};

export default HamburgerButton
