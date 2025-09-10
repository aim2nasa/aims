import React from 'react';
import { Card } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';

const DocumentManagementMain = () => {
  return (
    <Card
      title={
        <div style={{ 
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <FileTextOutlined />
          <span style={{ fontSize: '20px', fontWeight: 600, color: 'var(--color-text-primary)' }}>문서 관리</span>
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
          <FileTextOutlined style={{ 
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
            AI 기반 지능형 문서 관리 시스템
          </h2>
          <p style={{
            fontSize: '18px',
            color: 'var(--color-text-secondary)',
            lineHeight: '1.6',
            marginBottom: '0'
          }}>
            보험 문서의 자동 분류, OCR 처리, 태깅 및 케이스 그룹화를 통해<br/>
            반복적인 사무 업무를 자동화하고 업무 효율성을 극대화하세요.
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
              📄 자동 문서 분류
            </h3>
            <p style={{ 
              color: 'var(--color-text-secondary)', 
              fontSize: '14px',
              lineHeight: '1.5',
              margin: '0'
            }}>
              AI가 업로드된 문서를 자동으로 분석하여 보험청구서, 진단서 등으로 자동 분류합니다.
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
              🔍 OCR 텍스트 추출
            </h3>
            <p style={{ 
              color: 'var(--color-text-secondary)', 
              fontSize: '14px',
              lineHeight: '1.5',
              margin: '0'
            }}>
              이미지와 PDF 문서에서 텍스트를 자동 추출하여 검색 가능한 데이터로 변환합니다.
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
              🏷️ 스마트 태깅
            </h3>
            <p style={{ 
              color: 'var(--color-text-secondary)', 
              fontSize: '14px',
              lineHeight: '1.5',
              margin: '0'
            }}>
              문서 내용을 분석하여 관련 태그를 자동 생성하고, 빠른 검색과 분류를 지원합니다.
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
              📁 케이스 그룹화
            </h3>
            <p style={{ 
              color: 'var(--color-text-secondary)', 
              fontSize: '14px',
              lineHeight: '1.5',
              margin: '0'
            }}>
              관련된 문서들을 사건별로 자동 그룹화하여 케이스 관리를 체계적으로 지원합니다.
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
            문서 처리 현황을 확인하려면
          </h4>
          <p style={{
            fontSize: '14px',
            color: 'var(--color-text-secondary)',
            margin: '0'
          }}>
            좌측 메뉴에서 '문서 처리 현황'을 클릭하여 실시간 문서 처리 상태를 모니터링하세요.
          </p>
        </div>
      </div>
    </Card>
  );
};

export default DocumentManagementMain;