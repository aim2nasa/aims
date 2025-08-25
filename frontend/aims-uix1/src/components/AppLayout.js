import React, { useState } from 'react';
import { Layout, Menu, Input, Space, Button, Dropdown, Select, message } from 'antd';
import {
  BellOutlined, UserOutlined, SearchOutlined,
  MenuUnfoldOutlined, MenuFoldOutlined,
} from '@ant-design/icons';
import LeftPane from './LeftPane';
import CenterPane from './CenterPane';
import RightPane from './RightPane';
import axios from 'axios';
import '../App.css';

const { Header, Content, Sider } = Layout;
const { Option } = Select;

const AppLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [rightPaneVisible, setRightPaneVisible] = useState(false);
  
  // 검색 관련 상태
  const [keyword, setKeyword] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLogic, setSearchLogic] = useState('and');
  const [isLoading, setIsLoading] = useState(false);
  
  // DSD 관련 상태
  const [showDashboard, setShowDashboard] = useState(false);

  // 문서 상세 정보 조회 및 RightPane에 전달
  const handleDocumentClick = async (doc) => {
    // API 호출을 위한 ID 추출 (mock 데이터와 API 응답 필드명 분기)
    const docId = doc._id || doc.id;

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
      
      // ✅ 수정된 부분: URL 경로 수정
      let fileUrl = '';
      if (fileData.upload?.destPath) {
        // `destPath`에서 `/data`를 제거하고, 올바른 도메인과 경로를 조합
        const correctPath = fileData.upload.destPath.replace('/data', '');
        fileUrl = `https://tars.giize.com${correctPath}`;
      }

      // `destPath`를 `fileUrl`로 매핑하여 저장
      const updatedDoc = {
        ...fileData,
        fileUrl: fileUrl,
      };

      setSelectedDocument(updatedDoc);
      setRightPaneVisible(true);
      
    } catch (e) {
      message.error('파일 정보를 불러오는 중 오류가 발생했습니다.');
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRightPaneCollapse = () => {
    setRightPaneVisible(!rightPaneVisible);
    setSelectedDocument(null);
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
    
    // 검색 시 DSD 숨기고 검색 결과 표시
    setShowDashboard(false);
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

  // LeftPane에서 DSD 메뉴 클릭 처리
  const handleLeftPaneMenuClick = (menuKey) => {
    if (menuKey === 'dsd') {
      setShowDashboard(true);
      setSearchResults([]); // 검색 결과 초기화
      setKeyword(''); // 검색어 초기화
    } else {
      setShowDashboard(false);
    }
  };

  return (
    <Layout>
      {/* 📐 Header: 상단 고정 */}
      <Header style={{ 
        padding: '0 24px', 
        background: '#fff', 
        borderBottom: '1px solid #f0f0f0', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        height: '64px'
      }}>
        {/* 왼쪽 섹션 (AIMS-UIX1 글씨) */}
        <div style={{ display: 'flex', alignItems: 'center', flexGrow: 1, justifyContent: 'flex-start' }}>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>AIMS-UIX1</h2>
        </div>
        {/* 중앙 섹션 (검색창) */}
        <div style={{ display: 'flex', alignItems: 'center', flexGrow: 2, justifyContent: 'center' }}>
          <Input.Group compact style={{ flex: 1 }}>
            <Input
              placeholder="문서에서 키워드 검색 (예: 홍길동 보험 증권)"
              value={keyword}
              onChange={handleKeywordChange}
              onPressEnter={onSearch}
              style={{ width: 'calc(100% - 80px)' }}
            />
            <Select defaultValue="and" style={{ width: 80 }} onChange={handleLogicChange}>
              <Option value="and">AND</Option>
              <Option value="or">OR</Option>
            </Select>
          </Input.Group>
          <Button
            type="primary"
            icon={<SearchOutlined />}
            style={{ marginLeft: 8 }}
            onClick={onSearch}
            loading={isLoading}
          >
            Search
          </Button>
        </div>
        {/* 오른쪽 섹션 (아이콘) */}
        <div style={{ display: 'flex', alignItems: 'center', flexGrow: 1, justifyContent: 'flex-end' }}>
          <Space>
            <Button type="text" icon={<BellOutlined />} />
            <Dropdown overlay={menu} placement="bottomRight" arrow>
              <Button type="text" icon={<UserOutlined />} />
            </Dropdown>
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
          style={{ background: '#fff', borderRight: '1px solid #f0f0f0' }}
        >
          <div style={{ padding: 16 }}>
            <LeftPane onMenuClick={handleLeftPaneMenuClick} />
          </div>
          <div style={{ padding: '0 16px', textAlign: 'right', borderTop: '1px solid #f0f0f0' }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ padding: '4px', margin: '4px 0' }}
            />
          </div>
        </Sider>

        {/* 📐 Center Pane & Right Pane 컨테이너 */}
        <Layout>
          <Content style={{ display: 'flex', padding: 24, background: '#f5f5f5' }}>
            {/* Center Pane */}
            <div style={{ flex: 1, marginRight: rightPaneVisible ? 24 : 0 }}>
              <CenterPane 
                onDocumentClick={handleDocumentClick}
                searchResults={searchResults}
                isLoading={isLoading}
                showDashboard={showDashboard}
              />
            </div>

            {/* Right Pane */}
            {rightPaneVisible && (
			  <div style={{ width: '40%', minWidth: 400, background: '#fff', borderRadius: 8 }}>
                <RightPane
                  document={selectedDocument}
                  onClose={handleRightPaneCollapse}
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