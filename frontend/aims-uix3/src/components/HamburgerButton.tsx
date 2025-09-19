import React, { memo } from 'react';
import { SFSymbol, SFSymbolSize, SFSymbolWeight, SFSymbolAnimation } from './SFSymbol';
import { HapticType, withHaptic } from '../services/hapticService';
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
  const handleClickWithHaptic = withHaptic(HapticType.LIGHT, onClick)

  return (
    <button
      className={`hamburger-button apple-interactive haptic-enabled ${className}`.trim()}
      onClick={handleClickWithHaptic}
      aria-label={ariaLabel || (collapsed ? '메뉴 펼치기' : '메뉴 접기')}
      title={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
    >
      <SFSymbol
        name={collapsed ? "sidebar-left" : "sidebar-leading"}
        size={SFSymbolSize.CALLOUT}
        weight={SFSymbolWeight.MEDIUM}
        animation={SFSymbolAnimation.SCALE}
        className="hamburger-icon"
        interactive={true}
        hapticType={HapticType.LIGHT}
      />
    </button>
  );
};

export default memo(HamburgerButton);