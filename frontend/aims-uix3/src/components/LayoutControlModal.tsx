import React, { useState, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import { useDraggable } from '../hooks/useDraggable';
import { HapticService, HapticType, withHaptic } from '../services/hapticService';
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from './SFSymbol';

interface LayoutControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Layout visibility states
  headerVisible: boolean;
  leftPaneVisible: boolean;
  centerPaneVisible: boolean;
  rightPaneVisible: boolean;
  brbVisible: boolean;
  paginationVisible: boolean;
  mainPaneVisible: boolean;
  // Layout visibility toggles
  toggleHeader: () => void;
  toggleLeftPane: () => void;
  toggleCenterPane: () => void;
  toggleRightPane: () => void;
  toggleBrb: () => void;
  togglePagination: () => void;
  toggleMainPane: () => void;
  // Gap controller
  resetGaps: () => void;
  // Gap values
  gapValues: {
    gapLeft: number;
    gapCenter: number;
    gapRight: number;
    gapTop: number;
    gapBottom: number;
  };
  // Gap handlers
  handleGapLeftChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleGapCenterChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleGapRightChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleGapTopChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleGapBottomChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const LayoutControlModal: React.FC<LayoutControlModalProps> = ({
  isOpen,
  onClose,
  headerVisible,
  leftPaneVisible,
  centerPaneVisible,
  rightPaneVisible,
  brbVisible,
  paginationVisible,
  mainPaneVisible,
  toggleHeader,
  toggleLeftPane,
  toggleCenterPane,
  toggleRightPane,
  toggleBrb,
  togglePagination,
  toggleMainPane,
  resetGaps,
  gapValues,
  handleGapLeftChange,
  handleGapCenterChange,
  handleGapRightChange,
  handleGapTopChange,
  handleGapBottomChange,
}) => {
  // 내부 상태 관리: 외부 props 변경에도 안정적 동작
  const [internalOpen, setInternalOpen] = useState(isOpen)
  const [isClosing, setIsClosing] = useState(false)

  // 드래그 시작 시 햅틱 피드백 추가
  const handleDragStart = () => {
    HapticService.trigger(HapticType.LIGHT)
  }

  const { position, isDragging, dragHandlers } = useDraggable({
    constrainToViewport: false, // 자유로운 이동 허용
    minVisibleArea: 60, // 헤더 영역은 항상 보이도록
    onDragStart: handleDragStart // 드래그 시작 시 햅틱 피드백
  })

  // 외부 isOpen prop 변경 감지 및 내부 상태 동기화
  useEffect(() => {
    if (isOpen && !internalOpen) {
      // 모달 열기: 즉시 반영 + 모달 오픈 햅틱
      HapticService.trigger(HapticType.MEDIUM)
      setInternalOpen(true)
      setIsClosing(false)
    } else if (!isOpen && internalOpen) {
      // 모달 닫기: 즉시 처리 (애니메이션 지연 제거)
      setIsClosing(true)
      setInternalOpen(false)
      setIsClosing(false)
    }
  }, [isOpen, internalOpen])


  // 내부적으로 닫힌 상태라면 렌더링하지 않음
  if (!internalOpen) return null

  // 즉시 닫기 핸들러 - 애니메이션 지연 없이 즉시 처리
  const handleSafeClose = () => {
    // 모달 닫기 햅틱 피드백
    HapticService.trigger(HapticType.LIGHT)

    // 즉시 닫기 상태로 변경
    setIsClosing(true)
    setInternalOpen(false)

    // 외부 상태도 즉시 업데이트
    onClose()
  }

  // 체크박스 토글 시 햅틱 피드백 추가
  const withCheckboxHaptic = (handler: () => void) => withHaptic(HapticType.SELECTION, handler)

  // 리셋 버튼에 햅틱 피드백 추가
  const handleResetWithHaptic = withHaptic(HapticType.HEAVY, resetGaps)

  // ESC 키로 모달 닫기 (iOS 접근성 가이드라인)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleSafeClose()
    }
  }

  // Portal을 사용하여 모달을 document.body에 직접 렌더링
  // App 컴포넌트의 리마운트 영향을 완전히 차단
  return createPortal(
    <div
      className={`floating-modal ${isDragging ? 'floating-modal--dragging' : ''} ${!isClosing ? 'floating-modal--entering' : 'floating-modal--exiting'}`}
      style={{
        // ⚠️ 예외: 동적 드래그 위치는 런타임 계산 필수 - CSS로 불가능
        transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px)) scale(${isDragging ? '1.03' : '1'})`,
        left: `calc(50% + ${position.x}px)`,
        top: `calc(50% + ${position.y}px)`,
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <div
        className="modal-header modal-header--draggable"
        {...dragHandlers}
      >
        <h2 id="modal-title" className="modal-title">레이아웃 제어</h2>
        <button className="modal-close-button haptic-enabled" onClick={handleSafeClose}>
          <SFSymbol
            name="xmark"
            size={SFSymbolSize.CALLOUT}
            weight={SFSymbolWeight.MEDIUM}
          />
        </button>
      </div>

      <div className="modal-body">
        {/* 레이아웃 컴포넌트 표시/숨김 제어 */}
        <div className="modal-control-section">
          <h3 className="modal-section-title">레이아웃 컴포넌트</h3>
          <div className="checkbox-grid">
            <label className="checkbox-label haptic-enabled">
              <input type="checkbox" checked={headerVisible} onChange={withCheckboxHaptic(toggleHeader)} />
              <span>Header</span>
            </label>
            <label className="checkbox-label haptic-enabled">
              <input type="checkbox" checked={leftPaneVisible} onChange={withCheckboxHaptic(toggleLeftPane)} />
              <span>LeftPane</span>
            </label>
            <label className="checkbox-label haptic-enabled">
              <input type="checkbox" checked={centerPaneVisible} onChange={withCheckboxHaptic(toggleCenterPane)} />
              <span>CenterPane</span>
            </label>
            <label className="checkbox-label haptic-enabled">
              <input type="checkbox" checked={rightPaneVisible} onChange={withCheckboxHaptic(toggleRightPane)} />
              <span>RightPane</span>
            </label>
            <label className="checkbox-label haptic-enabled">
              <input type="checkbox" checked={brbVisible} onChange={withCheckboxHaptic(toggleBrb)} />
              <span>BRB</span>
            </label>
            <label className="checkbox-label haptic-enabled">
              <input type="checkbox" checked={paginationVisible} onChange={withCheckboxHaptic(togglePagination)} />
              <span>Pagination</span>
            </label>
            <label className="checkbox-label haptic-enabled">
              <input type="checkbox" checked={mainPaneVisible} onChange={withCheckboxHaptic(toggleMainPane)} />
              <span>MainPane</span>
            </label>
          </div>
        </div>

        {/* Gap 설정 제어 */}
        <div className="modal-control-section modal-control-section--with-divider">
          <div className="gap-section-header">
            <h3 className="modal-section-title">Gap 설정</h3>
            <div className="gap-controls">
              <button onClick={handleResetWithHaptic} className="reset-button haptic-enabled">
                디폴트
              </button>
            </div>
          </div>

          {/* Gap 슬라이더들 - 항상 표시 */}
          <div className="gap-sliders">
            <div className="range-input-group">
              <label className="range-label">
                gapLeft: {gapValues.gapLeft}px
              </label>
              <input
                type="range"
                min="0"
                max="20"
                value={gapValues.gapLeft}
                onChange={handleGapLeftChange}
                className="range-input"
              />
            </div>

            <div className="range-input-group">
              <label className="range-label">
                gapCenter: {gapValues.gapCenter}px
              </label>
              <input
                type="range"
                min="0"
                max="20"
                value={gapValues.gapCenter}
                onChange={handleGapCenterChange}
                className="range-input"
              />
            </div>

            <div className="range-input-group">
              <label className="range-label">
                gapRight: {gapValues.gapRight}px
              </label>
              <input
                type="range"
                min="0"
                max="20"
                value={gapValues.gapRight}
                onChange={handleGapRightChange}
                className="range-input"
              />
            </div>

            <div className="range-input-group">
              <label className="range-label">
                gapTop: {gapValues.gapTop}px
              </label>
              <input
                type="range"
                min="0"
                max="20"
                value={gapValues.gapTop}
                onChange={handleGapTopChange}
                className="range-input"
              />
            </div>

            <div className="range-input-group">
              <label className="range-label">
                gapBottom: {gapValues.gapBottom}px
              </label>
              <input
                type="range"
                min="0"
                max="20"
                value={gapValues.gapBottom}
                onChange={handleGapBottomChange}
                className="range-input"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="modal-footer">
        <button className="button-secondary" onClick={handleSafeClose}>
          닫기
        </button>
      </div>
    </div>,
    document.body // Portal 타겟: document.body에 직접 렌더링
  );
};

export default memo(LayoutControlModal);