/**
 * 파일 검증 설정 관리 페이지
 * @since 2025-12-13
 * @version 1.0.0
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/api/apiClient';
import { Button } from '@/shared/ui/Button/Button';
import './FileValidationPage.css';

// ============================================
// 타입 정의
// ============================================

interface ExtensionValidationSettings {
  enabled: boolean;
  blockedExtensions: string[];
  description: string;
}

interface FileSizeValidationSettings {
  enabled: boolean;
  maxSizeBytes: number;
  maxSizeMB: number;
  description: string;
}

interface MimeTypeValidationSettings {
  enabled: boolean;
  description: string;
}

interface StorageQuotaValidationSettings {
  enabled: boolean;
  description: string;
}

interface DuplicateValidationSettings {
  enabled: boolean;
  description: string;
}

interface VirusScanValidationSettings {
  enabled: boolean;
  timeoutMs: number;
  description: string;
}

interface FileValidationSettings {
  extensionValidation: ExtensionValidationSettings;
  fileSizeValidation: FileSizeValidationSettings;
  mimeTypeValidation: MimeTypeValidationSettings;
  storageQuotaValidation: StorageQuotaValidationSettings;
  duplicateValidation: DuplicateValidationSettings;
  virusScanValidation: VirusScanValidationSettings;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

// ============================================
// API 함수
// ============================================

const settingsApi = {
  getSettings: (): Promise<FileValidationSettings> => {
    return apiClient.get<ApiResponse<FileValidationSettings>>('/api/settings/file-validation')
      .then((res) => res.data);
  },

  updateSettings: (settings: FileValidationSettings): Promise<FileValidationSettings> => {
    return apiClient.put<ApiResponse<FileValidationSettings>>('/api/settings/file-validation', settings)
      .then((res) => res.data);
  },

  resetSettings: (): Promise<FileValidationSettings> => {
    return apiClient.post<ApiResponse<FileValidationSettings>>('/api/settings/file-validation/reset')
      .then((res) => res.data);
  },

  getDefaults: (): Promise<FileValidationSettings> => {
    return apiClient.get<ApiResponse<FileValidationSettings>>('/api/settings/file-validation/defaults')
      .then((res) => res.data);
  },
};

// ============================================
// 컴포넌트
// ============================================

interface ToggleSwitchProps {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

const ToggleSwitch = ({ enabled, onToggle, disabled }: ToggleSwitchProps) => (
  <button
    type="button"
    className={`toggle-switch ${enabled ? 'toggle-switch--enabled' : ''} ${disabled ? 'toggle-switch--disabled' : ''}`}
    onClick={onToggle}
    disabled={disabled}
    aria-pressed={enabled}
  >
    <span className="toggle-switch__track">
      <span className="toggle-switch__thumb" />
    </span>
  </button>
);

interface SettingCardProps {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
  disabled?: boolean;
}

const SettingCard = ({ title, description, enabled, onToggle, children, disabled }: SettingCardProps) => (
  <div className={`setting-card ${!enabled ? 'setting-card--disabled' : ''}`}>
    <div className="setting-card__header">
      <div className="setting-card__info">
        <h3 className="setting-card__title">{title}</h3>
        <p className="setting-card__description">{description}</p>
      </div>
      <ToggleSwitch enabled={enabled} onToggle={onToggle} disabled={disabled} />
    </div>
    {enabled && children && (
      <div className="setting-card__content">
        {children}
      </div>
    )}
  </div>
);

export const FileValidationPage = () => {
  const queryClient = useQueryClient();
  const [editingExtensions, setEditingExtensions] = useState(false);
  const [extensionsText, setExtensionsText] = useState('');
  const [maxSizeMB, setMaxSizeMB] = useState<number>(50);
  const [virusScanTimeout, setVirusScanTimeout] = useState<number>(10);

  // 설정 조회
  const { data: settings, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'settings', 'file-validation'],
    queryFn: settingsApi.getSettings,
  });

  // 설정 업데이트
  const updateMutation = useMutation({
    mutationFn: settingsApi.updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings', 'file-validation'] });
    },
  });

  // 설정 초기화
  const resetMutation = useMutation({
    mutationFn: settingsApi.resetSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings', 'file-validation'] });
    },
  });

  // 토글 핸들러
  const handleToggle = (key: keyof FileValidationSettings) => {
    if (!settings) return;
    const currentSetting = settings[key];
    updateMutation.mutate({
      ...settings,
      [key]: {
        ...currentSetting,
        enabled: !currentSetting.enabled,
      },
    });
  };

  // 확장자 목록 편집 시작
  const startEditingExtensions = () => {
    if (!settings) return;
    setExtensionsText(settings.extensionValidation.blockedExtensions.join(', '));
    setEditingExtensions(true);
  };

  // 확장자 목록 저장
  const saveExtensions = () => {
    if (!settings) return;
    const extensions = extensionsText
      .split(',')
      .map(ext => ext.trim().toLowerCase().replace(/^\./, ''))
      .filter(ext => ext.length > 0);

    updateMutation.mutate({
      ...settings,
      extensionValidation: {
        ...settings.extensionValidation,
        blockedExtensions: extensions,
      },
    });
    setEditingExtensions(false);
  };

  // 파일 크기 업데이트
  const updateMaxSize = () => {
    if (!settings) return;
    updateMutation.mutate({
      ...settings,
      fileSizeValidation: {
        ...settings.fileSizeValidation,
        maxSizeMB,
        maxSizeBytes: maxSizeMB * 1024 * 1024,
      },
    });
  };

  // 바이러스 검사 타임아웃 업데이트
  const updateVirusScanTimeout = () => {
    if (!settings) return;
    updateMutation.mutate({
      ...settings,
      virusScanValidation: {
        ...settings.virusScanValidation,
        timeoutMs: virusScanTimeout * 1000,
      },
    });
  };

  // 설정 로드 시 로컬 상태 업데이트
  if (settings && maxSizeMB !== settings.fileSizeValidation.maxSizeMB) {
    setMaxSizeMB(settings.fileSizeValidation.maxSizeMB);
  }
  if (settings && virusScanTimeout !== settings.virusScanValidation.timeoutMs / 1000) {
    setVirusScanTimeout(settings.virusScanValidation.timeoutMs / 1000);
  }

  if (isLoading) {
    return <div className="file-validation-page__loading">설정을 불러오는 중...</div>;
  }

  if (isError) {
    return (
      <div className="file-validation-page__error">
        <p>설정을 불러오는데 실패했습니다.</p>
        <p>{error instanceof Error ? error.message : '알 수 없는 오류'}</p>
        <Button onClick={() => refetch()}>다시 시도</Button>
      </div>
    );
  }

  if (!settings) {
    return <div className="file-validation-page__error">설정 데이터가 없습니다.</div>;
  }

  const isPending = updateMutation.isPending || resetMutation.isPending;

  return (
    <div className="file-validation-page">
      <div className="file-validation-page__header">
        <div className="file-validation-page__header-left">
          <h1 className="file-validation-page__title">파일 검증 설정</h1>
          <p className="file-validation-page__subtitle">파일 업로드 시 적용되는 보안 검증 규칙을 관리합니다.</p>
        </div>
        <div className="file-validation-page__header-right">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => resetMutation.mutate()}
            disabled={isPending}
          >
            기본값으로 초기화
          </Button>
        </div>
      </div>

      {(updateMutation.isError || resetMutation.isError) && (
        <div className="file-validation-page__alert file-validation-page__alert--error">
          저장에 실패했습니다: {updateMutation.error?.message || resetMutation.error?.message}
        </div>
      )}

      {(updateMutation.isSuccess || resetMutation.isSuccess) && (
        <div className="file-validation-page__alert file-validation-page__alert--success">
          설정이 저장되었습니다.
        </div>
      )}

      <div className="file-validation-page__grid">
        {/* 확장자 검증 */}
        <SettingCard
          title="확장자 검증"
          description={settings.extensionValidation.description}
          enabled={settings.extensionValidation.enabled}
          onToggle={() => handleToggle('extensionValidation')}
          disabled={isPending}
        >
          <div className="setting-card__field">
            <label className="setting-card__label">차단 확장자 목록</label>
            {editingExtensions ? (
              <div className="setting-card__edit-area">
                <textarea
                  className="setting-card__textarea"
                  value={extensionsText}
                  onChange={(e) => setExtensionsText(e.target.value)}
                  placeholder="exe, bat, cmd, ..."
                  rows={4}
                />
                <div className="setting-card__edit-actions">
                  <Button size="sm" onClick={saveExtensions} disabled={isPending}>
                    저장
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingExtensions(false)}>
                    취소
                  </Button>
                </div>
              </div>
            ) : (
              <div className="setting-card__value-area">
                <div className="setting-card__extensions">
                  {settings.extensionValidation.blockedExtensions.slice(0, 15).map((ext) => (
                    <span key={ext} className="setting-card__extension-badge">.{ext}</span>
                  ))}
                  {settings.extensionValidation.blockedExtensions.length > 15 && (
                    <span className="setting-card__extension-more">
                      +{settings.extensionValidation.blockedExtensions.length - 15}개
                    </span>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={startEditingExtensions} disabled={isPending}>
                  편집
                </Button>
              </div>
            )}
          </div>
        </SettingCard>

        {/* 파일 크기 검증 */}
        <SettingCard
          title="파일 크기 검증"
          description={settings.fileSizeValidation.description}
          enabled={settings.fileSizeValidation.enabled}
          onToggle={() => handleToggle('fileSizeValidation')}
          disabled={isPending}
        >
          <div className="setting-card__field setting-card__field--inline">
            <label className="setting-card__label">최대 파일 크기</label>
            <div className="setting-card__input-group">
              <input
                type="number"
                className="setting-card__input"
                value={maxSizeMB}
                onChange={(e) => setMaxSizeMB(Number(e.target.value))}
                min={1}
                max={500}
              />
              <span className="setting-card__input-suffix">MB</span>
              <Button size="sm" onClick={updateMaxSize} disabled={isPending || maxSizeMB === settings.fileSizeValidation.maxSizeMB}>
                적용
              </Button>
            </div>
          </div>
        </SettingCard>

        {/* MIME 타입 검증 */}
        <SettingCard
          title="MIME 타입 검증"
          description={settings.mimeTypeValidation.description}
          enabled={settings.mimeTypeValidation.enabled}
          onToggle={() => handleToggle('mimeTypeValidation')}
          disabled={isPending}
        />

        {/* 스토리지 용량 검사 */}
        <SettingCard
          title="스토리지 용량 검사"
          description={settings.storageQuotaValidation.description}
          enabled={settings.storageQuotaValidation.enabled}
          onToggle={() => handleToggle('storageQuotaValidation')}
          disabled={isPending}
        />

        {/* 중복 파일 검사 */}
        <SettingCard
          title="중복 파일 검사"
          description={settings.duplicateValidation.description}
          enabled={settings.duplicateValidation.enabled}
          onToggle={() => handleToggle('duplicateValidation')}
          disabled={isPending}
        />

        {/* 바이러스 검사 */}
        <SettingCard
          title="바이러스 검사"
          description={settings.virusScanValidation.description}
          enabled={settings.virusScanValidation.enabled}
          onToggle={() => handleToggle('virusScanValidation')}
          disabled={isPending}
        >
          <div className="setting-card__field setting-card__field--inline">
            <label className="setting-card__label">검사 타임아웃</label>
            <div className="setting-card__input-group">
              <input
                type="number"
                className="setting-card__input"
                value={virusScanTimeout}
                onChange={(e) => setVirusScanTimeout(Number(e.target.value))}
                min={1}
                max={60}
              />
              <span className="setting-card__input-suffix">초</span>
              <Button size="sm" onClick={updateVirusScanTimeout} disabled={isPending || virusScanTimeout === settings.virusScanValidation.timeoutMs / 1000}>
                적용
              </Button>
            </div>
          </div>
        </SettingCard>
      </div>
    </div>
  );
};
