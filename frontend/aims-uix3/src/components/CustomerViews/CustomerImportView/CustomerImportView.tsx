/**
 * CustomerImportView Component
 * 고객 일괄등록 뷰 - Excel 파일에서 고객 일괄 등록
 */

import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../SFSymbol'
import CustomerExcelImporter from './components/CustomerExcelImporter'
import './CustomerImportView.css'

interface CustomerImportViewProps {
  visible: boolean
  onClose: () => void
}

export default function CustomerImportView({
  visible,
  onClose
}: CustomerImportViewProps) {
  return (
    <CenterPaneView
      visible={visible}
      title="고객 일괄등록"
      titleIcon={
        <span className="menu-icon-blue">
          <SFSymbol
            name="person-2-fill"
            size={SFSymbolSize.CALLOUT}
            weight={SFSymbolWeight.MEDIUM}
          />
        </span>
      }
      onClose={onClose}
      placeholderIcon="person.crop.rectangle.stack"
      placeholderMessage="엑셀 파일에서 고객 정보를 일괄 등록합니다."
    >
      <div className="customer-import-view">
        <CustomerExcelImporter />
      </div>
    </CenterPaneView>
  )
}
