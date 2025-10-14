/**
 * AIMS Customer 고급 검색 바
 * 새 디자인 시스템 활용한 검색 기능
 */

import React, { useState, useEffect } from 'react';
import { SearchOutlined, FilterOutlined, ClearOutlined } from '@ant-design/icons';
import { Select, DatePicker, Tooltip } from 'antd';
import { Input, Button, Card, Badge } from './common';

const { RangePicker } = DatePicker;
const { Option } = Select;

const CustomerSearchBar = ({
  onSearch,
  onFilterChange,
  loading = false,
  rightActions
}) => {
  const [searchValue, setSearchValue] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filters, setFilters] = useState({
    customerType: '',
    region: '',
    dateRange: null,
    hasDocuments: ''
  });

  const [activeFilterCount, setActiveFilterCount] = useState(0);

  // 활성 필터 개수 계산
  useEffect(() => {
    const count = Object.values(filters).filter(value => {
      if (Array.isArray(value)) return value.length > 0;
      return value !== '' && value !== null;
    }).length;
    setActiveFilterCount(count);
  }, [filters]);

  const handleSearch = () => {
    onSearch?.(searchValue, filters);
  };

  const handleFilterChange = (key, value) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFilterChange?.(newFilters);
  };

  const handleClearAll = () => {
    setSearchValue('');
    setFilters({
      customerType: '',
      region: '',
      dateRange: null,
      hasDocuments: ''
    });
    onSearch?.('', {
      customerType: '',
      region: '',
      dateRange: null,
      hasDocuments: ''
    });
  };


  return (
    <Card className="customer-search-bar">
      <div className="search-main">
        <div className="search-input-group">
          <Input
            placeholder="고객명, 전화번호, 주소로 검색..."
            value={searchValue}
            onChange={(e) => {
              const newValue = e.target.value;
              setSearchValue(newValue);
              // 실시간 검색을 위해 onChange 시 onSearch 호출
              onSearch?.(newValue, filters);
            }}
            onPressEnter={handleSearch}
            prefix={<SearchOutlined className="search-icon" />}
            suffix={
              searchValue && (
                <Tooltip title="검색어 지우기">
                  <Button
                    size="small"
                    variant="ghost"
                    icon={<ClearOutlined />}
                    onClick={() => {
                      setSearchValue('');
                      // 검색어 초기화 시에도 실시간 검색 실행
                      onSearch?.('', filters);
                    }}
                    className="clear-btn"
                  />
                </Tooltip>
              )
            }
            allowClear
            size="large"
            className="search-input"
          />
        </div>
        
        <div className="search-actions">
          <Tooltip title="입력한 조건으로 고객을 검색합니다">
            <Button
              variant="primary"
              size="large"
              onClick={handleSearch}
              loading={loading}
              icon={<SearchOutlined />}
            >
              검색
            </Button>
          </Tooltip>
          
          <Badge count={activeFilterCount} size="small">
            <Tooltip title={showAdvanced ? "필터 옵션을 숨깁니다" : "고급 필터 옵션을 표시합니다"}>
              <Button
                variant={showAdvanced ? "primary" : "secondary"}
                size="large"
                onClick={() => setShowAdvanced(!showAdvanced)}
                icon={<FilterOutlined />}
              >
                필터
              </Button>
            </Tooltip>
          </Badge>
          
          {(searchValue || activeFilterCount > 0) && (
            <Tooltip title="검색어와 필터를 모두 초기화합니다">
              <Button
                variant="ghost"
                size="large"
                onClick={handleClearAll}
                icon={<ClearOutlined />}
              >
                초기화
              </Button>
            </Tooltip>
          )}
          
          {rightActions && rightActions}
        </div>
      </div>

      {showAdvanced && (
        <div className="search-advanced-inline">
          <div className="advanced-header">
            <FilterOutlined className="filter-icon" />
            <span>고급 검색 옵션</span>
          </div>
          
          <div className="filter-inline-container">
            <div className="filter-inline-group">
              <label>고객 유형</label>
              <Select
                placeholder="유형 선택"
                value={filters.customerType}
                onChange={(value) => handleFilterChange('customerType', value)}
                allowClear
                size="small"
                className="select-120"
              >
                <Option value="개인">개인</Option>
                <Option value="법인">법인</Option>
              </Select>
            </div>

            <div className="filter-inline-group">
              <label>지역</label>
              <Select
                placeholder="지역 선택"
                value={filters.region}
                onChange={(value) => handleFilterChange('region', value)}
                allowClear
                size="small"
                className="select-120"
              >
                <Option value="서울">서울</Option>
                <Option value="부산">부산</Option>
                <Option value="대구">대구</Option>
                <Option value="인천">인천</Option>
                <Option value="광주">광주</Option>
                <Option value="대전">대전</Option>
                <Option value="울산">울산</Option>
                <Option value="세종">세종</Option>
                <Option value="경기">경기</Option>
                <Option value="강원">강원</Option>
                <Option value="충북">충북</Option>
                <Option value="충남">충남</Option>
                <Option value="전북">전북</Option>
                <Option value="전남">전남</Option>
                <Option value="경북">경북</Option>
                <Option value="경남">경남</Option>
                <Option value="제주">제주</Option>
                <Option value="기타">기타</Option>
              </Select>
            </div>

            <div className="filter-inline-group">
              <label>등록일</label>
              <RangePicker
                placeholder={['시작일', '종료일']}
                value={filters.dateRange}
                onChange={(dates) => handleFilterChange('dateRange', dates)}
                size="small"
                className="select-240"
                format="YYYY-MM-DD"
              />
            </div>

            <div className="filter-inline-group">
              <label>문서 보유</label>
              <Select
                placeholder="문서 보유"
                value={filters.hasDocuments}
                onChange={(value) => handleFilterChange('hasDocuments', value)}
                allowClear
                size="small"
                className="select-100"
              >
                <Option value="true">있음</Option>
                <Option value="false">없음</Option>
              </Select>
            </div>
            
            <div className="filter-inline-actions">
              <Tooltip title="설정된 조건으로 고객을 필터링합니다">
                <Button onClick={handleSearch} variant="primary" size="small">
                  필터 적용
                </Button>
              </Tooltip>
              <Tooltip title="고급 필터 옵션을 숨깁니다">
                <Button onClick={() => setShowAdvanced(false)} variant="ghost" size="small">
                  접기
                </Button>
              </Tooltip>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default CustomerSearchBar;