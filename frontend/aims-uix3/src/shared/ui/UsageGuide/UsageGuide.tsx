/**
 * UsageGuide Component
 * @since 1.0.0
 *
 * 페이지 사용 가이드 컴포넌트
 * Progressive Disclosure 원칙: 기본은 접혀있고 필요시 펼침
 * 애플 디자인 철학: 서브틀하고 깔끔한 인터페이스
 */

import React, { useState } from 'react'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../components/SFSymbol'
import './UsageGuide.css'

export interface GuideSection {
  /** 섹션 아이콘 */
  icon: React.ReactNode
  /** 섹션 제목 */
  title: string
  /** 섹션 설명 */
  description: string
}

export interface UsageGuideProps {
  /** 가이드 제목 */
  title: string
  /** 가이드 섹션들 */
  sections: GuideSection[]
  /** 기본 열림 상태 (기본값: false) */
  defaultExpanded?: boolean
}

/**
 * UsageGuide React 컴포넌트
 *
 * 페이지 상단에 표시되는 사용 가이드
 * Progressive Disclosure: 기본적으로 접혀있고 사용자가 필요시 펼침
 *
 * @example
 * ```tsx
 * <UsageGuide
 *   title="고객관리 사용 가이드"
 *   sections={[
 *     {
 *       icon: <SFSymbol name="person.fill.badge.plus" />,
 *       title: "고객 등록",
 *       description: "새로운 고객 정보를 등록하고 관리합니다."
 *     }
 *   ]}
 * />
 * ```
 */
export const UsageGuide: React.FC<UsageGuideProps> = ({
  title,
  sections,
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  return (
    <div className={`usage-guide ${isExpanded ? 'usage-guide--expanded' : ''}`}>
      {/* 헤더 (항상 표시) */}
      <button
        className="usage-guide__header"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? '사용 가이드 접기' : '사용 가이드 펼치기'}
      >
        <div className="usage-guide__header-left">
          <svg width="14" height="14" viewBox="0 0 20 20" className="usage-guide__header-icon">
            <circle cx="10" cy="10" r="9" fill="var(--color-primary-500)"/>
            <text x="10" y="14" textAnchor="middle" fill="var(--color-text-inverse)" fontSize="12" fontWeight="bold">i</text>
          </svg>
          <span className="usage-guide__title">{title}</span>
        </div>
        <SFSymbol
          name={isExpanded ? 'chevron.up' : 'chevron.down'}
          size={SFSymbolSize.CAPTION_1}
          weight={SFSymbolWeight.SEMIBOLD}
          className="usage-guide__chevron"
        />
      </button>

      {/* 내용 (펼쳤을 때만 표시) */}
      {isExpanded && (
        <div className="usage-guide__content">
          <div className="usage-guide__sections">
            {sections.map((section, index) => (
              <div key={index} className="usage-guide__section">
                <div className="usage-guide__section-icon">
                  {section.icon}
                </div>
                <div className="usage-guide__section-text">
                  <h3 className="usage-guide__section-title">{section.title}</h3>
                  <p className="usage-guide__section-description">{section.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default UsageGuide
