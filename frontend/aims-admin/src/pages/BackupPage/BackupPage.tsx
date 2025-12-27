import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/api/apiClient';
import { Button } from '@/shared/ui/Button/Button';
import { Modal } from '@/shared/ui/Modal/Modal';
import { ConfirmModal } from '@/shared/ui/ConfirmModal/ConfirmModal';
import './BackupPage.css';

// Types
interface BackupInfo {
  filename: string;
  size: number;
  createdAt: string;
  hasLog: boolean;
  logFilename: string | null;
}

interface DiskInfo {
  total: number;
  used: number;
  available: number;
}

interface BackupsResponse {
  success: boolean;
  backups: BackupInfo[];
  totalCount: number;
  diskInfo: DiskInfo | null;
}

interface RestoreResult {
  component: string;
  status: 'success' | 'error' | 'skipped';
  message: string;
}

interface RestoreResponse {
  success: boolean;
  message: string;
  results: RestoreResult[];
  note?: string;
}

// API functions
const backupApi = {
  getBackups: () => apiClient.get<BackupsResponse>('/api/admin/backups'),
  createBackup: () => apiClient.post<{ success: boolean; message: string; backup: BackupInfo | null; output?: string }>('/api/admin/backups'),
  deleteBackup: (filename: string) => apiClient.delete<{ success: boolean; message: string }>(`/api/admin/backups/${filename}`),
  getLog: (logFilename: string) => apiClient.get<{ success: boolean; content: string }>(`/api/admin/backups/${logFilename}/log`),
  restore: (filename: string, components: string[]) => apiClient.post<RestoreResponse>(`/api/admin/backups/${filename}/restore`, { components }),
};

// Utility functions
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatDate = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

const getRelativeTime = (isoString: string): string => {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffDays > 0) return `${diffDays}일 전`;
  if (diffHours > 0) return `${diffHours}시간 전`;
  if (diffMins > 0) return `${diffMins}분 전`;
  return '방금 전';
};

// Components
const RESTORE_COMPONENTS = [
  { id: 'env', label: '환경 파일', description: 'API 키, JWT 시크릿 등' },
  { id: 'mongodb', label: 'MongoDB', description: '사용자, 고객, 문서 데이터' },
  { id: 'qdrant', label: 'Qdrant', description: '벡터 임베딩 (AI 검색)' },
  { id: 'files', label: '업로드 파일', description: '사용자 업로드 문서 원본' },
];

