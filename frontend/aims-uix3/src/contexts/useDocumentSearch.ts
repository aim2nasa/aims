import { useContext } from 'react'
import {
  DocumentSearchContext,
  type DocumentSearchContextValue
} from './DocumentSearchContext.types'

export const useDocumentSearch = (): DocumentSearchContextValue => {
  const context = useContext(DocumentSearchContext)
  if (!context) {
    throw new Error('useDocumentSearch must be used within DocumentSearchProvider')
  }
  return context
}

export default useDocumentSearch
