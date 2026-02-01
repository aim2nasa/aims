import { memo } from 'react';
import { PieChart, Pie, Cell } from 'recharts';
import './Charts.css';

interface ResourceGaugeProps {
  label: string;
  value: number; // 0-100 퍼센트
  total?: string; // 전체 크기 (예: "16 GB")
  used?: string; // 사용량 (예: "10.2 GB")
  color?: 'cpu' | 'memory' | 'disk' | 'disk-data';
}

export const ResourceGauge = memo(function ResourceGauge({
  label,
  value,
  total,
  used,
  color = 'cpu',
}: ResourceGaugeProps) {
  const data = [
    { name: 'used', value: value },
    { name: 'free', value: 100 - value },
  ];

  // 사용률에 따른 색상 결정
  const getColor = () => {
    if (value >= 90) return 'var(--color-error)';
    if (value >= 75) return 'var(--color-warning)';
    return `var(--chart-color-${color})`;
  };

  const usedColor = getColor();
  const freeColor = 'var(--color-border)';

  return (
    <div className="resource-gauge">
      <div className="resource-gauge__chart">
        <PieChart width={40} height={40}>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={12}
            outerRadius={18}
            startAngle={90}
            endAngle={-270}
            paddingAngle={0}
            dataKey="value"
            stroke="none"
          >
            <Cell fill={usedColor} />
            <Cell fill={freeColor} />
          </Pie>
        </PieChart>
        <div className="resource-gauge__center">
          <span className="resource-gauge__value">{value.toFixed(0)}%</span>
        </div>
      </div>
      <div className="resource-gauge__info">
        <span className="resource-gauge__label">{label}</span>
        {(total || used) && (
          <span className="resource-gauge__detail">
            {used && <span className="resource-gauge__used">{used}</span>}
            {total && <span className="resource-gauge__total"> / {total}</span>}
          </span>
        )}
      </div>
    </div>
  );
}, (prev, next) => {
  // 반올림 비교: 45.2→45.3은 둘 다 "45%"이므로 PieChart 재구성 불필요
  return prev.label === next.label
    && Math.round(prev.value) === Math.round(next.value)
    && prev.total === next.total
    && prev.used === next.used
    && prev.color === next.color;
});
