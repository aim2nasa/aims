import './StatCard.css';

interface StatCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  onClick?: () => void;
}

export const StatCard = ({ title, value, subtitle, trend, onClick }: StatCardProps) => {
  const className = `stat-card${onClick ? ' stat-card--clickable' : ''}`;

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        <div className="stat-card__header">
          <span className="stat-card__title">{title}</span>
          {trend && (
            <span
              className={`stat-card__trend ${
                trend.isPositive ? 'stat-card__trend--positive' : 'stat-card__trend--negative'
              }`}
            >
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </span>
          )}
        </div>
        <div className="stat-card__value">{value}</div>
        {subtitle && <div className="stat-card__subtitle">{subtitle}</div>}
      </button>
    );
  }

  return (
    <div className={className}>
      <div className="stat-card__header">
        <span className="stat-card__title">{title}</span>
        {trend && (
          <span
            className={`stat-card__trend ${
              trend.isPositive ? 'stat-card__trend--positive' : 'stat-card__trend--negative'
            }`}
          >
            {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
          </span>
        )}
      </div>
      <div className="stat-card__value">{value}</div>
      {subtitle && <div className="stat-card__subtitle">{subtitle}</div>}
    </div>
  );
};
