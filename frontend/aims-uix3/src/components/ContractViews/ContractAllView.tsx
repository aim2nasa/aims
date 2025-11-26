/**
 * ContractAllView Component
 * @since 1.0.0
 *
 * 전체계약 뷰
 * CenterPaneView 기반 구현
 */

import CenterPaneView from '../CenterPaneView/CenterPaneView'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../SFSymbol'
import './ContractAllView.css'
import './ContractManagementView.css'

interface ContractAllViewProps {
  visible: boolean
  onClose: () => void
}

export default function ContractAllView({
  visible,
  onClose
}: ContractAllViewProps) {
  return (
    <CenterPaneView
      visible={visible}
      title="전체계약"
      titleIcon={
        <span className="menu-icon-purple">
          <SFSymbol
            name="tablecells"
            size={SFSymbolSize.CALLOUT}
            weight={SFSymbolWeight.MEDIUM}
          />
        </span>
      }
      onClose={onClose}
      placeholderIcon="tablecells"
      placeholderMessage="전체계약 목록이 여기에 표시됩니다."
    >
      <div className="contract-all-view">
        {/* 계약 목록이 여기에 표시됩니다 */}
      </div>
    </CenterPaneView>
  )
}
