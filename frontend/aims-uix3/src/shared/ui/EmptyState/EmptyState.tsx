/**
 * EmptyState - 빈 상태 표시 컴포넌트
 * 데이터가 없거나 검색 결과가 없을 때 사용
 */
import React, { type ReactNode } from 'react'
import { Button } from '../Button'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '@/components/SFSymbol'
import './EmptyState.css'

export interface EmptyStateAction {
  label: string
  onClick: () => void
  icon?: string
  variant?: 'primary' | 'secondary' | 'ghost'
}

export interface EmptyStateProps {
  /** 아이콘 (SF Symbol 이름 또는 ReactNode) */
  icon?: string | ReactNode
  /** 제목 */
  title: string
  /** 설명 텍스트 */
  description?: string
  /** 액션 버튼 */
  action?: EmptyStateAction
  /** 보조 액션 버튼 */
  secondaryAction?: EmptyStateAction
  /** 크기 */
  size?: 'sm' | 'md' | 'lg'
  /** 수직 중앙 정렬 (컨테이너 높이 100% 사용) */
  centered?: boolean
  /** 추가 className */
  className?: string
}

/**
 * EmptyState - 빈 상태 표시
 *
 * @example
 * ```tsx
 * // 기본 사용
 * <EmptyState
 *   icon="doc.text.magnifyingglass"
 *   title="검색 결과가 없습니다"
 *   description="다른 검색어로 시도해보세요"
 * />
 *
 * // 액션 버튼 포함
 * <EmptyState
 *   icon="folder"
 *   title="등록된 문서가 없습니다"
 *   description="문서를 업로드하여 시작하세요"
 *   action={{
 *     label: "문서 업로드",
 *     onClick: handleUpload,
 *     icon: "plus"
 *   }}
 * />
 *
 * // 두 개의 액션
 * <EmptyState
 *   icon="person.2"
 *   title="고객이 없습니다"
 *   action={{ label: "고객 등록", onClick: handleAdd }}
 *   secondaryAction={{ label: "가져오기", onClick: handleImport }}
 * />
 * ```
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  size = 'md',
  centered = false,
  className = '',
}: EmptyStateProps) {
  const renderIcon = () => {
    if (!icon) return null

    if (typeof icon === 'string') {
      return (
        <div className="empty-state__icon">
          <SFSymbol
            name={icon}
            size={size === 'sm' ? SFSymbolSize.BODY : size === 'lg' ? SFSymbolSize.TITLE_1 : SFSymbolSize.TITLE_2}
            weight={SFSymbolWeight.LIGHT}
            decorative={true}
          />
        </div>
      )
    }

    return <div className="empty-state__icon">{icon}</div>
  }

  return (
    <div
      className={`empty-state empty-state--${size} ${centered ? 'empty-state--centered' : ''} ${className}`}
      role="status"
      aria-label={title}
    >
      {renderIcon()}

      <h3 className="empty-state__title">{title}</h3>

      {description && (
        <p className="empty-state__description">{description}</p>
      )}

      {(action || secondaryAction) && (
        <div className="empty-state__actions">
          {action && (
            <Button
              variant={action.variant || 'primary'}
              size={size === 'lg' ? 'md' : 'sm'}
              onClick={action.onClick}
              leftIcon={action.icon ? (
                <SFSymbol
                  name={action.icon}
                  size={SFSymbolSize.CAPTION_1}
                  weight={SFSymbolWeight.MEDIUM}
                  decorative={true}
                />
              ) : undefined}
            >
              {action.label}
            </Button>
          )}

          {secondaryAction && (
            <Button
              variant={secondaryAction.variant || 'secondary'}
              size={size === 'lg' ? 'md' : 'sm'}
              onClick={secondaryAction.onClick}
              leftIcon={secondaryAction.icon ? (
                <SFSymbol
                  name={secondaryAction.icon}
                  size={SFSymbolSize.CAPTION_1}
                  weight={SFSymbolWeight.MEDIUM}
                  decorative={true}
                />
              ) : undefined}
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

