import React from 'react';
import { Card } from 'antd';
import { UserOutlined } from '@ant-design/icons';

const CustomerManagementMain = () => {
  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <UserOutlined />
          <span className="text-xl font-semibold text-primary">고객 관리</span>
        </div>
      }
      className="h-screen-140 rounded-lg"
    >
      <div className="py-xl px-xl max-w-3xl mx-auto">
        {/* 제목 및 설명 */}
        <div className="text-center mb-xl">
          <UserOutlined className="text-6xl text-primary mb-xl" />
          <h2 className="text-3xl font-bold text-primary mb-lg">
            전문 보험 영업사를 위한 고객 관리 시스템
          </h2>
          <p className="text-lg text-secondary leading-relaxed m-0">
            인공지능 기반 고객 정보 분석과 체계적인 고객 관계 관리를 통해<br/>
            보험 영업의 효율성과 수익성을 극대화하세요.
          </p>
        </div>

        {/* 주요 기능 */}
        <div className="grid grid-cols-auto-fit gap-xl mb-xl">
          <div className="feature-card p-xl bg-secondary rounded-lg border border-medium">
            <h3 className="text-lg font-semibold text-primary mb-md">
              📊 전체 고객 보기
            </h3>
            <p className="text-secondary text-sm leading-normal m-0">
              전체 고객 데이터를 한눈에 보고, 검색과 필터를 통해 원하는 고객을 빠르게 찾을 수 있습니다.
            </p>
          </div>
          <div className="feature-card p-xl bg-secondary rounded-lg border border-medium">
            <h3 className="text-lg font-semibold text-primary mb-md">
              🌏 지역별 고객 관리
            </h3>
            <p className="text-secondary text-sm leading-normal m-0">
              지역별로 고객을 분류하고 관리하여, 지역 맞춤형 마케팅 전략을 수립할 수 있습니다.
            </p>
          </div>
          <div className="feature-card p-xl bg-secondary rounded-lg border border-medium">
            <h3 className="text-lg font-semibold text-primary mb-md">
              👥 관계별 네트워크 분석
            </h3>
            <p className="text-secondary text-sm leading-normal m-0">
              고개 인맥과 가족 관계를 시각적으로 분석하여, 추가 영업 기회를 발굴할 수 있습니다.
            </p>
          </div>
        </div>

        {/* 안내 메시지 */}
        <div className="info-panel" style={{
          textAlign: 'center',
          padding: '24px',
          backgroundColor: 'var(--color-bg-tertiary)',
          borderRadius: '8px',
          border: '1px solid var(--color-border-medium)'
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