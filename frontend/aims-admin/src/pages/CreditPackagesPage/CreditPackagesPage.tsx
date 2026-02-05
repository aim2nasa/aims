import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { creditsApi, type CreditPackage } from '@/features/credits/api';
import './CreditPackagesPage.css';

// 크레딧 페이지 탭 네비게이션
const CreditTabs = () => {
  const location = useLocation();
  const tabs = [
    { path: '/dashboard/credits', label: '사용자 크레딧' },
    { path: '/dashboard/credits/history', label: '이력 조회' },
    { path: '/dashboard/credits/packages', label: '패키지 관리' },
  ];

  return (
    <div className="credit-tabs">
      {tabs.map((tab) => (
        <Link
          key={tab.path}
          to={tab.path}
          className={`credit-tab ${location.pathname === tab.path ? 'active' : ''}`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
};

export function CreditPackagesPage() {
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingPackage, setEditingPackage] = useState<CreditPackage | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    credits: 0,
    price_krw: 0,
    description: '',
    sort_order: 1,
    is_active: true,
  });

  useEffect(() => {
    fetchPackages();
  }, []);

  const fetchPackages = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await creditsApi.getPackages();
      setPackages(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '패키지를 불러오는 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setFormData({
      code: '',
      name: '',
      credits: 0,
      price_krw: 0,
      description: '',
      sort_order: packages.length + 1,
      is_active: true,
    });
    setEditingPackage(null);
    setShowAddModal(true);
  };

  const openEditModal = (pkg: CreditPackage) => {
    setFormData({
      code: pkg.code,
      name: pkg.name,
      credits: pkg.credits,
      price_krw: pkg.price_krw,
      description: pkg.description || '',
      sort_order: pkg.sort_order,
      is_active: pkg.is_active,
    });
    setEditingPackage(pkg);
    setShowAddModal(true);
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEditingPackage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.code || !formData.name || formData.credits <= 0 || formData.price_krw <= 0) {
      alert('필수 항목을 모두 입력해주세요.');
      return;
    }

    try {
      setSaving(true);

      const packageData = {
        ...formData,
        price_per_credit: Math.round((formData.price_krw / formData.credits) * 100) / 100,
      };

      if (editingPackage) {
        await creditsApi.updatePackage(editingPackage.code, packageData);
      } else {
        await creditsApi.createPackage(packageData);
      }

      closeModal();
      fetchPackages();
    } catch (err) {
      alert(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (pkg: CreditPackage) => {
    try {
      await creditsApi.updatePackage(pkg.code, { is_active: !pkg.is_active });
      fetchPackages();
    } catch (err) {
      alert(err instanceof Error ? err.message : '상태 변경 중 오류가 발생했습니다');
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ko-KR').format(price) + '원';
  };

  return (
    <div className="credit-packages-page">
      <div className="page-header">
        <div className="header-content">
          <div>
            <h1>크레딧 관리</h1>
            <p className="page-description">
              사용자에게 제공할 크레딧 패키지를 관리합니다.
            </p>
          </div>
          <button type="button" className="add-btn" onClick={openAddModal}>
            + 패키지 추가
          </button>
        </div>
      </div>

      <CreditTabs />

      {/* 에러 메시지 */}
      {error && (
        <div className="error-message">
          {error}
          <button type="button" onClick={fetchPackages}>다시 시도</button>
        </div>
      )}

      {/* 패키지 목록 */}
      <div className="packages-grid">
        {loading ? (
          <div className="loading-state">패키지를 불러오는 중...</div>
        ) : packages.length === 0 ? (
          <div className="empty-state">
            <p>등록된 패키지가 없습니다.</p>
            <button type="button" onClick={openAddModal}>첫 패키지 추가</button>
          </div>
        ) : (
          packages.map((pkg) => (
            <div key={pkg.code} className={`package-card ${!pkg.is_active ? 'inactive' : ''}`}>
              <div className="package-header">
                <span className="package-name">{pkg.name}</span>
                <span className={`status-badge ${pkg.is_active ? 'active' : 'inactive'}`}>
                  {pkg.is_active ? '활성' : '비활성'}
                </span>
              </div>

              <div className="package-credits">
                {pkg.credits.toLocaleString()}
                <span className="credits-unit">크레딧</span>
              </div>

              <div className="package-price">
                {formatPrice(pkg.price_krw)}
              </div>

              <div className="package-per-credit">
                크레딧당 {pkg.price_per_credit?.toFixed(2) || (pkg.price_krw / pkg.credits).toFixed(2)}원
              </div>

              {pkg.description && (
                <p className="package-description">{pkg.description}</p>
              )}

              <div className="package-actions">
                <button type="button" className="edit-btn" onClick={() => openEditModal(pkg)}>
                  수정
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${pkg.is_active ? 'deactivate' : 'activate'}`}
                  onClick={() => toggleActive(pkg)}
                >
                  {pkg.is_active ? '비활성화' : '활성화'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 추가/수정 모달 */}
      {showAddModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingPackage ? '패키지 수정' : '패키지 추가'}</h2>
              <button type="button" className="close-btn" onClick={closeModal}>×</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>패키지 코드 *</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="예: basic, premium"
                  disabled={!!editingPackage}
                />
                {editingPackage && (
                  <span className="hint">코드는 수정할 수 없습니다.</span>
                )}
              </div>

              <div className="form-group">
                <label>패키지 이름 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="예: 기본, 대량"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>크레딧 수 *</label>
                  <input
                    type="number"
                    value={formData.credits || ''}
                    onChange={(e) => setFormData({ ...formData, credits: parseInt(e.target.value) || 0 })}
                    placeholder="1000"
                    min="1"
                  />
                </div>

                <div className="form-group">
                  <label>가격 (원) *</label>
                  <input
                    type="number"
                    value={formData.price_krw || ''}
                    onChange={(e) => setFormData({ ...formData, price_krw: parseInt(e.target.value) || 0 })}
                    placeholder="4900"
                    min="0"
                  />
                </div>
              </div>

              {formData.credits > 0 && formData.price_krw > 0 && (
                <div className="price-preview">
                  크레딧당 가격: {(formData.price_krw / formData.credits).toFixed(2)}원
                </div>
              )}

              <div className="form-group">
                <label>설명</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="패키지 설명 (선택)"
                  rows={2}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>정렬 순서</label>
                  <input
                    type="number"
                    value={formData.sort_order}
                    onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 1 })}
                    min="1"
                  />
                </div>

                <div className="form-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      title="패키지 활성화 여부"
                    />
                    활성화
                  </label>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={closeModal}>
                  취소
                </button>
                <button type="submit" className="submit-btn" disabled={saving}>
                  {saving ? '저장 중...' : editingPackage ? '수정' : '추가'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
