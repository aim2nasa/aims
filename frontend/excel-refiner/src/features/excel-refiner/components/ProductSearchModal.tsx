/**
 * 보험상품 검색 모달
 * 미매칭 상품명 클릭 시 표시되어 정확한 상품명을 선택할 수 있게 함
 */

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/shared/ui'
import { fetchInsuranceProducts } from '../hooks/useValidation'
import './ProductSearchModal.css'

interface InsuranceProduct {
  _id: string
  productName: string
}

interface ProductSearchModalProps {
  isOpen: boolean
  onClose: () => void
  initialKeyword: string
  onSelect: (productName: string, productId: string) => void
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

  // 모달 열릴 때 상품 목록 로드 및 키워드 초기화
  useEffect(() => {
    if (isOpen) {
      setKeyword(initialKeyword)
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

  // 상품 선택
  const handleSelect = (product: InsuranceProduct) => {
    onSelect(product.productName, product._id)
    onClose()
  }

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="product-search-modal__overlay" onClick={onClose}>
      <div
        className="product-search-modal__content"
        onClick={e => e.stopPropagation()}
      >
        <div className="product-search-modal__header">
          <h3>보험상품 검색</h3>
          <button
            type="button"
            className="product-search-modal__close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

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
                className="product-search-modal__item"
                onClick={() => handleSelect(product)}
              >
                {product.productName}
              </button>
            ))
          )}
        </div>

        <div className="product-search-modal__footer">
          <Button variant="ghost" size="sm" onClick={onClose}>
            취소
          </Button>
        </div>
      </div>
    </div>
  )
}

export default ProductSearchModal
