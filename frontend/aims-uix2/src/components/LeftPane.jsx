import React, { useState } from 'react';
import { Tooltip } from 'antd';
import { DashboardOutlined, SearchOutlined, UserOutlined, UnorderedListOutlined, TeamOutlined, EnvironmentOutlined, FileTextOutlined, RightOutlined } from '@ant-design/icons';

const LeftPane = ({ onMenuClick, hasSearchResults, searchResultsCount, collapsed }) => {
  const [selectedKey, setSelectedKey] = useState('dsd');
  const [expandedKeys, setExpandedKeys] = useState(collapsed ? [] : ['customers', 'documents']);

  // 메뉴 클릭 핸들러
  const handleMenuClick = (key) => {
    setSelectedKey(key);
    if (onMenuClick) {
      onMenuClick(key);
    }
  };

  // 메인 메뉴 확장/축소 핸들러
  const handleToggleExpand = (key, e) => {
    e.stopPropagation();
    if (collapsed) return;
    
    setExpandedKeys(prev => 
      prev.includes(key) 
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  };

  // 커스텀 메뉴 아이템 렌더링
  const CustomMenuItem = ({ item, isSubMenu = false }) => {
    const isSelected = selectedKey === item.key;
    const isExpanded = expandedKeys.includes(item.key);
    const hasChildren = item.children && item.children.length > 0;
    
    const className = `custom-menu-item ${
      isSubMenu ? 'sub-menu' : ''
    } ${collapsed ? 'collapsed' : ''} ${
      isSelected ? 'selected' : ''
    }`;

    const content = (
      <div 
        className={className}
        onClick={() => handleMenuClick(item.key)}
      >
        {item.icon}
        <span className="custom-menu-item-text">{item.label}</span>
        {hasChildren && !collapsed && (
          <RightOutlined 
            className={`custom-menu-expand ${isExpanded ? 'expanded' : ''}`}
            onClick={(e) => handleToggleExpand(item.key, e)}
          />
        )}
      </div>
    );

    return (
      <div key={item.key}>
        <Tooltip title={item.tooltipTitle} placement="right">
          {content}
        </Tooltip>
        {hasChildren && !collapsed && isExpanded && (
          <div>
            {item.children.map(child => (
              <CustomMenuItem key={child.key} item={child} isSubMenu={true} />
            ))}
          </div>
        )}
      </div>
    );
  };

  // 메뉴 데이터 구조
  const menuItems = [
    ...(hasSearchResults ? [{
      key: 'search-results',
      icon: <SearchOutlined />,
      label: collapsed ? '' : `검색 결과 (${searchResultsCount || 0}개)`,
      tooltipTitle: `검색 결과 (${searchResultsCount || 0}개)`,
    }] : []),
    
    {
      key: 'customers',
      icon: <UserOutlined />,
      label: collapsed ? '' : '고객 관리',
      tooltipTitle: '고객 관리',
      children: collapsed ? null : [
        {
          key: 'customers-all',
          icon: <UnorderedListOutlined />,
          label: '전체보기',
          tooltipTitle: '모든 고객을 보여줍니다',
        },
        {
          key: 'customers-regional',
          icon: <EnvironmentOutlined />,
          label: '지역별 보기',
          tooltipTitle: '지역별로 고객을 분류하여 보여줍니다',
        },
        {
          key: 'customers-relationship',
          icon: <TeamOutlined />,
          label: '관계별 보기',
          tooltipTitle: '가족 관계별로 고객을 분류하여 보여줍니다',
        }
      ]
    },
    
    // collapsed 상태에서 서브메뉴들을 개별적으로 표시
    ...(collapsed ? [
      {
        key: 'customers-all',
        icon: <UnorderedListOutlined />,
        label: '',
        tooltipTitle: '모든 고객을 보여줍니다',
      },
      {
        key: 'customers-regional',
        icon: <EnvironmentOutlined />,
        label: '',
        tooltipTitle: '지역별로 고객을 분류하여 보여줍니다',
      },
      {
        key: 'customers-relationship',
        icon: <TeamOutlined />,
        label: '',
        tooltipTitle: '가족 관계별로 고객을 분류하여 보여줍니다',
      }
    ] : []),
    
    {
      key: 'documents',
      icon: <FileTextOutlined />,
      label: collapsed ? '' : '문서 관리',
      tooltipTitle: '문서 관리',
      children: collapsed ? null : [
        {
          key: 'dsd',
          icon: <DashboardOutlined />,
          label: '문서 처리 현황',
          tooltipTitle: '문서 처리 상태와 통계를 확인합니다',
        }
      ]
    },
    
    // collapsed 상태에서 문서 서브메뉴 표시
    ...(collapsed ? [{
      key: 'dsd',
      icon: <DashboardOutlined />,
      label: '',
      tooltipTitle: '문서 처리 상태와 통계를 확인합니다',
    }] : [])
  ];


  return (
    <div className="custom-menu">
      {menuItems.map(item => (
        <CustomMenuItem key={item.key} item={item} />
      ))}
    </div>
  );
};

export default LeftPane;