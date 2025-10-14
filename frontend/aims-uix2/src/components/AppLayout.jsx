import React, { useState } from 'react';
import { Layout, Menu, Input, Space, Button, Dropdown, Select, message, Tooltip } from 'antd';
import {
  BellOutlined, UserOutlined, SearchOutlined,
  MenuUnfoldOutlined, MenuFoldOutlined,
} from '@ant-design/icons';
import ThemeToggle from './ThemeToggle';
import LeftPane from './LeftPane';
import CenterPane from './CenterPane';
import RightPane from './RightPane';
import axios from 'axios';
import { extractDocumentId, createDocumentObject } from '../utils/documentHelper';

const { Header, Content, Sider } = Layout;
const { Option } = Select;

const AppLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  
  // Right 패널 통합 상태 관리
  const [rightPaneContent, setRightPaneContent] = useState(null); // 'document' | 'customer' | null
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [rightPaneVisible, setRightPaneVisible] = useState(false);
  
  // 검색 관련 상태
  const [keyword, setKeyword] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLogic, setSearchLogic] = useState('and');
  const [isLoading, setIsLoading] = useState(false);
  
  // DSD 관련 상태
  const [showDashboard, setShowDashboard] = useState(false);
  
  // 고객 관리 관련 상태
  const [showCustomerManagement, setShowCustomerManagement] = useState(false);
  const [showCustomerManagementMain, setShowCustomerManagementMain] = useState(false);
  const [selectedMenuKey, setSelectedMenuKey] = useState(null);
  
  // 문서 관리 관련 상태
  const [showDocumentManagementMain, setShowDocumentManagementMain] = useState(false);
  
  // 고객 수정 모달 관련 상태
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  
  // 리사이즈 관련 상태
  const OPTIMAL_RIGHT_PANE_WIDTH = 50; // PDF/이미지 뷰어 최적 비율: 50%
  const MIN_CENTER_PANE_WIDTH = 620; // 문서수 칼럼 숫자가 완전히 보이도록 CenterPane 최소 너비 (px)
  const [rightPaneWidth, setRightPaneWidth] = useState(OPTIMAL_RIGHT_PANE_WIDTH);
  const [isResizing, setIsResizing] = useState(false);

  // 문서 상세 정보 조회 및 RightPane에 전달
  const handleDocumentClick = async (doc) => {
    const docId = extractDocumentId(doc);

    if (!docId) {
      message.error('문서 ID가 없어 상세 정보를 불러올 수 없습니다.');
      return;
    }

    try {
      setIsLoading(true);
      const response = await axios.post('https://n8nd.giize.com/webhook/smartsearch', {
        id: docId
      });

      const fileData = response.data[0];
      const updatedDoc = createDocumentObject(fileData);

      // Right 패널을 문서 모드로 설정
      setSelectedDocument(updatedDoc);
      setSelectedCustomer(null);
      setRightPaneContent('document');
      setRightPaneVisible(true);
      
    } catch (e) {
      message.error('파일 정보를 불러오는 중 오류가 발생했습니다.');
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  // 문서 프리뷰 (파일명 클릭 시)
  const handleDocumentPreview = async (doc) => {
    const docId = extractDocumentId(doc);

    if (!docId) {
      message.error('문서 ID가 없어 프리뷰를 불러올 수 없습니다.');
      return;
    }

    try {
      setIsLoading(true);
      const response = await axios.post('https://n8nd.giize.com/webhook/smartsearch', {
        id: docId
      });

      const fileData = response.data[0];
      const updatedDoc = createDocumentObject(fileData);

      // Right 패널을 문서 모드로 설정 (프리뷰)
      setSelectedDocument(updatedDoc);
      setSelectedCustomer(null);
      setRightPaneContent('document');
      setRightPaneVisible(true);
      
    } catch (e) {
      message.error('파일 프리뷰를 불러오는 중 오류가 발생했습니다.');
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  // 고객 상세 정보 조회 및 RightPane에 전달
  const handleCustomerClick = async (customerId) => {
    try {
      setIsLoading(true);
      const response = await axios.get(`http://tars.giize.com:3010/api/customers/${customerId}`);
      
      if (response.data.success) {
        // Right 패널을 고객 모드로 설정
        setSelectedCustomer(response.data.data);
        setSelectedDocument(null);
        setRightPaneContent('customer');
        setRightPaneVisible(true);
      }
    } catch (error) {
      message.error('고객 정보를 불러오는데 실패했습니다.');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // 고객 정보 새로고침 (문서 연결 후 호출)
  const refreshSelectedCustomer = async () => {
    if (selectedCustomer && selectedCustomer._id) {
      try {
        const response = await axios.get(`http://tars.giize.com:3010/api/customers/${selectedCustomer._id}`);
        if (response.data.success) {
          setSelectedCustomer(response.data.data);
        }
      } catch (error) {
        console.error('고객 정보 새로고침 실패:', error);
      }
    }
  };

  // 문서 연결 후 검색 결과 업데이트
  const handleDocumentLinked = async (linkedDocumentId, customerInfo) => {
    // 우측 패널 고객 정보 새로고침
    await refreshSelectedCustomer();
    
    // 검색 결과에서 연결된 문서의 customer_relation 상태 업데이트
    if (searchResults && searchResults.length > 0) {
      setSearchResults(prevResults => 
        prevResults.map(doc => 
          doc._id === linkedDocumentId || doc.id === linkedDocumentId
            ? { ...doc, customer_relation: customerInfo }
            : doc
        )
      );
    }
  };

  // 고객 수정 함수 - CustomerManagement의 openCustomerModal을 호출하도록 함
  const handleEditCustomer = (customer) => {
    setEditingCustomer(customer);
    setEditModalVisible(true);
  };

  // 고객 목록 새로고침 콜백 상태
  const [refreshCustomerList, setRefreshCustomerList] = useState(null);

  // 고객 삭제 함수
  const handleDeleteCustomer = async (customerId) => {
    try {
      const response = await axios.delete(`http://tars.giize.com:3010/api/customers/${customerId}`);
      if (response.data.success) {
        message.success('고객이 삭제되었습니다.');
        // 삭제된 고객이 현재 선택된 고객이면 우측 패널 닫기
        if (selectedCustomer && selectedCustomer._id === customerId) {
          handleRightPaneCollapse();
        }
        // 고객 목록 및 관계 트리 새로고침
        if (refreshCustomerList) {
          refreshCustomerList();
        }
        // 관계 트리 새로고침
        window.dispatchEvent(new CustomEvent('customerDeleted'));
      }
    } catch (error) {
      message.error('고객 삭제에 실패했습니다.');
      console.error(error);
    }
  };

  const handleRightPaneCollapse = () => {
    setRightPaneVisible(false);
    setSelectedDocument(null);
    setSelectedCustomer(null);
    setRightPaneContent(null);
  };

  const menu = (
    <Menu
      items={[
        { key: '1', label: '로그아웃', },
        { key: '2', label: '설정', },
      ]}
    />
  );
  
  const handleKeywordChange = (e) => {
    setKeyword(e.target.value);
  };

  const handleLogicChange = (value) => {
    setSearchLogic(value);
  };
  
  const onSearch = async () => {
    if (!keyword) {
      message.warning('검색어를 입력해주세요.');
      return;
    }
    
    // 검색 시 DSD와 고객관리, 문서관리 화면 모두 숨기고 검색 결과 표시
    setShowDashboard(false);
    setShowCustomerManagement(false);
    setShowCustomerManagementMain(false);
    setShowDocumentManagementMain(false);
    setIsLoading(true);
    setSearchResults([]);

    try {
      const response = await axios.post('https://n8nd.giize.com/webhook/smartsearch', {
        query: keyword,
        mode: searchLogic,
      });
      setSearchResults(response.data);
    } catch (e) {
      message.error('검색 중 오류가 발생했습니다.');
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  // LeftPane에서 메뉴 클릭 처리
  const handleLeftPaneMenuClick = (menuKey) => {
    if (menuKey === 'customers') {
      // "고객 관리" 메뉴 클릭 시 - 전용 페이지 표시
      setShowCustomerManagementMain(true);
      setShowCustomerManagement(false);
      setShowDocumentManagementMain(false);
      setShowDashboard(false);
      setSelectedMenuKey(menuKey);
    } else if (menuKey === 'customers-all' || menuKey === 'customers-regional' || menuKey === 'customers-relationship') {
      // 실제 고객 관리 기능들
      setShowCustomerManagement(true);
      setShowCustomerManagementMain(false);
      setShowDocumentManagementMain(false);
      setShowDashboard(false);
      setSelectedMenuKey(menuKey);
    } else if (menuKey === 'documents') {
      // "문서 관리" 메뉴 클릭 시 - 전용 페이지 표시
      setShowDocumentManagementMain(true);
      setShowDashboard(false);
      setShowCustomerManagement(false);
      setShowCustomerManagementMain(false);
      setSelectedMenuKey(menuKey);
    } else if (menuKey === 'dsd') {
      setShowDashboard(true);
      setShowCustomerManagement(false);
      setShowCustomerManagementMain(false);
      setShowDocumentManagementMain(false);
      setSelectedMenuKey(null);
    } else if (menuKey === 'search-results') {
      // 검색 결과로 돌아가기
      setShowDashboard(false);
      setShowCustomerManagement(false);
      setShowCustomerManagementMain(false);
      setShowDocumentManagementMain(false);
      setSelectedMenuKey(null);
    } else {
      setShowDashboard(false);
      setShowCustomerManagement(false);
      setShowCustomerManagementMain(false);
      setShowDocumentManagementMain(false);
      setSelectedMenuKey(null);
      // 다른 메뉴 클릭 시에는 검색 결과 초기화
      if (menuKey !== 'search-results') {
        setSearchResults([]);
        setKeyword('');
      }
    }
  };

  // 최적 비율로 리셋하는 함수
  const resetToOptimalRatio = () => {
    setRightPaneWidth(OPTIMAL_RIGHT_PANE_WIDTH);
  };

  // 리사이즈 핸들러
  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsResizing(true);
  };

  // 문서 연결 해제 전역 함수 등록
  React.useEffect(() => {
    const handleDocumentUnlinked = (documentId) => {
      // 검색 결과에서 해당 문서의 customer_relation 제거
      setSearchResults(prevResults => {
        if (!prevResults || prevResults.length === 0) {
          return prevResults;
        }
        
        return prevResults.map(doc => {
          const docId = doc._id || doc.id;
          if (docId === documentId) {
            return { ...doc, customer_relation: undefined };
          }
          return doc;
        });
      });
    };

    // 전역 함수로 등록
    window.handleDocumentUnlinked = handleDocumentUnlinked;
    
    return () => {
      window.handleDocumentUnlinked = null;
    };
  }, []);

  // 마우스 이벤트 리스너 등록
  React.useEffect(() => {
    const handleGlobalMouseMove = (e) => {
      if (!isResizing) return;
      
      const contentElement = document.querySelector('[data-testid="content-container"]');
      if (!contentElement) return;
      
      const containerRect = contentElement.getBoundingClientRect();
      const mouseX = e.clientX - containerRect.left;
      const containerWidth = containerRect.width;
      
      // 새로운 RightPane 너비를 퍼센트로 계산
      const newRightPaneWidth = ((containerWidth - mouseX) / containerWidth) * 100;
      
      // CenterPane의 최소 너비 계산 (고객명 칼럼 보호)
      const minCenterPanePercent = (MIN_CENTER_PANE_WIDTH / containerWidth) * 100;
      const maxRightPaneWidth = Math.max(20, 100 - minCenterPanePercent);
      
      // 최소 20%, 동적 최대값 제한 (고객명 칼럼 보호)
      const clampedWidth = Math.max(20, Math.min(maxRightPaneWidth, newRightPaneWidth));
      setRightPaneWidth(clampedWidth);
    };

    const handleGlobalMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  return (
    <Layout>
      {/* 📐 Header: 상단 고정 */}
      <Header className="px-lg bg-header border-b flex items-center header-64" style={{ justifyContent: 'space-between', position: 'relative' }}>
        {/* 왼쪽 섹션 (AIMS-UIX2 글씨) */}
        <div style={{ flex: '0 0 auto' }}>
            <h2 className="app-title m-0 text-xl font-bold text-primary">AIMS-UIX2</h2>
        </div>
        
        {/* 중앙 섹션 (검색창) - 절대 중앙 배치 */}
        <div style={{ 
          position: 'absolute', 
          left: '50%', 
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <div style={{ display: 'flex' }}>
            <Tooltip title="문서에서 검색할 키워드를 입력하세요">
              <Input
                placeholder="문서에서 키워드 검색 (예: 홍길동 보험 증권)"
                value={keyword}
                onChange={handleKeywordChange}
                onPressEnter={onSearch}
                style={{ 
                  borderTopRightRadius: 0, 
                  borderBottomRightRadius: 0,
                  width: '450px'
                }}
              />
            </Tooltip>
            <Tooltip title="검색 조건을 선택하세요 (AND: 모든 키워드 포함, OR: 중 하나 포함)">
              <Select 
                defaultValue="and" 
                onChange={handleLogicChange}
                style={{ 
                  borderTopLeftRadius: 0, 
                  borderBottomLeftRadius: 0, 
                  borderLeft: 0,
                  width: '90px'
                }}
              >
              <Option value="and">AND</Option>
              <Option value="or">OR</Option>
              </Select>
            </Tooltip>
          </div>
          <Tooltip title="입력한 키워드로 문서를 검색합니다">
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={onSearch}
              loading={isLoading}
              className="aims-btn-primary"
              style={{ 
                width: '90px'
              }}
            >
              Search
            </Button>
          </Tooltip>
        </div>
        
        {/* 오른쪽 섹션 (아이콘) */}
        <div style={{ flex: '0 0 auto' }}>
          <Space>
            <Tooltip title="알림">
              <Button type="text" icon={<BellOutlined style={{ color: '#f59e0b' }} />} />
            </Tooltip>
            <Tooltip title="사용자 메뉴">
              <Dropdown overlay={menu} placement="bottomRight" arrow>
                <Button type="text" icon={<UserOutlined style={{ color: '#3b82f6' }} />} />
              </Dropdown>
            </Tooltip>
            <ThemeToggle />
          </Space>
        </div>
      </Header>
      
      <Layout>
        {/* 📐 Left Pane: 사이드바 */}
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={(value) => setCollapsed(value)}
          width={280}
          trigger={null}
          className="bg-sidebar overflow-hidden flex-column"
        >
          <div className="flex-auto overflow-auto p-lg">
            <LeftPane 
              onMenuClick={handleLeftPaneMenuClick}
              hasSearchResults={searchResults && searchResults.length > 0}
              searchResultsCount={searchResults ? searchResults.length : 0}
              collapsed={collapsed}
            />
          </div>
          <div className="flex-none px-lg text-right border-t">
            <Tooltip title={collapsed ? "메뉴 펼치기" : "메뉴 접기"}>
              <Button
                type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed(!collapsed)}
                className="p-1 my-1"
              />
            </Tooltip>
          </div>
        </Sider>

        {/* 📐 Center Pane & Right Pane 컨테이너 */}
        <Layout>
          <Content 
            data-testid="content-container"
            className="flex p-lg bg-secondary relative"
          >
            {/* Center Pane */}
            <div 
              className="overflow-hidden content-with-dynamic-width"
              style={{
                '--content-width': rightPaneVisible ? `${100 - rightPaneWidth}%` : '100%',
                '--content-margin-right': rightPaneVisible ? '0px' : '0', /* 마진 제거 */
                '--content-transition': isResizing ? 'none' : 'width 0.3s ease'
              }}>
              <CenterPane 
                onDocumentClick={handleDocumentClick}
                onDocumentPreview={handleDocumentPreview}
                onCustomerClick={handleCustomerClick}
                searchResults={searchResults}
                isLoading={isLoading}
                showDashboard={showDashboard}
                showCustomerManagement={showCustomerManagement}
                showCustomerManagementMain={showCustomerManagementMain}
                showDocumentManagementMain={showDocumentManagementMain}
                selectedMenuKey={selectedMenuKey}
                onDocumentLinked={handleDocumentLinked}
                editModalVisible={editModalVisible}
                editingCustomer={editingCustomer}
                onEditModalClose={() => {
                  setEditModalVisible(false);
                  setEditingCustomer(null);
                }}
                onCustomerUpdated={() => {
                  refreshSelectedCustomer();
                  setEditModalVisible(false);
                  setEditingCustomer(null);
                }}
                onRefreshCustomerListSet={setRefreshCustomerList}
                rightPaneVisible={rightPaneVisible}
              />
            </div>

            {/* 리사이즈 핸들 */}
            {rightPaneVisible && (
              <div
                onMouseDown={handleMouseDown}
                className="cursor-col-resize resize-handle"
                style={{
                  '--resize-bg': isResizing ? 'var(--color-primary)' : 'transparent',
                  position: 'absolute',
                  left: `calc(${100 - rightPaneWidth}% - 12px)`, /* padding 고려한 정확한 계산 */
                  top: 0,
                  transform: 'translateX(-50%)',
                  zIndex: 20
                }}
              >
                <div className="resize-grip">
                  {/* 별도 선 제거 - 깔끔한 단일 핸들만 */}
                </div>
              </div>
            )}

            {/* Right Pane */}
            {rightPaneVisible && (
              <div 
                data-testid="right-pane"
                className="bg-transparent rounded-lg transition-all right-pane-container"
                style={{
                  '--right-pane-width': `${rightPaneWidth}%`,
                  '--right-pane-transition': isResizing ? 'none' : 'width 0.3s ease'
                }}
              >
                <RightPane
                  contentType={rightPaneContent}
                  document={selectedDocument}
                  customer={selectedCustomer}
                  onClose={handleRightPaneCollapse}
                  onResetRatio={resetToOptimalRatio}
                  onEditCustomer={handleEditCustomer}
                  onDeleteCustomer={handleDeleteCustomer}
                  onCustomerSelect={handleCustomerClick}
                />
              </div>
            )}
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
};

export default AppLayout;