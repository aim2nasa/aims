import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/features/dashboard/api';
import { StatCard } from '@/shared/ui/StatCard/StatCard';
import { Button } from '@/shared/ui/Button/Button';
import './DashboardPage.css';

/** 날짜를 YYYY.MM.DD HH:mm 형식으로 포맷 */
const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** overallStatus 한글 라벨 */
const statusLabel = (status: string): { text: string; className: string } => {
  switch (status) {
    case 'completed': return { text: '완료', className: 'status-badge--completed' };
    case 'processing': return { text: '처리중', className: 'status-badge--processing' };
    case 'error': return { text: '오류', className: 'status-badge--error' };
    case 'credit_pending': return { text: '크레딧 대기', className: 'status-badge--pending' };
    default: return { text: status || '알 수 없음', className: 'status-badge--unknown' };
  }
};

/** 숫자에 천 단위 쉼표 */
const formatNumber = (n: number): string => n.toLocaleString('ko-KR');

export const DashboardPage = () => {
  const navigate = useNavigate();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: dashboardApi.getDashboard,
    refetchInterval: 10000,
  });

  const { data: storageData } = useQuery({
    queryKey: ['admin', 'storage', 'overview'],
    queryFn: dashboardApi.getStorageOverview,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return <div className="dashboard-page__loading">데이터를 불러오는 중...</div>;
  }

  if (isError) {
    return (
      <div className="dashboard-page__error">
        <p>데이터를 불러오는데 실패했습니다.</p>
        <p>{error instanceof Error ? error.message : '알 수 없는 오류'}</p>
        <Button onClick={() => refetch()}>다시 시도</Button>
      </div>
    );
  }

  // 알림 계산
  const failedDocs = data?.processing.failedDocuments || 0;
  const storageWarnings = (storageData?.users_over_80_percent || 0) + (storageData?.users_over_95_percent || 0);
  const unhealthyServices = [
    data?.health.nodeApi,
    data?.health.aimsRagApi,
    data?.health.mongodb,
    data?.health.qdrant,
  ].filter((s) => s?.status === 'unhealthy').length;

  const summary = data?.summary;
  const recentUploads = data?.recentUploads || [];
  const recentCustomers = data?.recentCustomers || [];

  return (
    <div className="dashboard-page">
      <h1 className="dashboard-page__title">대시보드</h1>

      {/* 요약 카드 */}
      <section className="dashboard-page__section">
        <h2 className="dashboard-page__section-title">요약</h2>
        <div className="dashboard-page__stats-grid">
          <StatCard
            title="총 고객"
            value={formatNumber(summary?.totalCustomers || data?.stats.totalCustomers || 0)}
          />
          <StatCard
            title="총 문서"
            value={formatNumber(summary?.totalDocuments || data?.stats.totalDocuments || 0)}
          />
          <StatCard
            title="오늘 업로드"
            value={formatNumber(summary?.todayUploads || 0)}
          />
          <StatCard
            title="이번 주 업로드"
            value={formatNumber(summary?.weekUploads || 0)}
          />
          <StatCard
            title="크레딧 잔액"
            value={formatNumber(summary?.creditBalance || 0)}
            subtitle="전체 사용자 합산"
          />
          <StatCard
            title="이번 달 OCR"
            value={data?.ocr?.usedThisMonth || 0}
            subtitle={`누적 ${formatNumber(data?.ocr?.totalProcessed || 0)}건`}
          />
        </div>
      </section>

      {/* 최근 업로드 문서 */}
      {recentUploads.length > 0 && (
        <section className="dashboard-page__section">
          <h2 className="dashboard-page__section-title">최근 업로드 문서</h2>
          <div className="dashboard-page__table-wrap">
            <table className="dashboard-page__table">
              <thead>
                <tr>
                  <th>파일명</th>
                  <th>고객</th>
                  <th>상태</th>
                  <th>업로드 시간</th>
                </tr>
              </thead>
              <tbody>
                {recentUploads.map((doc, i) => {
                  const status = statusLabel(doc.overallStatus);
                  return (
                    <tr key={i}>
                      <td className="dashboard-page__cell-name">{doc.displayName}</td>
                      <td>{doc.customerName}</td>
                      <td>
                        <span className={`status-badge ${status.className}`}>{status.text}</span>
                      </td>
                      <td className="dashboard-page__cell-date">{formatDate(doc.uploadedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 최근 가입 고객 */}
      {recentCustomers.length > 0 && (
        <section className="dashboard-page__section">
          <h2 className="dashboard-page__section-title">최근 가입 고객</h2>
          <div className="dashboard-page__table-wrap">
            <table className="dashboard-page__table">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>유형</th>
                  <th>가입일</th>
                </tr>
              </thead>
              <tbody>
                {recentCustomers.map((cust, i) => (
                  <tr key={i}>
                    <td>{cust.name}</td>
                    <td>{cust.type === 'corporate' ? '법인' : '개인'}</td>
                    <td className="dashboard-page__cell-date">{formatDate(cust.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 주요 알림 */}
      <section className="dashboard-page__section">
        <h2 className="dashboard-page__section-title">주요 알림</h2>
        <div className="dashboard-page__alerts-grid">
          <button
            type="button"
            className={`alert-card ${failedDocs > 0 ? 'alert-card--warning' : 'alert-card--ok'}`}
            onClick={() => navigate('/dashboard/documents')}
          >
            <div className="alert-card__icon">{failedDocs > 0 ? '!' : '✓'}</div>
            <div className="alert-card__content">
              <span className="alert-card__title">문서 처리</span>
              <span className="alert-card__value">
                {failedDocs > 0 ? `처리 실패 ${failedDocs}건` : '정상'}
              </span>
            </div>
            <span className="alert-card__arrow">›</span>
          </button>

          <button
            type="button"
            className={`alert-card ${storageWarnings > 0 ? 'alert-card--warning' : 'alert-card--ok'}`}
            onClick={() => navigate('/dashboard/storage')}
          >
            <div className="alert-card__icon">{storageWarnings > 0 ? '!' : '✓'}</div>
            <div className="alert-card__content">
              <span className="alert-card__title">스토리지</span>
              <span className="alert-card__value">
                {storageWarnings > 0 ? `용량 주의 ${storageWarnings}명` : '정상'}
              </span>
            </div>
            <span className="alert-card__arrow">›</span>
          </button>

          <button
            type="button"
            className={`alert-card ${unhealthyServices > 0 ? 'alert-card--error' : 'alert-card--ok'}`}
            onClick={() => navigate('/dashboard/system')}
          >
            <div className="alert-card__icon">{unhealthyServices > 0 ? '!' : '✓'}</div>
            <div className="alert-card__content">
              <span className="alert-card__title">시스템 상태</span>
              <span className="alert-card__value">
                {unhealthyServices > 0 ? `이상 ${unhealthyServices}건` : '모두 정상'}
              </span>
            </div>
            <span className="alert-card__arrow">›</span>
          </button>
        </div>
      </section>

      {/* 빠른 이동 */}
      <section className="dashboard-page__section">
        <h2 className="dashboard-page__section-title">빠른 이동</h2>
        <div className="dashboard-page__quick-links">
          <button
            type="button"
            className="quick-link-card"
            onClick={() => navigate('/dashboard/ocr-usage')}
          >
            <span className="quick-link-card__title">OCR 사용량</span>
            <span className="quick-link-card__subtitle">처리 현황 및 비용</span>
          </button>
          <button
            type="button"
            className="quick-link-card"
            onClick={() => navigate('/dashboard/ai-usage')}
          >
            <span className="quick-link-card__title">AI 사용량</span>
            <span className="quick-link-card__subtitle">토큰 사용 현황</span>
          </button>
          <button
            type="button"
            className="quick-link-card"
            onClick={() => navigate('/dashboard/documents')}
          >
            <span className="quick-link-card__title">문서 처리</span>
            <span className="quick-link-card__subtitle">OCR/임베딩 대기열</span>
          </button>
          <button
            type="button"
            className="quick-link-card"
            onClick={() => navigate('/dashboard/storage')}
          >
            <span className="quick-link-card__title">스토리지</span>
            <span className="quick-link-card__subtitle">용량 현황 및 관리</span>
          </button>
          <button
            type="button"
            className="quick-link-card"
            onClick={() => navigate('/dashboard/tiers')}
          >
            <span className="quick-link-card__title">티어 관리</span>
            <span className="quick-link-card__subtitle">구독 등급 설정</span>
          </button>
          <button
            type="button"
            className="quick-link-card"
            onClick={() => navigate('/dashboard/system')}
          >
            <span className="quick-link-card__title">시스템 상태</span>
            <span className="quick-link-card__subtitle">서비스 모니터링</span>
          </button>
        </div>
      </section>
    </div>
  );
};
