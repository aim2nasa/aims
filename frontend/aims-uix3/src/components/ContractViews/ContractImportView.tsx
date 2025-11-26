/**
 * ContractImportView Component
 * @since 1.0.0
 *
 * 계약 가져오기 뷰 (Excel Refiner 통합 예정)
 * CenterPaneView 기반 구현
 */

import CenterPaneView from '../CenterPaneView/CenterPaneView'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../SFSymbol'
import './ContractImportView.css'
import './ContractManagementView.css'

interface ContractImportViewProps {
  visible: boolean
  onClose: () => void
}

export default function ContractImportView({
  visible,
  onClose
}: ContractImportViewProps) {
  return (
    <CenterPaneView
      visible={visible}
      title="계약 가져오기"
      titleIcon={
        <span className="menu-icon-green">
          <SFSymbol
            name="arrow-right-square"
            size={SFSymbolSize.CALLOUT}
            weight={SFSymbolWeight.MEDIUM}
          />
        </span>
      }
      onClose={onClose}
      placeholderIcon="arrow-right-square"
      placeholderMessage="엑셀 파일에서 계약 정보를 가져옵니다."
    >
      <div className="contract-import-view">
        {/* Excel Refiner 기능이 여기에 통합됩니다 */}
      </div>
    </CenterPaneView>
  )
}
