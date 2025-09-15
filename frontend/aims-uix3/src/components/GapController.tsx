import { useState } from 'react';
import { GapConfig } from '../types/layout';

interface GapControllerProps {
  onGapsChange: (gaps: Partial<GapConfig>) => void;
  initialGaps?: Partial<GapConfig>;
}

/**
 * 갭 파라미터를 실시간으로 조정할 수 있는 컨트롤러
 */
export const GapController = ({ onGapsChange, initialGaps }: GapControllerProps) => {
  const [gaps, setGaps] = useState<Partial<GapConfig>>(initialGaps || {});
  const [isVisible, setIsVisible] = useState(true);

  const handleGapChange = (key: keyof GapConfig, value: number) => {
    const newGaps = { ...gaps, [key]: value };
    setGaps(newGaps);
    onGapsChange(newGaps);
  };

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        style={{
          backgroundColor: '#374151',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          padding: '6px 12px',
          cursor: 'pointer',
          fontSize: '12px',
          marginLeft: '15px'
        }}
      >
        Gap
      </button>
    );
  }

  return (
    <div style={{
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      padding: '15px',
      borderRadius: '8px',
      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
      minWidth: '220px',
      fontSize: '12px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h4 style={{ margin: 0, color: '#1a1a1a' }}>Gap</h4>
        <button
          onClick={() => setIsVisible(false)}
          style={{
            backgroundColor: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '4px 8px',
            cursor: 'pointer',
            fontSize: '11px'
          }}
        >
          닫기
        </button>
      </div>

      <div style={{ marginBottom: '8px' }}>
        <label style={{ display: 'block', marginBottom: '4px', color: '#374151' }}>
          gapLeft: {gaps.gapLeft || 4}px
        </label>
        <input
          type="range"
          min="0"
          max="20"
          value={gaps.gapLeft || 4}
          onChange={(e) => handleGapChange('gapLeft', Number(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ marginBottom: '8px' }}>
        <label style={{ display: 'block', marginBottom: '4px', color: '#374151' }}>
          gapCenter: {gaps.gapCenter || 4}px
        </label>
        <input
          type="range"
          min="0"
          max="20"
          value={gaps.gapCenter || 4}
          onChange={(e) => handleGapChange('gapCenter', Number(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ marginBottom: '8px' }}>
        <label style={{ display: 'block', marginBottom: '4px', color: '#374151' }}>
          gapRight: {gaps.gapRight || 8}px
        </label>
        <input
          type="range"
          min="0"
          max="20"
          value={gaps.gapRight || 8}
          onChange={(e) => handleGapChange('gapRight', Number(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ marginBottom: '8px' }}>
        <label style={{ display: 'block', marginBottom: '4px', color: '#374151' }}>
          gapTop: {gaps.gapTop || 8}px
        </label>
        <input
          type="range"
          min="0"
          max="20"
          value={gaps.gapTop || 8}
          onChange={(e) => handleGapChange('gapTop', Number(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ marginBottom: '8px' }}>
        <label style={{ display: 'block', marginBottom: '4px', color: '#374151' }}>
          gapBottom: {gaps.gapBottom || 8}px
        </label>
        <input
          type="range"
          min="0"
          max="20"
          value={gaps.gapBottom || 8}
          onChange={(e) => handleGapChange('gapBottom', Number(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>
    </div>
  );
};