/**
 * HorizontalBarChart Component
 * @since 2025-11-16
 *
 * 가로 막대 차트 컴포넌트
 * 여러 카테고리를 가로 막대로 표시
 */

import React from 'react';
import './HorizontalBarChart.css';

export interface BarChartDataItem {
  label: string;
  count: number;
  color: string;
  description?: string;
}

export interface BarChartCategory {
  title: string;
  data: BarChartDataItem[];
}

export interface HorizontalBarChartProps {
  categories: BarChartCategory[];
  title?: string;
}

export const HorizontalBarChart: React.FC<HorizontalBarChartProps> = ({
  categories,
  title
}) => {
  return (
    <div className="horizontal-bar-chart">
      {title && <h3 className="horizontal-bar-chart__title">{title}</h3>}
      <div className="horizontal-bar-chart__categories">
        {categories.map((category, categoryIndex) => {
          const total = category.data.reduce((sum, item) => sum + item.count, 0);

          return (
            <div key={categoryIndex} className="horizontal-bar-chart__category">
              <h4 className="horizontal-bar-chart__category-title">{category.title}</h4>
              <div className="horizontal-bar-chart__bars">
                {category.data.map((item, itemIndex) => {
                  const percentage = total > 0 ? (item.count / total) * 100 : 0;

                  return (
                    <div key={itemIndex} className="horizontal-bar-chart__bar-item">
                      <div className="horizontal-bar-chart__bar-container">
                        <div
                          className="horizontal-bar-chart__bar-fill"
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: item.color
                          }}
                          title={item.description || `${item.label}: ${item.count}`}
                        />
                      </div>
                      <div className="horizontal-bar-chart__bar-label">
                        <span className="horizontal-bar-chart__label-text">{item.label}</span>
                        <span className="horizontal-bar-chart__label-count">
                          {item.count} ({percentage.toFixed(2)}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

