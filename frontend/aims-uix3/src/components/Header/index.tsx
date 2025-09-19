/**
 * Header Component Integration
 * @since 1.0.0
 *
 * Document-Controller-View 패턴 통합
 * ARCHITECTURE.md 준수: Controller Hook과 View 분리를 통한 완전한 관심사 분리
 */

import React from 'react'
import { HeaderProps } from './Header.types'
import { useHeaderController } from './HeaderController'
import HeaderView from './HeaderView'

/**
 * Header 컴포넌트
 *
 * Document-Controller-View 패턴의 완성체:
 * - Document: HeaderProps 인터페이스로 데이터 구조 정의
 * - Controller: useHeaderController Hook으로 비즈니스 로직 처리
 * - View: HeaderView 컴포넌트로 순수 렌더링 담당
 *
 * 애플 디자인 철학 구현:
 * - Progressive Disclosure: "Invisible until you need it"
 * - Deference: UI가 콘텐츠를 방해하지 않음
 * - Clarity: 필요할 때만 명확하게 표시
 */
const Header: React.FC<HeaderProps> = (props) => {
  // Controller Hook으로 비즈니스 로직 처리
  const controller = useHeaderController()

  // View 컴포넌트로 순수 렌더링 위임
  return <HeaderView {...props} controller={controller} />
}

export default Header