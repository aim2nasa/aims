export interface GapConfig {
  // 명확한 갭 정의 (gapDef.png 기준)
  gapLeft: number;        // G1: 왼쪽 패널과 중앙 패널 사이 간격
  gapCenter: number;      // G2: 중앙 패널과 우측 패널 사이 간격
  gapRight: number;       // G3: 우측 패널과 가장자리 사이 간격
  gapTop: number;         // 상단 헤더 아래 여백
  gapBottom: number;      // G4: 하단 페이지네이션 위 여백
}

export interface LayoutProps {
  gaps?: Partial<GapConfig>;
  // 다른 레이아웃 props...
}

// 기본 갭 설정
export const DEFAULT_GAPS: GapConfig = {
  gapLeft: 8,      // G1: 왼쪽-중앙 간격
  gapCenter: 4,    // G2: 중앙-우측 간격 (4px+4px=8px 실제 간격)
  gapRight: 8,     // G3: 우측-가장자리 간격
  gapTop: 8,       // 상단 여백
  gapBottom: 8     // G4: 하단 여백
};