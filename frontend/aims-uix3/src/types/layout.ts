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

// 기본 갭 설정 - 모든 값을 2px로 통일 (def.png 기준)
export const DEFAULT_GAPS: GapConfig = {
  gapLeft: 2,      // G1: 왼쪽-중앙 간격
  gapCenter: 2,    // G2: 중앙-우측 간격
  gapRight: 2,     // G3: 우측-가장자리 간격
  gapTop: 2,       // 상단 여백
  gapBottom: 2     // G4: 하단 여백
};