export const BackupPage = () => {
  const queryClient = useQueryClient();
  const [selectedBackup, setSelectedBackup] = useState<BackupInfo | null>(null);
  const [showLogModal, setShowLogModal] = useState(false);
  const [logContent, setLogContent] = useState('');
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreComponents, setRestoreComponents] = useState<string[]>(['all']);
  const [deleteConfirm, setDeleteConfirm] = useState<BackupInfo | null>(null);
  const [showCreateOutput, setShowCreateOutput] = useState(false);
  const [createOutput, setCreateOutput] = useState('');

  // Queries
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'backups'],
    queryFn: backupApi.getBackups,
    refetchInterval: 30000, // 30초마다 갱신
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: backupApi.createBackup,
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'backups'] });
      if (response.output) {
        setCreateOutput(response.output);
        setShowCreateOutput(true);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (filename: string) => backupApi.deleteBackup(filename),
    onSuccess: async () => {
      setDeleteConfirm(null);
      // 삭제 후 즉시 refetch하여 디스크 정보 업데이트
      await refetch();
    },
  });

  const restoreMutation = useMutation({
    mutationFn: ({ filename, components }: { filename: string; components: string[] }) =>
      backupApi.restore(filename, components),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'backups'] });
      setShowRestoreModal(false);
      setSelectedBackup(null);
    },
  });

  // Handlers
  const handleViewLog = async (backup: BackupInfo) => {
    if (!backup.logFilename) return;
    try {
      const response = await backupApi.getLog(backup.logFilename);
      setLogContent(response.content);
      setShowLogModal(true);
    } catch (e) {
      console.error('로그 조회 실패:', e);
    }
  };

  const handleRestore = (backup: BackupInfo) => {
    setSelectedBackup(backup);
    setRestoreComponents(['all']);
    setShowRestoreModal(true);
  };

  const handleRestoreConfirm = () => {
    if (!selectedBackup) return;
    restoreMutation.mutate({
      filename: selectedBackup.filename,
      components: restoreComponents,
    });
  };

  const handleDownload = (backup: BackupInfo) => {
    const token = localStorage.getItem('aims-admin-token');
    const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
    const url = `${baseUrl}/api/admin/backups/${backup.filename}/download`;

    // 토큰을 포함하여 다운로드
    fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.blob())
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = backup.filename;
        a.click();
        URL.revokeObjectURL(a.href);
      });
  };

  const toggleComponent = (compId: string) => {
    if (compId === 'all') {
      setRestoreComponents(['all']);
      return;
    }

    setRestoreComponents((prev) => {
      // 'all'이 선택되어 있으면 제거하고 해당 컴포넌트만 선택
      if (prev.includes('all')) {
        return [compId];
      }
      // 토글
      if (prev.includes(compId)) {
        const next = prev.filter((c) => c !== compId);
        return next.length === 0 ? ['all'] : next;
      }
      return [...prev, compId];
    });
  };

  // Render
  if (isLoading) {
    return <div className="backup-page__loading">데이터를 불러오는 중...</div>;
  }

  if (isError) {
    return (
      <div className="backup-page__error">
        <p>데이터를 불러오는데 실패했습니다.</p>
        <p>{error instanceof Error ? error.message : '알 수 없는 오류'}</p>
        <Button onClick={() => refetch()}>다시 시도</Button>
      </div>
    );
  }

  const backups = data?.backups || [];
  const diskInfo = data?.diskInfo;

  return (
    <div className="backup-page">
      <div className="backup-page__header">
        <div className="backup-page__title-section">
          <h1 className="backup-page__title">백업 관리</h1>
          <p className="backup-page__description">
            AIMS 서비스의 데이터 백업 및 복원을 관리합니다.
          </p>
        </div>
        <div className="backup-page__actions">
          <Button
            variant="primary"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? '백업 생성 중...' : '새 백업 생성'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            새로고침
          </Button>
        </div>
      </div>

      {/* 디스크 정보 */}
      {diskInfo && (
        <div className="backup-page__disk-info">
          <div className="backup-page__disk-bar">
            <div
              className="backup-page__disk-used"
              style={{ width: `${(diskInfo.used / diskInfo.total) * 100}%` }}
            />
          </div>
          <div className="backup-page__disk-text">
            <span>
              사용: {formatBytes(diskInfo.used)} / {formatBytes(diskInfo.total)}
            </span>
            <span>여유: {formatBytes(diskInfo.available)}</span>
          </div>
        </div>
      )}

      {/* 백업 목록 */}
      <div className="backup-page__list">
        {backups.length === 0 && !createMutation.isPending ? (
          <div className="backup-page__empty">
            <p>백업 파일이 없습니다.</p>
            <p>새 백업을 생성해 주세요.</p>
          </div>
        ) : (
          <table className="backup-page__table">
            <thead>
              <tr>
                <th>파일명</th>
                <th>크기</th>
                <th>생성일시</th>
                <th>경과</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {/* 생성 중인 백업 행 */}
              {createMutation.isPending && (
                <tr className="backup-page__creating-row">
                  <td>
                    <div className="backup-page__creating-cell">
                      <div className="backup-page__creating-spinner" />
                      <span>백업 생성 중...</span>
                    </div>
                  </td>
                  <td>-</td>
                  <td>-</td>
                  <td>진행 중</td>
                  <td>-</td>
                </tr>
              )}
              {backups.map((backup) => (
                <tr key={backup.filename}>
                  <td className="backup-page__filename">{backup.filename}</td>
                  <td>{formatBytes(backup.size)}</td>
                  <td>{formatDate(backup.createdAt)}</td>
                  <td className="backup-page__relative-time">
                    {getRelativeTime(backup.createdAt)}
                  </td>
                  <td className="backup-page__actions-cell">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(backup)}
                      title="다운로드"
                    >
                      다운로드
                    </Button>
                    {backup.hasLog && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewLog(backup)}
                        title="로그 보기"
                      >
                        로그
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRestore(backup)}
                      title="복원"
                    >
                      복원
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirm(backup)}
                      title="삭제"
                      className="backup-page__delete-btn"
                    >
                      삭제
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 백업 대상 정보 */}
      <div className="backup-page__info">
        <h2>백업 대상 (6단계)</h2>
        <ul>
          <li><strong>1. 버전 정보:</strong> Git 커밋, Frontend/Backend 버전, n8n 워크플로우 메타데이터 (versions.json)</li>
          <li><strong>2. 환경 파일:</strong> aims_api.env, annual_report_api.env, aims_mcp.env</li>
          <li><strong>3. MongoDB:</strong> docupload (사용자/고객/문서/계약), aims_analytics</li>
          <li><strong>4. Qdrant 벡터 DB:</strong> 벡터 임베딩 데이터 (AI 검색용)</li>
          <li><strong>5. 업로드 파일:</strong> /data/files (temp 폴더 제외)</li>
          <li><strong>6. 압축:</strong> 위 데이터를 tar.gz로 압축 저장</li>
        </ul>
        <p className="backup-page__info-note">
          * n8n 워크플로우 실제 데이터는 별도 git 저장소로 관리됩니다. (버전 메타데이터만 백업)
        </p>
      </div>

      {/* 로그 모달 */}
      <Modal
        isOpen={showLogModal}
        onClose={() => setShowLogModal(false)}
        title="백업 로그"
      >
        <div className="backup-page__log-modal">
          <pre className="backup-page__log-content">{logContent}</pre>
        </div>
      </Modal>

      {/* 생성 결과 모달 */}
      <Modal
        isOpen={showCreateOutput}
        onClose={() => setShowCreateOutput(false)}
        title="백업 생성 완료"
      >
        <div className="backup-page__log-modal">
          <pre className="backup-page__log-content">{createOutput}</pre>
        </div>
      </Modal>

      {/* 복원 모달 */}
      <Modal
        isOpen={showRestoreModal}
        onClose={() => setShowRestoreModal(false)}
        title="백업 복원"
      >
        <div className="backup-page__restore-modal">
          <p className="backup-page__restore-warning">
            ⚠️ 복원 시 현재 데이터가 덮어쓰여집니다. 신중하게 선택하세요.
          </p>
          <p className="backup-page__restore-file">
            파일: <strong>{selectedBackup?.filename}</strong>
          </p>

          <div className="backup-page__restore-components">
            <h3>복원할 항목 선택</h3>
            <label className="backup-page__restore-option">
              <input
                type="checkbox"
                checked={restoreComponents.includes('all')}
                onChange={() => toggleComponent('all')}
              />
              <span className="backup-page__restore-option-label">전체 복원</span>
              <span className="backup-page__restore-option-desc">모든 항목 복원</span>
            </label>
            {RESTORE_COMPONENTS.map((comp) => (
              <label key={comp.id} className="backup-page__restore-option">
                <input
                  type="checkbox"
                  checked={restoreComponents.includes('all') || restoreComponents.includes(comp.id)}
                  disabled={restoreComponents.includes('all')}
                  onChange={() => toggleComponent(comp.id)}
                />
                <span className="backup-page__restore-option-label">{comp.label}</span>
                <span className="backup-page__restore-option-desc">{comp.description}</span>
              </label>
            ))}
          </div>

          {restoreMutation.isError && (
            <p className="backup-page__restore-error">
              복원 실패: {restoreMutation.error instanceof Error ? restoreMutation.error.message : '알 수 없는 오류'}
            </p>
          )}

          {restoreMutation.isSuccess && restoreMutation.data && (
            <div className="backup-page__restore-results">
              <h4>복원 결과</h4>
              {restoreMutation.data.results.map((result, i) => (
                <div key={i} className={`backup-page__restore-result backup-page__restore-result--${result.status}`}>
                  <span className="backup-page__restore-result-comp">{result.component}</span>
                  <span className="backup-page__restore-result-status">{result.status}</span>
                  <span className="backup-page__restore-result-msg">{result.message}</span>
                </div>
              ))}
              {restoreMutation.data.note && (
                <p className="backup-page__restore-note">{restoreMutation.data.note}</p>
              )}
            </div>
          )}

          <div className="backup-page__restore-actions">
            <Button
              variant="secondary"
              onClick={() => setShowRestoreModal(false)}
            >
              취소
            </Button>
            <Button
              variant="primary"
              onClick={handleRestoreConfirm}
              disabled={restoreMutation.isPending}
            >
              {restoreMutation.isPending ? '복원 중...' : '복원 시작'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 삭제 확인 모달 */}
      <ConfirmModal
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.filename)}
        title="백업 삭제"
        message={`"${deleteConfirm?.filename}" 백업을 삭제하시겠습니까?\n삭제된 백업은 복구할 수 없습니다.`}
        confirmText="삭제"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};

export default BackupPage;
