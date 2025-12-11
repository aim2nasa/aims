import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/features/dashboard/api';
import { StatCard } from '@/shared/ui/StatCard/StatCard';
import { Button } from '@/shared/ui/Button/Button';
import './DocumentProcessingPage.css';

export const DocumentProcessingPage = () => {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: dashboardApi.getDashboard,
    refetchInterval: 10000,
  });

  if (isLoading) {
    return <div className="document-processing-page__loading">데이터를 불러오는 중...</div>;
  }

  if (isError) {
    return (
      <div className="document-processing-page__error">
        <p>데이터를 불러오는데 실패했습니다.</p>
        <p>{error instanceof Error ? error.message : '알 수 없는 오류'}</p>
        <Button onClick={() => refetch()}>다시 시도</Button>
      </div>
    );
  }

  const processing = data?.processing;

  return (
    <div className="document-processing-page">
      <h1 className="document-processing-page__title">문서 처리 현황</h1>

      <section className="document-processing-page__section">
        <h2 className="document-processing-page__section-title">처리 대기열</h2>
        <div className="document-processing-page__stats-grid">
          <StatCard
            title="OCR 대기"
            value={processing?.ocrQueue || 0}
            subtitle="처리 대기중인 문서"
          />
          <StatCard
            title="임베딩 대기"
            value={processing?.embedQueue || 0}
            subtitle="벡터화 대기중인 문서"
          />
          <StatCard
            title="처리 실패"
            value={processing?.failedDocuments || 0}
            subtitle="재처리 필요"
          />
        </div>
      </section>

      <section className="document-processing-page__section">
        <h2 className="document-processing-page__section-title">처리 상태 설명</h2>
        <div className="document-processing-page__info-cards">
          <div className="info-card">
            <h3 className="info-card__title">OCR 대기</h3>
            <p className="info-card__description">
              문서가 업로드되어 텍스트 추출(OCR)을 기다리는 상태입니다.
              일반적으로 수 분 내에 처리됩니다.
            </p>
          </div>
          <div className="info-card">
            <h3 className="info-card__title">임베딩 대기</h3>
            <p className="info-card__description">
              OCR 완료 후 벡터 임베딩 생성을 기다리는 상태입니다.
              이 단계를 거쳐야 AI 검색이 가능합니다.
            </p>
          </div>
          <div className="info-card info-card--warning">
            <h3 className="info-card__title">처리 실패</h3>
            <p className="info-card__description">
              처리 중 오류가 발생한 문서입니다.
              시스템 관리자의 확인이 필요할 수 있습니다.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
