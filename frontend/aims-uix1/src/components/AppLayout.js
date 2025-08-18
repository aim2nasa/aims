import React, { useState } from 'react';
import { Layout, Menu, Input, Space, Button, Dropdown, Select } from 'antd';
import {
  BellOutlined, UserOutlined, SearchOutlined,
  MenuUnfoldOutlined, MenuFoldOutlined,
} from '@ant-design/icons';
import LeftPane from './LeftPane';
import CenterPane from './CenterPane';
import RightPane from './RightPane';
import '../App.css'; 

const { Header, Content, Sider } = Layout;
const { Option } = Select;

const AppLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [rightPaneVisible, setRightPaneVisible] = useState(false);

  const handleDocumentClick = (doc) => {
    setSelectedDocument(doc);
    setRightPaneVisible(true);
  };

  const handleRightPaneCollapse = () => {
    setRightPaneVisible(!rightPaneVisible);
  };

  const menu = (
    <Menu
      items={[
        { key: '1', label: '로그아웃', },
        { key: '2', label: '설정', },
      ]}
    />
  );

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
          <Input.Group compact style={{ width: '100%' }}> {/* 이 부분을 100%로 수정했습니다. */}
            <Input
              placeholder="문서에서 키워드 검색 (예: 곽승철 p-47)"
              style={{ width: 'calc(100% - 80px)' }}
            />
            <Select defaultValue="and" style={{ width: 80 }}>
              <Option value="and">AND</Option>
              <Option value="or">OR</Option>
            </Select>
          </Input.Group>
          <Button
            type="primary"
            icon={<SearchOutlined />}
            style={{ marginLeft: 8 }}
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
            <LeftPane />
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
              <CenterPane onDocumentClick={handleDocumentClick} />
            </div>

            {/* Right Pane */}
            {rightPaneVisible && (
              <div style={{ width: '40%', minWidth: 400, background: '#fff', borderRadius: 8, padding: 24 }}>
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