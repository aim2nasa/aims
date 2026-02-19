import './SortIndicator.css';

interface SortIndicatorProps {
  field: string;
  currentSortField?: string | null;
  sortDirection?: 'asc' | 'desc';
}

/**
 * 테이블 칼럼 정렬 표시 컴포넌트 (공유)
 *
 * - 현재 정렬된 칼럼에만 빨간색 화살표(▲/▼) 표시
 * - 정렬되지 않은 칼럼에는 아무것도 표시하지 않음
 */
export function SortIndicator({ field, currentSortField, sortDirection }: SortIndicatorProps) {
  if (currentSortField !== field) return null;
  return (
    <span className="sort-indicator sort-indicator--active">
      {sortDirection === 'asc' ? '▲' : '▼'}
    </span>
  );
}
