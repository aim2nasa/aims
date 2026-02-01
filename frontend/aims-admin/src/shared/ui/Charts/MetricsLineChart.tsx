import { memo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import './Charts.css';

interface MetricsDataPoint {
  timestamp: string;
  cpu: number;
  memory: number;
  disk?: number;
  diskRoot?: number;
  diskData?: number | null;  // null when data is missing (old format records)
}

interface MetricsLineChartProps {
  data: MetricsDataPoint[];
  showDisk?: boolean;
  height?: number | string;
  timeRangeHours?: number;
}

const formatTime = (timestamp: string, timeRangeHours: number = 24) => {
  const date = new Date(timestamp);

  // 24시간 이하: 시간만 표시
  if (timeRangeHours <= 24) {
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  // 24시간 초과: 날짜 + 시간 표시
  return date.toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).replace('. ', '/').replace('. ', ' ');
};

const formatTooltipTime = (timestamp: string) => {
  const date = new Date(timestamp);
  return date.toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload || !label) return null;

  return (
    <div className="metrics-tooltip">
      <p className="metrics-tooltip__time">{formatTooltipTime(label)}</p>
      {payload.map((entry, index) => (
        <p key={index} className="metrics-tooltip__item" style={{ color: entry.color }}>
          {entry.name}: {entry.value.toFixed(1)}%
        </p>
      ))}
    </div>
  );
};

export const MetricsLineChart = memo(function MetricsLineChart({ data, showDisk = false, height = 200, timeRangeHours = 24 }: MetricsLineChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="metrics-line-chart metrics-line-chart--empty">
        <p>데이터가 없습니다</p>
      </div>
    );
  }

  // height가 문자열("100%")이면 숫자로 변환 (ResponsiveContainer는 숫자 필요)
  const chartHeight = typeof height === 'number' ? height : 200;

  return (
    <div className="metrics-line-chart">
      <ResponsiveContainer width="100%" height={chartHeight}>
        <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(ts) => formatTime(ts, timeRangeHours)}
            tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }}
            stroke="var(--color-border)"
            interval="preserveStartEnd"
            minTickGap={timeRangeHours > 24 ? 80 : 50}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }}
            stroke="var(--color-border)"
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: '11px' }}
            iconType="plainline"
          />
          <Line
            type="monotone"
            dataKey="cpu"
            name="CPU"
            stroke="#007AFF"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="memory"
            name="Memory"
            stroke="#34C759"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          {showDisk && [
            <Line
              key="diskRoot"
              type="monotone"
              dataKey="diskRoot"
              name="Disk (/)"
              stroke="#FF9500"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />,
            <Line
              key="diskData"
              type="monotone"
              dataKey="diskData"
              name="Disk (/data)"
              stroke="#AF52DE"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls={true}
            />
          ]}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});
