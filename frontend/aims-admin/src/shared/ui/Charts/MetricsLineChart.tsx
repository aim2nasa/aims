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
}

const formatTime = (timestamp: string) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
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

export const MetricsLineChart = ({ data, showDisk = false, height = 200 }: MetricsLineChartProps) => {
  if (!data || data.length === 0) {
    return (
      <div className="metrics-line-chart metrics-line-chart--empty">
        <p>데이터가 없습니다</p>
      </div>
    );
  }

  return (
    <div className="metrics-line-chart">
      <ResponsiveContainer width="100%" height={typeof height === 'number' ? height : 200}>
        <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatTime}
            tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }}
            stroke="var(--color-border)"
            interval="preserveStartEnd"
            minTickGap={50}
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
            stroke="var(--chart-color-cpu)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="memory"
            name="Memory"
            stroke="var(--chart-color-memory)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          {showDisk && (
            <>
              <Line
                type="monotone"
                dataKey="diskRoot"
                name="Disk (/)"
                stroke="var(--chart-color-disk)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="diskData"
                name="Disk (/data)"
                stroke="var(--chart-color-disk-data)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls={true}
              />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
