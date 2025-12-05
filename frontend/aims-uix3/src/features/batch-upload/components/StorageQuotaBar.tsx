/**
 * StorageQuotaBar Component
 * @since 2025-12-05
 * @version 1.0.0
 *
 * 스토리지 사용량 표시 컴포넌트
 * - 현재 사용량/최대 용량 표시
 * - 등급별 한도 표시
 */

import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../components/SFSymbol'
import { formatFileSize } from '../utils/fileValidation'
import './StorageQuotaBar.css'

interface StorageQuotaBarProps {
  usedBytes: number
  maxBytes: number
  pendingBytes?: number // 업로드 예정 크기
  tierName?: string
}

export default function StorageQuotaBar({
  usedBytes,
  maxBytes,
  pendingBytes = 0,
  tierName,
}: StorageQuotaBarProps) {
  const usedPercent = Math.min((usedBytes / maxBytes) * 100, 100)
  const pendingPercent = Math.min((pendingBytes / maxBytes) * 100, 100 - usedPercent)
  const totalPercent = usedPercent + pendingPercent

  // 경고 레벨 결정
  const getWarningLevel = (): 'normal' | 'warning' | 'danger' => {
    if (totalPercent >= 95) return 'danger'
    if (totalPercent >= 80) return 'warning'
    return 'normal'
  }

  const warningLevel = getWarningLevel()

  // 남은 용량
  const remainingBytes = Math.max(maxBytes - usedBytes - pendingBytes, 0)

  return (
    <div className={`storage-quota-bar ${warningLevel}`}>
      <div className="storage-quota-header">
        <div className="storage-quota-title">
          <SFSymbol
            name="externaldrive-fill"
            size={SFSymbolSize.FOOTNOTE}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>스토리지</span>
          {tierName && <span className="storage-quota-tier">{tierName}</span>}
        </div>
        <div className="storage-quota-values">
          <span className="storage-quota-used">{formatFileSize(usedBytes)}</span>
          <span className="storage-quota-separator">/</span>
          <span className="storage-quota-max">{formatFileSize(maxBytes)}</span>
        </div>
      </div>

      <div className="storage-quota-progress">
        <div
          className="storage-quota-progress-used"
          style={{ width: `${usedPercent}%` }}
        />
        {pendingBytes > 0 && (
          <div
            className="storage-quota-progress-pending"
            style={{ width: `${pendingPercent}%`, left: `${usedPercent}%` }}
          />
        )}
      </div>

      <div className="storage-quota-footer">
        {pendingBytes > 0 ? (
          <span className="storage-quota-pending-info">
            +{formatFileSize(pendingBytes)} 업로드 예정
          </span>
        ) : (
          <span className="storage-quota-remaining">
            {formatFileSize(remainingBytes)} 남음
          </span>
        )}

        {warningLevel === 'warning' && (
          <span className="storage-quota-warning">
            <SFSymbol
              name="exclamationmark-triangle-fill"
              size={SFSymbolSize.CAPTION2}
              weight={SFSymbolWeight.MEDIUM}
            />
            <span>용량 부족 주의</span>
          </span>
        )}

        {warningLevel === 'danger' && (
          <span className="storage-quota-danger">
            <SFSymbol
              name="exclamationmark-circle-fill"
              size={SFSymbolSize.CAPTION2}
              weight={SFSymbolWeight.MEDIUM}
            />
            <span>용량 초과 위험</span>
          </span>
        )}
      </div>
    </div>
  )
}
