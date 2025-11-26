/**
 * ContractManagementView Component
 * @since 1.0.0
 *
 * 계약 관리 메인 뷰
 * CenterPaneView 기반 구현
 */

import CenterPaneView from '../CenterPaneView/CenterPaneView'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../SFSymbol'
import './ContractManagementView.css'

interface ContractManagementViewProps {
  visible: boolean
  onClose: () => void
  onNavigate?: (key: string) => void
}

export default function ContractManagementView({
  visible,
  onClose,
  onNavigate
}: ContractManagementViewProps) {
  return (
    <CenterPaneView
      visible={visible}
      title="계약 관리"
      titleIcon={
        <span className="menu-icon-blue">
          <SFSymbol
            name="briefcase-fill"
            size={SFSymbolSize.CALLOUT}
            weight={SFSymbolWeight.MEDIUM}
          />
        </span>
      }
      onClose={onClose}
      placeholderIcon="briefcase-fill"
      placeholderMessage="계약 관리 메뉴입니다. 하위 메뉴를 선택해주세요."
    >
      <div className="contract-management-view">
        <div className="contract-management-view__menu-cards">
          <button
            type="button"
            className="contract-management-view__menu-card"
            onClick={() => onNavigate?.('contracts-all')}
          >
            <span className="menu-icon-purple">
              <SFSymbol
                name="tablecells"
                size={SFSymbolSize.CALLOUT}
                weight={SFSymbolWeight.MEDIUM}
              />
            </span>
            <span>전체 계약 보기</span>
          </button>
          <button
            type="button"
            className="contract-management-view__menu-card"
            onClick={() => onNavigate?.('contracts-import')}
          >
            <span className="menu-icon-green">
              <SFSymbol
                name="arrow-right-square"
                size={SFSymbolSize.CALLOUT}
                weight={SFSymbolWeight.MEDIUM}
              />
            </span>
            <span>계약 가져오기</span>
          </button>
        </div>
      </div>
    </CenterPaneView>
  )
}
