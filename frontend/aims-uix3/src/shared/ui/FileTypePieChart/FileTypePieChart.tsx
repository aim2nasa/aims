/**
 * FileTypePieChart Component
 * @description 파일 타입별 비율을 보여주는 파이 차트 (SVG 기반)
 * @since 1.0.0
 *
 * 🍎 Apple Design Principles:
 * - Clarity: 명확한 정보 전달
 * - Deference: 서브틀한 표현
 * - Depth: 자연스러운 시각적 계층
 */

import React from 'react'
import './FileTypePieChart.css'

export interface FileTypeData {
  /** 파일 타입 라벨 */
  label: string
  /** 파일 개수 */
  count: number
  /** 차트 색상 (CSS 변수 사용) */
  color: string
  /** 파일 타입 설명 (선택적) */
  description?: string
}

export interface FileTypePieChartProps {
  /** 파일 타입별 데이터 */
  data: FileTypeData[]
  /** 차트 크기 (px) */
  size?: number
  /** 차트 중앙 구멍 반지름 (도넛 차트) */
  innerRadius?: number
}

/**
 * 각도를 라디안으로 변환
 */
const degreesToRadians = (degrees: number): number => {
  return (degrees * Math.PI) / 180
}

/**
 * 파이 차트 조각의 SVG path 생성
 */
const createArcPath = (
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  innerRadius: number = 0
): string => {
  const startRad = degreesToRadians(startAngle - 90)
  const endRad = degreesToRadians(endAngle - 90)

  const x1 = centerX + radius * Math.cos(startRad)
  const y1 = centerY + radius * Math.sin(startRad)
  const x2 = centerX + radius * Math.cos(endRad)
  const y2 = centerY + radius * Math.sin(endRad)

  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0

  if (innerRadius === 0) {
    // 일반 파이 차트
    return `
      M ${centerX} ${centerY}
      L ${x1} ${y1}
      A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}
      Z
    `
  } else {
    // 도넛 차트
    const x3 = centerX + innerRadius * Math.cos(endRad)
    const y3 = centerY + innerRadius * Math.sin(endRad)
    const x4 = centerX + innerRadius * Math.cos(startRad)
    const y4 = centerY + innerRadius * Math.sin(startRad)

    return `
      M ${x1} ${y1}
      A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}
      L ${x3} ${y3}
      A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x4} ${y4}
      Z
    `
  }
}

/**
 * FileTypePieChart React 컴포넌트
 *
 * @example
 * ```tsx
 * <FileTypePieChart
 *   data={[
 *     { label: 'TXT', count: 145, color: 'var(--color-success)' },
 *     { label: 'OCR', count: 82, color: 'var(--color-primary-500)' },
 *     { label: 'BIN', count: 8, color: 'var(--color-neutral-600)' }
 *   ]}
 *   size={200}
 *   innerRadius={50}
 * />
 * ```
 */
export const FileTypePieChart: React.FC<FileTypePieChartProps> = ({
  data,
  size = 200,
  innerRadius = 0
}) => {
  const centerX = size / 2
  const centerY = size / 2
  const radius = size / 2 - 10 // 여백 확보

  // 전체 개수 계산
  const total = data.reduce((sum, item) => sum + item.count, 0)

  // 각 데이터 포인트의 각도 계산
  let currentAngle = 0
  const slices = data.map((item) => {
    const percentage = (item.count / total) * 100
    const angle = (item.count / total) * 360
    const startAngle = currentAngle
    const endAngle = currentAngle + angle

    currentAngle = endAngle

    return {
      ...item,
      percentage,
      startAngle,
      endAngle,
      path: createArcPath(centerX, centerY, radius, startAngle, endAngle, innerRadius)
    }
  })

  return (
    <div className="file-type-pie-chart">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="file-type-pie-chart__svg"
        role="img"
        aria-label="파일 타입별 비율 차트"
      >
        {slices.map((slice, index) => (
          <g key={index} className="file-type-pie-chart__slice">
            <path
              d={slice.path}
              fill={slice.color}
              className="file-type-pie-chart__path"
              data-label={slice.label}
            />
            <title>
              {slice.label}: {slice.count}개 ({slice.percentage.toFixed(1)}%)
            </title>
          </g>
        ))}

        {/* 중앙 텍스트 (도넛 차트일 경우) */}
        {innerRadius > 0 && (
          <text
            x={centerX}
            y={centerY}
            textAnchor="middle"
            dominantBaseline="middle"
            className="file-type-pie-chart__center-text"
          >
            <tspan x={centerX} dy="-0.3em" className="file-type-pie-chart__total-label">
              전체
            </tspan>
            <tspan x={centerX} dy="1.2em" className="file-type-pie-chart__total-count">
              {total}
            </tspan>
          </text>
        )}
      </svg>

      {/* 레전드 */}
      <div className="file-type-pie-chart__legend">
        {slices.map((slice, index) => (
          <div key={index} className="file-type-pie-chart__legend-item">
            <div className="file-type-pie-chart__legend-item-header">
              <div
                className="file-type-pie-chart__legend-color"
                style={{ backgroundColor: slice.color }}
              />
              <span className="file-type-pie-chart__legend-label">{slice.label}</span>
              <span className="file-type-pie-chart__legend-value">
                {slice.count} ({slice.percentage.toFixed(2)}%)
              </span>
            </div>
            {slice.description && (
              <div className="file-type-pie-chart__legend-description">
                {slice.description}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default FileTypePieChart
