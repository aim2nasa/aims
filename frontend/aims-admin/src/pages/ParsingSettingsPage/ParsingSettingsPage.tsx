/**
 * Parsing Settings Page
 * @since 2025-01-17
 *
 * Annual Report / Customer Review 파서 설정 페이지
 * AI 사용량 페이지에서 분리됨 (CR은 AI 미사용)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aiUsageApi } from '@/features/dashboard/aiUsageApi';
import type { AIModelSettingsUpdate } from '@/features/dashboard/aiUsageApi';
import { Button } from '@/shared/ui/Button/Button';
import './ParsingSettingsPage.css';

export const ParsingSettingsPage = () => {
  const queryClient = useQueryClient();

  // AI 모델 설정 조회
  const { data: modelSettings, isLoading } = useQuery({
    queryKey: ['admin', 'ai-model-settings'],
    queryFn: () => aiUsageApi.getAIModelSettings(),
  });

  // 설정 변경 뮤테이션
  const updateMutation = useMutation({
    mutationFn: (updates: AIModelSettingsUpdate) => aiUsageApi.updateAIModelSettings(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'ai-model-settings'] });
    },
  });

  // 설정 초기화 뮤테이션
  const resetMutation = useMutation({
    mutationFn: () => aiUsageApi.resetAIModelSettings(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'ai-model-settings'] });
    },
  });

  // AR 파서 변경
  const handleARParserChange = (parser: string) => {
    updateMutation.mutate({
      annualReport: { parser }
    });
  };

  // AR 모델 변경
  const handleARModelChange = (model: string) => {
    updateMutation.mutate({
      annualReport: { model }
    });
  };

  // Summarize 모델 변경
  const handleSummarizeModelChange = (model: string) => {
    updateMutation.mutate({
      summarize: { model }
    });
  };

  // CR 파서 변경
  const handleCRParserChange = (parser: string) => {
    updateMutation.mutate({
      customerReview: { parser }
    });
  };

  if (isLoading) {
    return <div className="parsing-settings-page__loading">설정을 불러오는 중...</div>;
  }

  return (
    <div className="parsing-settings-page">
      <header className="parsing-settings-page__header">
        <h1 className="parsing-settings-page__title">파싱 설정</h1>
        <p className="parsing-settings-page__subtitle">
          PDF 문서 파싱에 사용되는 파서를 설정합니다.
        </p>
      </header>

      <div className="parsing-settings-page__content">
        {/* Annual Report 설정 */}
        <section className="parsing-settings-page__section">
          <h2 className="parsing-settings-page__section-title">Annual Report</h2>
          <p className="parsing-settings-page__section-desc">
            연보 PDF에서 계약 정보를 추출하는 파서를 선택합니다.
          </p>
          <div className="parsing-settings-page__form">
            <div className="parsing-settings-page__row">
              <label className="parsing-settings-page__label">파서</label>
              <select
                className="parsing-settings-page__select"
                value={modelSettings?.annualReport?.parser || 'openai'}
                onChange={(e) => handleARParserChange(e.target.value)}
                disabled={updateMutation.isPending}
              >
                {modelSettings?.annualReport?.availableParsers?.map((parser) => (
                  <option key={parser} value={parser}>
                    {parser === 'pdfplumber' ? 'pdfplumber (무료)'
                      : parser === 'pdfplumber_table' ? 'pdfplumber Table (일반화)'
                      : parser === 'openai' ? 'OpenAI (유료)'
                      : 'Upstage (유료)'}
                  </option>
                ))}
              </select>
            </div>

            <div className="parsing-settings-page__row">
              <label className="parsing-settings-page__label">AI 모델</label>
              <select
                className="parsing-settings-page__select"
                value={modelSettings?.annualReport?.model || ''}
                onChange={(e) => handleARModelChange(e.target.value)}
                disabled={updateMutation.isPending || modelSettings?.annualReport?.parser !== 'openai'}
                title={modelSettings?.annualReport?.parser !== 'openai' ? 'OpenAI 파서 선택 시에만 모델 변경 가능' : ''}
              >
                {modelSettings?.annualReport?.availableModels?.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
              {modelSettings?.annualReport?.parser !== 'openai' && (
                <span className="parsing-settings-page__hint">OpenAI 파서에서만 사용</span>
              )}
            </div>
          </div>
        </section>

        {/* 문서 요약/분류 설정 */}
        <section className="parsing-settings-page__section">
          <h2 className="parsing-settings-page__section-title">문서 요약/분류</h2>
          <p className="parsing-settings-page__section-desc">
            문서 업로드 시 자동 요약 및 분류에 사용되는 AI 모델을 선택합니다.
          </p>
          <div className="parsing-settings-page__form">
            <div className="parsing-settings-page__row">
              <label className="parsing-settings-page__label">AI 모델</label>
              <select
                className="parsing-settings-page__select"
                value={modelSettings?.summarize?.model || 'gpt-4o-mini'}
                onChange={(e) => handleSummarizeModelChange(e.target.value)}
                disabled={updateMutation.isPending}
              >
                {modelSettings?.summarize?.availableModels?.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Customer Review 설정 */}
        <section className="parsing-settings-page__section">
          <h2 className="parsing-settings-page__section-title">Customer Review</h2>
          <p className="parsing-settings-page__section-desc">
            고객 안내장(CRS) PDF에서 펀드 정보를 추출하는 파서를 선택합니다.
          </p>
          <div className="parsing-settings-page__form">
            <div className="parsing-settings-page__row">
              <label className="parsing-settings-page__label">파서</label>
              <select
                className="parsing-settings-page__select"
                value={modelSettings?.customerReview?.parser || 'regex'}
                onChange={(e) => handleCRParserChange(e.target.value)}
                disabled={updateMutation.isPending}
              >
                {modelSettings?.customerReview?.availableParsers?.map((parser) => (
                  <option key={parser} value={parser}>
                    {parser === 'regex' ? 'Regex (기존)'
                      : 'pdfplumber Table (일반화)'}
                  </option>
                ))}
              </select>
            </div>

            <div className="parsing-settings-page__row">
              <label className="parsing-settings-page__label">AI 모델</label>
              <span className="parsing-settings-page__no-ai">AI 미사용 (무료)</span>
            </div>
          </div>
        </section>

        {/* 액션 버튼 */}
        <div className="parsing-settings-page__actions">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
          >
            {resetMutation.isPending ? '초기화 중...' : '기본값으로 초기화'}
          </Button>
          {updateMutation.isPending && (
            <span className="parsing-settings-page__saving">저장 중...</span>
          )}
        </div>
      </div>
    </div>
  );
};
