import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/features/dashboard/api';
import { StatCard } from '@/shared/ui/StatCard/StatCard';
import { Button } from '@/shared/ui/Button/Button';
import { OCRFailedModal } from '@/pages/OCRUsagePage/OCRFailedModal';
import { EmbedFailedModal } from './EmbedFailedModal';
import './DocumentProcessingPage.css';

type ModalType = 'ocr' | 'embed' | 'overall' | null;

export const DocumentProcessingPage = () => {
  const [openModal, setOpenModal] = useState<ModalType>(null);

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

  const docs = data?.documents;
  const stats = data?.stats;

  const handleErrorClick = (type: ModalType, count: number) => {
    if (count > 0) {
      setOpenModal(type);
    }
  };

  return (
    <div className="document-processing-page">
      <h1 className="document-processing-page__title">문서 처리 현황</h1>

      {/* 전체 문서 현황 */}
      <section className="document-processing-page__section">
        <h2 className="document-processing-page__section-title">전체 문서 현황</h2>
        <div className="document-processing-page__stats-grid">
          <StatCard
            title="전체 문서"
            value={stats?.totalDocuments || 0}
            subtitle="등록된 문서"
          />
          <StatCard
            title="OCR 대상"
            value={docs?.ocr?.target || 0}
            subtitle="텍스트 추출 필요"
          />
          <StatCard
            title="OCR 비대상"
            value={docs?.ocr?.nonTarget || 0}
            subtitle="OCR 불필요 문서"
          />
        </div>
      </section>

      {/* 전체 처리 상태 */}
      <section className="document-processing-page__section">
        <h2 className="document-processing-page__section-title">전체 처리 상태</h2>
        <div className="document-processing-page__status-grid">
          <div className="status-card status-card--completed">
            <span className="status-card__label">완료</span>
            <span className="status-card__value">{docs?.overall?.completed || 0}</span>
          </div>
          <div className="status-card status-card--processing">
            <span className="status-card__label">처리 중</span>
            <span className="status-card__value">{docs?.overall?.processing || 0}</span>
          </div>
          <div
            className={`status-card status-card--error ${(docs?.overall?.error || 0) > 0 ? 'status-card--clickable' : ''}`}
            onClick={() => handleErrorClick('overall', docs?.overall?.error || 0)}
            title={(docs?.overall?.error || 0) > 0 ? '클릭하여 오류 상세 보기' : undefined}
          >
            <span className="status-card__label">오류</span>
            <span className="status-card__value">{docs?.overall?.error || 0}</span>
          </div>
        </div>
      </section>

      {/* OCR 처리 상태 */}
      <section className="document-processing-page__section">
        <h2 className="document-processing-page__section-title">OCR 처리 상태</h2>
        <p className="document-processing-page__section-desc">
          OCR 대상 문서 중 텍스트 추출 진행 상태
        </p>
        <div className="document-processing-page__status-grid">
          <div
            className="status-card status-card--done"
            title={`${docs?.ocr?.donePages || 0}페이지/${docs?.ocr?.done || 0}문서`}
          >
            <span className="status-card__label">완료</span>
            <span className="status-card__value">{docs?.ocr?.donePages || 0}/{docs?.ocr?.done || 0}</span>
          </div>
          <div className="status-card status-card--pending">
            <span className="status-card__label">대기</span>
            <span className="status-card__value">{docs?.ocr?.pending || 0}</span>
          </div>
          <div className="status-card status-card--processing">
            <span className="status-card__label">처리 중</span>
            <span className="status-card__value">{docs?.ocr?.processing || 0}</span>
          </div>
          <div
            className={`status-card status-card--failed ${(docs?.ocr?.failed || 0) > 0 ? 'status-card--clickable' : ''}`}
            onClick={() => handleErrorClick('ocr', docs?.ocr?.failed || 0)}
            title={(docs?.ocr?.failed || 0) > 0 ? '클릭하여 실패 상세 보기' : undefined}
          >
            <span className="status-card__label">실패</span>
            <span className="status-card__value">{docs?.ocr?.failed || 0}</span>
          </div>
        </div>
      </section>

      {/* 임베딩 처리 상태 */}
      <section className="document-processing-page__section">
        <h2 className="document-processing-page__section-title">임베딩 처리 상태</h2>
        <p className="document-processing-page__section-desc">
          벡터 임베딩 생성 진행 상태 (AI 검색용)
        </p>
        <div className="document-processing-page__status-grid">
          <div className="status-card status-card--done">
            <span className="status-card__label">완료</span>
            <span className="status-card__value">{docs?.embed?.done || 0}</span>
          </div>
          <div className="status-card status-card--pending">
            <span className="status-card__label">대기</span>
            <span className="status-card__value">{docs?.embed?.pending || 0}</span>
          </div>
          <div className="status-card status-card--processing">
            <span className="status-card__label">처리 중</span>
            <span className="status-card__value">{docs?.embed?.processing || 0}</span>
          </div>
          <div
            className={`status-card status-card--failed ${(docs?.embed?.failed || 0) > 0 ? 'status-card--clickable' : ''}`}
            onClick={() => handleErrorClick('embed', docs?.embed?.failed || 0)}
            title={(docs?.embed?.failed || 0) > 0 ? '클릭하여 실패 상세 보기' : undefined}
          >
            <span className="status-card__label">실패</span>
            <span className="status-card__value">{docs?.embed?.failed || 0}</span>
          </div>
        </div>
      </section>

      {/* 처리 상태 설명 */}
      <section className="document-processing-page__section">
        <h2 className="document-processing-page__section-title">처리 상태 설명</h2>
        <div className="document-processing-page__info-cards">
          <div className="info-card">
            <h3 className="info-card__title">OCR 대상 / 비대상</h3>
            <p className="info-card__description">
              PDF, 이미지 등 텍스트 추출이 필요한 문서는 OCR 대상입니다.
              텍스트 파일이나 이미 텍스트가 있는 문서는 OCR 비대상입니다.
            </p>
          </div>
          <div className="info-card">
            <h3 className="info-card__title">임베딩 처리</h3>
            <p className="info-card__description">
              문서 내용을 벡터로 변환하는 과정입니다.
              이 단계를 거쳐야 AI 검색이 가능합니다.
            </p>
          </div>
          <div className="info-card info-card--warning">
            <h3 className="info-card__title">오류 발생 시</h3>
            <p className="info-card__description">
              OCR 또는 임베딩 처리 중 오류가 발생한 문서입니다.
              각 상태의 오류/실패 숫자를 클릭하면 상세 내용을 확인할 수 있습니다.
            </p>
          </div>
        </div>
      </section>

      {/* 모달들 */}
      <OCRFailedModal
        isOpen={openModal === 'ocr' || openModal === 'overall'}
        onClose={() => setOpenModal(null)}
      />
      <EmbedFailedModal
        isOpen={openModal === 'embed'}
        onClose={() => setOpenModal(null)}
      />
    </div>
  );
};
