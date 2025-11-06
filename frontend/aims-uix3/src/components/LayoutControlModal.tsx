import React, { useEffect, memo } from 'react';
import DraggableModal from '@/shared/ui/DraggableModal';
import { HapticService, HapticType, withHaptic } from '../services/hapticService';
import Button from '@/shared/ui/Button';

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
  // 모달 열기 시 햅틱 피드백
  useEffect(() => {
    if (isOpen) {
      HapticService.trigger(HapticType.MEDIUM)
    }
  }, [isOpen])

  // 모달 닫기 핸들러 with 햅틱
  const handleClose = () => {
    HapticService.trigger(HapticType.LIGHT)
    onClose()
  }

  // 체크박스 토글 시 햅틱 피드백 추가
  const withCheckboxHaptic = (handler: () => void) => withHaptic(HapticType.SELECTION, handler)

  // 리셋 버튼에 햅틱 피드백 추가
  const handleResetWithHaptic = withHaptic(HapticType.HEAVY, resetGaps)

  return (
    <DraggableModal
      visible={isOpen}
      onClose={handleClose}
      title="레이아웃 제어"
      initialWidth={500}
      initialHeight={600}
      minWidth={400}
      minHeight={500}
      className="floating-modal"
    >
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
              <Button onClick={handleResetWithHaptic} variant="secondary" size="sm">
                디폴트
              </Button>
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
        <Button variant="secondary" onClick={handleClose}>
          닫기
        </Button>
      </div>
    </DraggableModal>
  );
};

export default memo(LayoutControlModal);