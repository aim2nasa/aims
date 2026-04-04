/**
 * AIUsageChart Component
 * @since 2025-12-13
 *
 * AI 토큰 사용량 일별 차트 컴포넌트
 * 간단한 막대 그래프로 일별 사용량 표시
 */

import React from 'react';
import { DailyUsagePoint, formatTokens, formatCost } from '@/services/aiUsageService';
import './AIUsageChart.css';

export interface AIUsageChartProps {
  data: DailyUsagePoint[];
  title?: string;
  height?: number;
}

export const AIUsageChart: React.FC<AIUsageChartProps> = ({
  data,
  title = 'AI 사용량 추이',
  height = 200
}) => {
  if (!data || data.length === 0) {
    return (
      <div className="ai-usage-chart ai-usage-chart--empty">
        <p className="ai-usage-chart__empty-text">사용 데이터가 없습니다</p>
      </div>
    );
  }

  // 최대 토큰 수 계산 (차트 스케일링용)
  const maxTokens = Math.max(...data.map(d => d.total_tokens), 1);

  // 날짜 포맷팅 (MM.DD)
  const formatDate = (dateStr: string): string => {
    const parts = dateStr.split('-');
    if (parts.length >= 3) {
      return `${parts[1]}.${parts[2]}`;
    }
    return dateStr;
  };

  return (
    <div className="ai-usage-chart">
      {title && <h4 className="ai-usage-chart__title">{title}</h4>}
      <div className="ai-usage-chart__container" style={{ height: `${height}px` }}>
        <div className="ai-usage-chart__bars">
          {data.map((point, index) => {
            const barHeight = (point.total_tokens / maxTokens) * 100;
            return (
              <div key={index} className="ai-usage-chart__bar-wrapper">
                <div
                  className="ai-usage-chart__bar"
                  style={{ height: `${barHeight}%` }}
                  title={`${point.date}\n토큰: ${formatTokens(point.total_tokens)}\n비용: ${formatCost(point.estimated_cost_usd)}\n요청: ${point.request_count}회`}
                >
                  <span className="ai-usage-chart__bar-value">
                    {formatTokens(point.total_tokens)}
                  </span>
                </div>
                <span className="ai-usage-chart__bar-label">
                  {formatDate(point.date)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

