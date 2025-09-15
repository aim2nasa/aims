import React from 'react';

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
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">레이아웃 제어</h2>
          <button className="modal-close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {/* 레이아웃 컴포넌트 표시/숨김 제어 */}
          <div className="modal-control-section">
            <h3 className="modal-section-title">레이아웃 컴포넌트</h3>
            <div className="checkbox-grid">
              <label className="checkbox-label">
                <input type="checkbox" checked={headerVisible} onChange={toggleHeader} />
                <span>Header</span>
              </label>
              <label className="checkbox-label">
                <input type="checkbox" checked={leftPaneVisible} onChange={toggleLeftPane} />
                <span>LeftPane</span>
              </label>
              <label className="checkbox-label">
                <input type="checkbox" checked={centerPaneVisible} onChange={toggleCenterPane} />
                <span>CenterPane</span>
              </label>
              <label className="checkbox-label">
                <input type="checkbox" checked={rightPaneVisible} onChange={toggleRightPane} />
                <span>RightPane</span>
              </label>
              <label className="checkbox-label">
                <input type="checkbox" checked={brbVisible} onChange={toggleBrb} />
                <span>BRB</span>
              </label>
              <label className="checkbox-label">
                <input type="checkbox" checked={paginationVisible} onChange={togglePagination} />
                <span>Pagination</span>
              </label>
              <label className="checkbox-label">
                <input type="checkbox" checked={mainPaneVisible} onChange={toggleMainPane} />
                <span>MainPane</span>
              </label>
            </div>
          </div>

          {/* Gap 설정 제어 */}
          <div className="modal-control-section">
            <div className="gap-section-header">
              <h3 className="modal-section-title">Gap 설정</h3>
              <div className="gap-controls">
                <button onClick={resetGaps} className="reset-button">
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
          <button className="button-secondary" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>

    </div>
  );
};

export default LayoutControlModal;