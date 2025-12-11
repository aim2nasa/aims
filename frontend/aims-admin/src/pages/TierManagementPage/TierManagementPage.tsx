import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dashboardApi, type TierDefinition } from '@/features/dashboard/api';
import { Button } from '@/shared/ui/Button/Button';
import './TierManagementPage.css';

const GB = 1024 * 1024 * 1024;

const TIER_ORDER = ['free_trial', 'standard', 'premium', 'vip', 'admin'];

export const TierManagementPage = () => {
  const queryClient = useQueryClient();
  const [editingTier, setEditingTier] = useState<string | null>(null);
  const [editQuota, setEditQuota] = useState<string>('');
  const [editOcrQuota, setEditOcrQuota] = useState<string>('');

  const { data: tiersData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'tiers'],
    queryFn: dashboardApi.getTiers,
  });

  const updateTierMutation = useMutation({
    mutationFn: ({ tierId, quota_bytes, ocr_quota }: { tierId: string; quota_bytes: number; ocr_quota: number }) =>
      dashboardApi.updateTier(tierId, { quota_bytes, ocr_quota }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tiers'] });
      setEditingTier(null);
      setEditQuota('');
      setEditOcrQuota('');
    },
    onError: (error) => {
      console.error('티어 수정 실패:', error);
      alert('티어 수정에 실패했습니다.');
    },
  });

  const handleEditStart = (tier: TierDefinition) => {
    if (tier.id === 'admin') return;
    setEditingTier(tier.id);
    setEditQuota((tier.quota_bytes / GB).toString());
    setEditOcrQuota((tier.ocr_quota ?? 100).toString());
  };

  const handleEditSave = (tierId: string) => {
    const quotaGB = parseFloat(editQuota);
    const ocrQuota = parseInt(editOcrQuota, 10);
    if (isNaN(quotaGB) || quotaGB <= 0) {
      alert('유효한 스토리지 용량을 입력하세요.');
      return;
    }
    if (isNaN(ocrQuota) || ocrQuota <= 0) {
      alert('유효한 OCR 횟수를 입력하세요.');
      return;
    }
    updateTierMutation.mutate({ tierId, quota_bytes: Math.round(quotaGB * GB), ocr_quota: ocrQuota });
  };

  const handleEditCancel = () => {
    setEditingTier(null);
    setEditQuota('');
    setEditOcrQuota('');
  };

  const sortedTiers = tiersData
    ? [...tiersData].sort((a, b) => TIER_ORDER.indexOf(a.id) - TIER_ORDER.indexOf(b.id))
    : [];

  if (isLoading) {
    return <div className="tier-management-page__loading">데이터를 불러오는 중...</div>;
  }

  if (isError) {
    return (
      <div className="tier-management-page__error">
        <p>데이터를 불러오는데 실패했습니다.</p>
        <p>{error instanceof Error ? error.message : '알 수 없는 오류'}</p>
        <Button onClick={() => refetch()}>다시 시도</Button>
      </div>
    );
  }

  return (
    <div className="tier-management-page">
      <h1 className="tier-management-page__title">티어 관리</h1>

      <section className="tier-management-page__section">
        <h2 className="tier-management-page__section-title">티어 정의</h2>
        {sortedTiers.length > 0 ? (
          <table className="tier-definition-table">
            <thead>
              <tr>
                <th>티어</th>
                <th>설명</th>
                <th>스토리지</th>
                <th>OCR 횟수</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {sortedTiers.map((tier) => (
                <tr key={tier.id}>
                  <td>
                    <div className="tier-definition-table__name">
                      <span className={`tier-definition-table__color tier-definition-table__color--${tier.id}`} />
                      {tier.name}
                    </div>
                  </td>
                  <td>{tier.description}</td>
                  <td>
                    {editingTier === tier.id ? (
                      <div className="tier-edit-input">
                        <input
                          type="number"
                          value={editQuota}
                          onChange={(e) => setEditQuota(e.target.value)}
                          min="1"
                          step="1"
                          className="tier-edit-input__field"
                          aria-label="스토리지 (GB)"
                        />
                        <span className="tier-edit-input__unit">GB</span>
                      </div>
                    ) : (
                      <span className={tier.quota_bytes === -1 ? 'tier-definition-table__unlimited' : 'tier-definition-table__quota'}>
                        {tier.formatted_quota}
                      </span>
                    )}
                  </td>
                  <td>
                    {editingTier === tier.id ? (
                      <div className="tier-edit-input">
                        <input
                          type="number"
                          value={editOcrQuota}
                          onChange={(e) => setEditOcrQuota(e.target.value)}
                          min="1"
                          step="1"
                          className="tier-edit-input__field tier-edit-input__field--ocr"
                          aria-label="OCR 횟수"
                        />
                        <span className="tier-edit-input__unit">회/월</span>
                      </div>
                    ) : (
                      <span className={tier.ocr_quota === -1 ? 'tier-definition-table__unlimited' : 'tier-definition-table__quota'}>
                        {tier.formatted_ocr_quota}
                      </span>
                    )}
                  </td>
                  <td>
                    {tier.id === 'admin' ? (
                      <span className="tier-action-disabled">-</span>
                    ) : editingTier === tier.id ? (
                      <div className="tier-action-buttons">
                        <button
                          type="button"
                          className="tier-action-button tier-action-button--save"
                          onClick={() => handleEditSave(tier.id)}
                          disabled={updateTierMutation.isPending}
                        >
                          {updateTierMutation.isPending ? '저장중...' : '저장'}
                        </button>
                        <button
                          type="button"
                          className="tier-action-button tier-action-button--cancel"
                          onClick={handleEditCancel}
                          disabled={updateTierMutation.isPending}
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="tier-action-button tier-action-button--edit"
                        onClick={() => handleEditStart(tier)}
                      >
                        수정
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="tier-management-page__empty">티어 정보가 없습니다.</div>
        )}
      </section>

      <section className="tier-management-page__section">
        <h2 className="tier-management-page__section-title">티어 설명</h2>
        <div className="tier-management-page__info-cards">
          <div className="info-card">
            <h3 className="info-card__title">무료체험</h3>
            <p className="info-card__description">신규 가입 시 기본 제공되는 체험 등급입니다.</p>
          </div>
          <div className="info-card info-card--standard">
            <h3 className="info-card__title">일반</h3>
            <p className="info-card__description">기본 유료 구독 등급입니다.</p>
          </div>
          <div className="info-card info-card--premium">
            <h3 className="info-card__title">프리미엄</h3>
            <p className="info-card__description">프리미엄 구독자를 위한 등급입니다.</p>
          </div>
          <div className="info-card info-card--vip">
            <h3 className="info-card__title">VIP</h3>
            <p className="info-card__description">VIP 고객을 위한 최상위 등급입니다.</p>
          </div>
          <div className="info-card info-card--admin">
            <h3 className="info-card__title">관리자</h3>
            <p className="info-card__description">시스템 관리자 전용 등급이며 용량 제한이 없습니다.</p>
          </div>
        </div>
      </section>
    </div>
  );
};
