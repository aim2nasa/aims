import React from 'react';
import { Card } from 'antd';
import { UserOutlined } from '@ant-design/icons';

const CustomerManagementMain = () => {
  return (
    <Card
      title={
        <div style={{ 
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <UserOutlined />
          <span style={{ fontSize: '20px', fontWeight: 600, color: 'var(--color-text-primary)' }}>고객 관리</span>
        </div>
      }
      style={{ 
        height: 'calc(100vh - 140px)', 
        borderRadius: 8 
      }}
    >
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '400px',
        color: 'var(--color-text-secondary)',
        fontSize: '16px'
      }}>
        <UserOutlined style={{ fontSize: '48px', marginBottom: '16px', color: 'var(--color-text-tertiary)' }} />
        <span>고객 관리 메뉴를 선택하세요.</span>
        <span style={{ fontSize: '14px', marginTop: '8px', color: 'var(--color-text-tertiary)' }}>
          좌측 메뉴에서 전체보기, 지역별 보기, 관계별 보기 중 하나를 선택하세요.
        </span>
      </div>
    </Card>
  );
};

export default CustomerManagementMain;