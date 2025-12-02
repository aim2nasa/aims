/**
 * ContractImportView Component
 * @since 1.0.0
 *
 * 고객·계약 일괄등록 뷰 - Excel Refiner 통합
 * CenterPaneView 기반 구현
 */

import CenterPaneView from '../CenterPaneView/CenterPaneView'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../SFSymbol'
import ExcelRefiner from './components/ExcelRefiner'
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
      title="고객·계약 일괄등록"
      titleIcon={
        <span className="menu-icon-green">
          <SFSymbol
            name="tablecells"
            size={SFSymbolSize.CALLOUT}
            weight={SFSymbolWeight.MEDIUM}
          />
        </span>
      }
      onClose={onClose}
      placeholderIcon="tablecells"
      placeholderMessage="엑셀 파일에서 계약 정보를 일괄 등록합니다."
    >
      <div className="contract-import-view">
        <ExcelRefiner />
      </div>
    </CenterPaneView>
  )
}
