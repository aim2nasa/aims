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
        padding: '40px',
        maxWidth: '800px',
        margin: '0 auto'
      }}>
        {/* 제목 및 설명 */}
        <div style={{ 
          textAlign: 'center', 
          marginBottom: '40px' 
        }}>
          <UserOutlined style={{ 
            fontSize: '64px', 
            color: 'var(--color-primary)',
            marginBottom: '24px' 
          }} />
          <h2 style={{
            fontSize: '28px',
            fontWeight: 'bold',
            color: 'var(--color-text-primary)',
            marginBottom: '16px'
          }}>
            전문 보험 영업사를 위한 고객 관리 시스템
          </h2>
          <p style={{
            fontSize: '18px',
            color: 'var(--color-text-secondary)',
            lineHeight: '1.6',
            marginBottom: '0'
          }}>
            인공지능 기반 고객 정보 분석과 체계적인 고객 관계 관리를 통해<br/>
            보험 영업의 효율성과 수익성을 극대화하세요.
          </p>
        </div>

        {/* 주요 기능 */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
          gap: '24px',
          marginBottom: '40px'
        }}>
          <div style={{
            padding: '24px',
            backgroundColor: 'var(--color-bg-secondary)',
            borderRadius: '8px',
            border: '1px solid var(--color-border)'
          }}>
            <h3 style={{ 
              fontSize: '18px', 
              fontWeight: '600',
              color: 'var(--color-text-primary)',
              marginBottom: '12px'
            }}>
              📊 전체 고객 보기
            </h3>
            <p style={{ 
              color: 'var(--color-text-secondary)', 
              fontSize: '14px',
              lineHeight: '1.5',
              margin: '0'
            }}>
              전체 고객 데이터를 한눈에 보고, 검색과 필터를 통해 원하는 고객을 빠르게 찾을 수 있습니다.
            </p>
          </div>
          <div style={{
            padding: '24px',
            backgroundColor: 'var(--color-bg-secondary)',
            borderRadius: '8px',
            border: '1px solid var(--color-border)'
          }}>
            <h3 style={{ 
              fontSize: '18px', 
              fontWeight: '600',
              color: 'var(--color-text-primary)',
              marginBottom: '12px'
            }}>
              🌏 지역별 고객 관리
            </h3>
            <p style={{ 
              color: 'var(--color-text-secondary)', 
              fontSize: '14px',
              lineHeight: '1.5',
              margin: '0'
            }}>
              지역별로 고객을 분류하고 관리하여, 지역 맞춤형 마케팅 전략을 수립할 수 있습니다.
            </p>
          </div>
          <div style={{
            padding: '24px',
            backgroundColor: 'var(--color-bg-secondary)',
            borderRadius: '8px',
            border: '1px solid var(--color-border)'
          }}>
            <h3 style={{ 
              fontSize: '18px', 
              fontWeight: '600',
              color: 'var(--color-text-primary)',
              marginBottom: '12px'
            }}>
              👥 관계별 네트워크 분석
            </h3>
            <p style={{ 
              color: 'var(--color-text-secondary)', 
              fontSize: '14px',
              lineHeight: '1.5',
              margin: '0'
            }}>
              고개 인맥과 가족 관계를 시각적으로 분석하여, 추가 영업 기회를 발굴할 수 있습니다.
            </p>
          </div>
        </div>

        {/* 안내 메시지 */}
        <div style={{
          textAlign: 'center',
          padding: '24px',
          backgroundColor: 'var(--color-bg-tertiary)',
          borderRadius: '8px',
          border: '1px solid var(--color-border)'
        }}>
          <h4 style={{
            fontSize: '16px',
            fontWeight: '600',
            color: 'var(--color-text-primary)',
            marginBottom: '8px'
          }}>
            시작하려면 좌측 메뉴를 선택하세요
          </h4>
          <p style={{
            fontSize: '14px',
            color: 'var(--color-text-secondary)',
            margin: '0'
          }}>
            전체보기, 지역별 보기, 관계별 보기 중 원하는 메뉴를 클릭하여 고객 관리를 시작하세요.
          </p>
        </div>
      </div>
    </Card>
  );
};

export default CustomerManagementMain;