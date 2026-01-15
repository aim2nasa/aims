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
import { useDevModeStore } from '@/shared/store/useDevModeStore'
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
  const { isDevMode } = useDevModeStore() // 개발자 모드 상태

  return (
    <CenterPaneView
      visible={visible}
      title={isDevMode ? '고객·계약 일괄등록' : '고객 일괄등록'}
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
      placeholderMessage={isDevMode ? '엑셀 파일에서 계약 정보를 일괄 등록합니다.' : '엑셀 파일에서 고객 정보를 일괄 등록합니다.'}
      description={isDevMode ? '다수의 개인, 법인고객 및 계약내용들을 하나의 엑셀에 정리하여 일괄 등록할 수 있습니다.' : '다수의 개인, 법인고객을 하나의 엑셀에 정리하여 일괄 등록할 수 있습니다.'}
    >
      <div className="contract-import-view">
        <ExcelRefiner />
      </div>
    </CenterPaneView>
  )
}
