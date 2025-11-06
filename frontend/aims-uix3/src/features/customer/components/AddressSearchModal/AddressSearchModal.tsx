import React, { useState, useRef, useEffect } from 'react';
import Modal from '@/shared/ui/Modal';
import { AddressApi, AddressSearchResult, FormattedAddress } from '../../api/addressApi';
import './AddressSearchModal.css';

export interface AddressSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddressSelect: (address: FormattedAddress) => void;
}

export const AddressSearchModal: React.FC<AddressSearchModalProps> = ({
  isOpen,
  onClose,
  onAddressSelect,
}) => {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<AddressSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isEnd, setIsEnd] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 모달 열릴 때 포커스
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // 주소 검색
  const searchAddress = async (keyword: string, page: number = 1, append: boolean = false) => {
    if (import.meta.env.DEV) {
      console.log('🔍 주소 검색 시작:', keyword, 'page:', page);
    }
    setLoading(true);

    const result = await AddressApi.searchAddress(keyword, page, 30);
    if (import.meta.env.DEV) {
      console.log('📡 검색 결과:', result);
    }

    if (result.success && result.data) {
      const newResults = result.data.results;

      if (append) {
        setSearchResults(prev => [...prev, ...newResults]);
      } else {
        setSearchResults(newResults);
      }

      setTotalCount(result.data.total);
      setCurrentPage(result.data.page);
      setIsEnd(result.data.is_end);

      if (!append && newResults.length > 0) {
        setSelectedIndex(0);
      }
    } else {
      if (!append) {
        setSearchResults([]);
      }
    }

    setLoading(false);
  };

  // 더 많은 결과 로드
  const loadMoreResults = async () => {
    if (!loading && !isEnd && searchKeyword.trim()) {
      await searchAddress(searchKeyword, currentPage + 1, true);
    }
  };

  // 주소 선택
  const handleAddressSelect = (addressData: AddressSearchResult) => {
    if (import.meta.env.DEV) {
      console.log('🏠 선택한 주소 원본 데이터:', addressData);
    }
    const newAddress = AddressApi.formatAddressForForm(addressData);
    if (import.meta.env.DEV) {
      console.log('📋 변환된 주소 데이터:', newAddress);
    }
    onAddressSelect(newAddress);
    onClose();
  };

  // 키보드 네비게이션
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (searchResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < searchResults.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev =>
          prev > 0 ? prev - 1 : searchResults.length - 1
        );
      } else if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault();
        const selected = searchResults[selectedIndex];
        if (selected) {
          handleAddressSelect(selected);
        }
      }
    }
  };

  // 선택된 항목 자동 스크롤
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }
    }
  }, [selectedIndex]);

  return (
    <Modal
      visible={isOpen}
      onClose={onClose}
      showHeader={false}
      backdropClosable={true}
      className="address-search-modal"
    >
        {/* 헤더 */}
        <div className="address-search-modal__header">
          <h2 id="address-search-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
            주소 검색
          </h2>
          <button
            className="address-search-modal__close"
            onClick={onClose}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* 검색 입력 */}
        <div className="address-search-modal__search">
          <div className="address-search-modal__input-wrapper">
            <svg className="address-search-modal__search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              className="address-search-modal__input"
              placeholder="도로명 또는 지번주소를 입력하세요"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onKeyDown={handleKeyDown}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  searchAddress(searchKeyword);
                }
              }}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <button
            className="address-search-modal__search-btn"
            onClick={() => searchAddress(searchKeyword)}
            disabled={loading}
          >
            {loading ? '검색 중...' : '검색'}
          </button>
        </div>

        {/* 검색 결과 */}
        <div className="address-search-modal__content">
          {searchResults.length > 0 && (
            <>
              <div className="address-search-modal__result-header">
                <span>검색 결과 ({searchResults.length}건{totalCount > searchResults.length ? ` / 총 ${totalCount}건` : ''})</span>
                {!isEnd && (
                  <button
                    className="address-search-modal__more-btn"
                    onClick={loadMoreResults}
                    disabled={loading}
                  >
                    더보기 +
                  </button>
                )}
              </div>
              <div className="address-search-modal__results" ref={listRef}>
                {searchResults.map((item, index) => (
                  <div
                    key={`${item.roadAddr}-${index}`}
                    className={`address-search-modal__item ${
                      selectedIndex === index ? 'address-search-modal__item--selected' : ''
                    }`}
                    onClick={() => handleAddressSelect(item)}
                  >
                    <div className="address-search-modal__item-main">
                      📮 {item.zipNo ? `${item.zipNo} | ` : ''}{item.roadAddrPart1}
                    </div>
                    {item.jibunAddr && item.jibunAddr !== item.roadAddrPart1 && (
                      <div className="address-search-modal__item-sub">
                        지번: {item.jibunAddr}
                      </div>
                    )}
                    {item.building_name && (
                      <div className="address-search-modal__item-building">
                        🏢 {item.building_name}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {!isEnd && (
                <button
                  className="address-search-modal__load-more"
                  onClick={loadMoreResults}
                  disabled={loading}
                >
                  {loading ? '로딩 중...' : `더 많은 결과 보기 (${totalCount - searchResults.length}건 더 있음)`}
                </button>
              )}
            </>
          )}

          {/* 검색 가이드 */}
          {searchResults.length === 0 && searchKeyword === '' && (
            <div className="address-search-modal__guide">
              <div className="address-search-modal__guide-content">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 16v-4m0-4h.01" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <div>
                  <div>도로명 또는 지번주소를 입력하세요</div>
                  <div className="address-search-modal__guide-example">
                    예: 테헤란로 123, 역삼동 123-45
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 검색 결과 없음 */}
          {searchResults.length === 0 && searchKeyword !== '' && !loading && (
            <div className="address-search-modal__empty">
              <div>검색 결과가 없습니다.</div>
              <div className="address-search-modal__empty-sub">
                다른 검색어로 다시 시도해보세요.
              </div>
            </div>
          )}
        </div>
    </Modal>
  );
};
