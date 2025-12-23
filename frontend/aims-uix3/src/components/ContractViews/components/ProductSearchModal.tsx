/**
 * 보험상품 검색 모달
 * 미매칭 상품명 클릭 시 표시되어 정확한 상품명을 선택할 수 있게 함
 *
 * aims-uix3 공용 컴포넌트 사용:
 * - Modal: @/shared/ui/Modal
 * - Button: @/shared/ui/Button
 */

import { useState, useEffect, useMemo } from 'react'
import { Modal } from '@/shared/ui/Modal'
import { Button } from '@/shared/ui/Button'
import { fetchInsuranceProducts, type InsuranceProduct } from '@aims/excel-refiner-core'
import { errorReporter } from '@/shared/lib/errorReporter'
import './ProductSearchModal.css'

interface ProductSearchModalProps {
  isOpen: boolean
  onClose: () => void
  initialKeyword: string
  onSelect: (productName: string, productId: string, applyToAll: boolean) => void
}

export function ProductSearchModal({
  isOpen,
  onClose,
  initialKeyword,
  onSelect
}: ProductSearchModalProps) {
  const [keyword, setKeyword] = useState(initialKeyword)
  const [products, setProducts] = useState<InsuranceProduct[]>([])
  const [loading, setLoading] = useState(false)
  const [applyToAll, setApplyToAll] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<InsuranceProduct | null>(null)

  // 모달 열릴 때 상품 목록 로드 및 키워드 초기화
  useEffect(() => {
    if (isOpen) {
      setKeyword(initialKeyword)
      setSelectedProduct(null)
      loadProducts()
    }
  }, [isOpen, initialKeyword])

  // 보험상품 목록 로드
  const loadProducts = async () => {
    setLoading(true)
    try {
      const data = await fetchInsuranceProducts()
      setProducts(data)
    } catch (error) {
      console.error('보험상품 로드 오류:', error)
      errorReporter.reportApiError(error as Error, { component: 'ProductSearchModal.loadProducts' })
    } finally {
      setLoading(false)
    }
  }

  // 키워드로 필터링된 상품 목록
  const filteredProducts = useMemo(() => {
    if (!keyword.trim()) return products

    const normalizedKeyword = keyword.trim().toLowerCase().replace(/\s+/g, '')

    return products.filter(product => {
      const normalizedName = product.productName.toLowerCase().replace(/\s+/g, '')
      return normalizedName.includes(normalizedKeyword)
    })
  }, [products, keyword])

  // 검색 결과가 1개일 때 자동으로 일괄 적용 체크 및 자동 선택
  useEffect(() => {
    setApplyToAll(filteredProducts.length === 1)
    if (filteredProducts.length === 1 && filteredProducts[0]) {
      setSelectedProduct(filteredProducts[0])
    }
  }, [filteredProducts])

  // 상품 클릭 - 선택만 (적용은 확인 버튼으로)
  const handleItemClick = (product: InsuranceProduct) => {
    setSelectedProduct(product)
  }

  // 확인 버튼 - 실제 적용
  const handleConfirm = () => {
    if (!selectedProduct) return
    onSelect(selectedProduct.productName, selectedProduct._id, applyToAll)
    onClose()
  }

  const footer = (
    <div className="product-search-modal__footer-content">
      <Button variant="ghost" size="sm" onClick={onClose}>
        취소
      </Button>
      <Button
        variant="primary"
        size="sm"
        onClick={handleConfirm}
        disabled={!selectedProduct}
      >
        확인
      </Button>
    </div>
  )

  return (
    <Modal
      visible={isOpen}
      onClose={onClose}
      title="보험상품 검색"
      size="md"
      backdropClosable
      footer={footer}
    >
      <div className="product-search-modal__body">
        <div className="product-search-modal__search">
          <input
            type="text"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder="상품명 검색..."
            className="product-search-modal__input"
            autoFocus
          />
          <span className="product-search-modal__count">
            {filteredProducts.length}개 상품
          </span>
        </div>

        <div className="product-search-modal__hint">
          검색 결과가 없으면 키워드를 줄여보세요
        </div>

        <div className="product-search-modal__list">
          {loading ? (
            <div className="product-search-modal__loading">로딩 중...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="product-search-modal__empty">
              검색 결과가 없습니다
            </div>
          ) : (
            filteredProducts.map(product => (
              <button
                key={product._id}
                type="button"
                className={`product-search-modal__item ${selectedProduct?._id === product._id ? 'product-search-modal__item--selected' : ''}`}
                onClick={() => handleItemClick(product)}
              >
                {product.productName}
              </button>
            ))
          )}
        </div>

        {/* 일괄 적용 체크박스 (검색 결과 1개일 때 자동 체크) */}
        <div className="product-search-modal__apply-all">
          <label className="product-search-modal__checkbox-label">
            <input
              type="checkbox"
              checked={applyToAll}
              onChange={e => setApplyToAll(e.target.checked)}
            />
            <span>동일한 상품명 모두 변경</span>
          </label>
        </div>
      </div>
    </Modal>
  )
}

export default ProductSearchModal
