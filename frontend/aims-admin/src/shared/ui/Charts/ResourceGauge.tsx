import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import './Charts.css';

interface ResourceGaugeProps {
  label: string;
  value: number; // 0-100 퍼센트
  total?: string; // 전체 크기 (예: "16 GB")
  used?: string; // 사용량 (예: "10.2 GB")
  color?: 'cpu' | 'memory' | 'disk';
}

export const ResourceGauge = ({
  label,
  value,
  total,
  used,
  color = 'cpu',
}: ResourceGaugeProps) => {
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
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={16}
              outerRadius={23}
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
        </ResponsiveContainer>
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
};
