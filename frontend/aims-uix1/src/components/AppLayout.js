import React, { useState } from 'react';
import { Layout, Menu, Input, Space, Button, Dropdown } from 'antd';
import {
  BellOutlined, UserOutlined, SearchOutlined,
  MenuUnfoldOutlined, MenuFoldOutlined,
} from '@ant-design/icons';
import LeftPane from './LeftPane';
import CenterPane from './CenterPane';
import RightPane from './RightPane';

const { Header, Content, Sider } = Layout;

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
      <Header className="site-layout-sub-header-background" style={{ padding: 0, background: '#fff', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space style={{ padding: '0 24px' }}>
          <h2 style={{ margin: 0 }}>AIMS-UIX1</h2>
          <Input
            placeholder="고객명·문서명 즉시 검색"
            prefix={<SearchOutlined />}
            style={{ width: 300, marginLeft: 20 }}
          />
        </Space>
        <Space style={{ padding: '0 24px' }}>
          <Button type="text" icon={<BellOutlined />} />
          <Dropdown overlay={menu} placement="bottomRight" arrow>
            <Button type="text" icon={<UserOutlined />} />
          </Dropdown>
        </Space>
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