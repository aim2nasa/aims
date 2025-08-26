import React, { useState } from 'react';
import { Card, List, Typography, Button, Space, Tag, Select, Tree, Spin, Modal, Pagination, message } from 'antd';
import { UnorderedListOutlined, AppstoreOutlined, FileTextOutlined, FolderOutlined, UploadOutlined, SettingOutlined, PlusOutlined, MinusOutlined, ReadOutlined } from '@ant-design/icons';
import FileUploader from './FileUploader';
import DocumentStatusDashboard from './DocumentStatusDashboard';
import axios from 'axios';

const { Title, Text } = Typography;
const { Option } = Select;

// ✅ 향후 테스트를 위해 Mock 데이터는 그대로 유지합니다.
const mockTreeDocuments = [
  {
    title: '2025년 계약 문서',
    key: '0-0',
    icon: <FolderOutlined />,
    children: [
      {
        title: '2025년 보험 가입 설계서',
        key: '0-0-0',
        icon: <FileTextOutlined />,
        data: { id: 1, name: '2025년 보험 가입 설계서', type: '계약서', date: '2025-08-15', status: '정상', fileUrl: '/test.pdf', ocr: { confidence: 0.95 } },
      },
      {
        title: '주택 화재 보험 계약서',
        key: '0-0-1',
        icon: <FileTextOutlined />,
        data: { id: 4, name: '주택 화재 보험 계약서', type: '계약서', date: '2025-07-20', status: '정상', fileUrl: '/test.pdf', ocr: { confidence: 0.88 } },
      },
    ],
  },
  {
    title: '기타 문서',
    key: '0-1',
    icon: <FolderOutlined />,
    children: [
      {
        title: '치과 진료비 청구서',
        key: '0-1-0',
        icon: <FileTextOutlined />,
        data: { id: 2, name: '치과 진료비 청구서', type: '청구서', date: '2025-08-10', status: '처리중', fileUrl: '/test.pdf', ocr: { confidence: 0.72 } },
      },
      {
        title: '자동차 보험증권',
        key: '0-1-1',
        icon: <FileTextOutlined />,
        data: { id: 3, name: '자동차 보험증권', type: '보험증권', date: '2025-07-28', status: '정상', fileUrl: '/test.pdf', ocr: { confidence: 0.99 } },
      },
    ],
  },
];


const CenterPane = ({ onDocumentClick, searchResults, isLoading, showDashboard }) => {
  const [viewMode, setViewMode] = useState('list');
  const [uploadedFiles, setUploadedFiles] = useState([]); // 업로드된 파일 목록 상태 추가
  const [isModalVisible, setIsModalVisible] = useState(false); // 모달 가시성 상태 추가
  
  // 페이지네이션 관련 상태
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showPageSizeModal, setShowPageSizeModal] = useState(false);
  
  // Full text 모달 관련 상태
  const [showFullTextModal, setShowFullTextModal] = useState(false);
  const [selectedDocumentForFullText, setSelectedDocumentForFullText] = useState(null);
  const [fullTextContent, setFullTextContent] = useState('');
  
  const handleUploadSuccess = (file) => {
    // 파일 업로드 성공 시 즉시 Dashboard에 표시할 임시 문서 생성
    const tempDocument = {
      id: `temp-${Date.now()}-${Math.random()}`,
      upload: { 
        originalName: file.name,
        uploaded_at: new Date().toISOString()
      },
      status: 'processing', // 처리 중 상태로 시작
      progress: 10, // 업로드 완료로 10% 진행률
      stages: {
        upload: {
          originalName: file.name,
          uploaded_at: new Date().toISOString(),
          status: 'completed'
        }
      }
    };
    
    // 파일 목록에 즉시 추가하여 Dashboard 표시
    setUploadedFiles(prevFiles => [...prevFiles, tempDocument]);
    setIsModalVisible(false);
    
    console.log('File uploaded, dashboard should show:', tempDocument);
  };
  
  const showUploadModal = () => {
    setIsModalVisible(true);
  };
  
  const handleModalCancel = () => {
    setIsModalVisible(false);
  };

  const onTreeSelect = (selectedKeys, info) => {
    if (info.node.data) {
      onDocumentClick(info.node.data);
    }
  };

  // 페이지네이션 핸들러
  const handlePageChange = (page) => {
    if (typeof page === 'number' && page > 0) {
      setCurrentPage(page);
    }
  };

  const handlePageSizeChange = (value) => {
    setPageSize(value);
    setCurrentPage(1); // 페이지 크기 변경 시 첫 페이지로 이동
    // 모달은 닫지 않음 - OK 버튼을 눌러야 닫힘
  };

  const handlePageSizeConfirm = () => {
    setShowPageSizeModal(false);
  };

  // Full text 조회 함수
  const handleFullTextView = async (document) => {
    const docId = document._id || document.id;
    
    if (!docId) {
      message.error('문서 ID가 없어 전체 텍스트를 불러올 수 없습니다.');
      return;
    }

    try {
      setSelectedDocumentForFullText(document);
      setFullTextContent('로딩 중...');
      setShowFullTextModal(true);
      
      // OCR 전체 텍스트 조회 API 호출
      const response = await axios.post('https://n8nd.giize.com/webhook/smartsearch', {
        id: docId
      });

      const fileData = response.data[0];
      // meta.full_text 우선, 없으면 ocr.full_text 사용
      const fullText = fileData.meta?.full_text || 
                       fileData.ocr?.full_text || 
                       fileData.text?.full_text || 
                       '전체 텍스트를 찾을 수 없습니다.';
      setFullTextContent(fullText);
      
    } catch (e) {
      setFullTextContent('전체 텍스트를 불러오는 중 오류가 발생했습니다.');
      console.error('Full text fetch error:', e);
    }
  };

  const handleFullTextModalClose = () => {
    setShowFullTextModal(false);
    setSelectedDocumentForFullText(null);
    setFullTextContent('');
  };

  // 현재 페이지에 표시할 데이터 계산
  const getPaginatedData = (data) => {
    if (!data || !Array.isArray(data)) return [];
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return data.slice(startIndex, endIndex);
  };

  const renderContent = () => {
    // ✅ 검색 결과가 있으면 검색 결과 우선 표시 (기존 기능 보존)
    // showDashboard가 true이거나 (좌측 메뉴에서 DSD 선택)
    // 검색 결과가 없고 업로드된 파일이 있으면 DSD 표시
    const hasSearchResults = searchResults && searchResults.length > 0;
    const hasUploadedFiles = uploadedFiles && uploadedFiles.length > 0;
    const shouldShowDashboard = showDashboard || (!hasSearchResults && hasUploadedFiles && !isLoading);
    
    if (shouldShowDashboard) {
      // Dashboard는 자체적으로 전체 화면을 관리하므로 return 전에 렌더링
      return (
        <div style={{ margin: '-24px', height: 'calc(100vh - 128px)' }}>
          <div className="dashboard-container">
            <DocumentStatusDashboard initialFiles={uploadedFiles} />
          </div>
        </div>
      );
    }

    if (isLoading) {
      return (
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <Spin size="large" />
          <p style={{ marginTop: '20px', color: 'rgba(0, 0, 0, 0.45)' }}>
            문서를 검색 중입니다...
          </p>
        </div>
      );
    }

    if (viewMode === 'list') {
      const paginatedData = getPaginatedData(searchResults);
      
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)' }}>
          <div style={{ 
            flex: 1, 
            overflow: 'auto',
            marginBottom: '16px'
          }}>
            <List
              itemLayout="horizontal"
              dataSource={paginatedData}
              renderItem={(item) => (
                <List.Item
                  key={item.id || item.payload?.doc_id}
                  actions={[
                    <Button
                      type="text"
                      icon={<ReadOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFullTextView(item);
                      }}
                      title="전체 텍스트 보기"
                      style={{ color: '#1890ff' }}
                    >
                      Full Text
                    </Button>
                  ]}
                  onClick={() => onDocumentClick(item)}
                  style={{ cursor: 'pointer', padding: '12px 0' }}
                >
                  <List.Item.Meta
                    avatar={<FileTextOutlined style={{ fontSize: 24, color: '#1890ff' }} />}
                    title={
                      <Space>
                        <Text>{item.upload.originalName || item.payload?.original_name || item.name || '이름 없음'}</Text>
                        {item.type && (
                           <Tag color="blue">{item.type}</Tag>
                        )}
                        {/* ✅ 수정된 부분: Confidence를 제목 옆에 위치시키고 문구를 태그 안에 포함 */}
                        {item.ocr?.confidence && (
                            <Tag color="blue">Confidence: {item.ocr.confidence}</Tag>
                        )}
                      </Space>
                    }
                    description={
                      <Space size="middle">
                        <Text type="secondary">{item.ocr?.summary || item.payload?.summary || '요약 정보: 없음'}</Text>
                        {item.score && (
                           <Text type="secondary">유사도: <Tag color="green">{item.score.toFixed(4)}</Tag></Text>
                        )}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </div>
          
          {/* 페이지네이션 */}
          {searchResults && searchResults.length > 0 && (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              padding: '8px 0',
              borderTop: '1px solid #f0f0f0'
            }}>
              <Space>
                <Text type="secondary">
                  총 {searchResults?.length || 0}개 문서 중 {Math.min(((currentPage - 1) * pageSize) + 1, searchResults?.length || 0)}-{Math.min(currentPage * pageSize, searchResults?.length || 0)}개 표시
                </Text>
              </Space>
              <Pagination
                current={currentPage}
                pageSize={pageSize}
                total={searchResults?.length || 0}
                onChange={handlePageChange}
                showTotal={(total, range) => `${range[0]}-${range[1]} / ${total}`}
                size="small"
                simple={false}
              />
            </div>
          )}
        </div>
      );
    }

    if (viewMode === 'tree') {
      return (
        <div style={{ 
          height: '100%',
          overflow: 'auto'
        }}>
          <Tree
            showIcon
            defaultExpandAll
            onSelect={onTreeSelect}
            treeData={mockTreeDocuments}
            style={{ cursor: 'pointer' }}
          />
        </div>
      );
    }
  };

  // 카드 제목 동적 생성
  const getCardTitle = () => {
    const hasSearchResults = searchResults && searchResults.length > 0;
    const hasUploadedFiles = uploadedFiles && uploadedFiles.length > 0;
    
    if (showDashboard) {
      return <Title level={4}>문서 처리 현황</Title>;
    } else if (hasSearchResults) {
      return <Title level={4}>검색 결과 ({searchResults.length}개 문서)</Title>;
    } else if (hasUploadedFiles && !isLoading) {
      return <Title level={4}>업로드된 문서</Title>;
    } else {
      return <Title level={4}>문서 목록</Title>;
    }
  };

  return (
    <Card
      title={getCardTitle()}
      extra={
        <Space>
          {/* ✅ 업로드 버튼 추가 */}
          <Button icon={<UploadOutlined />} onClick={showUploadModal}>업로드</Button>
          <Select defaultValue="업로드일" style={{ width: 120 }}>
            <Option value="업로드일">업로드일</Option>
            <Option value="문서명">문서명</Option>
            <Option value="상태">상태</Option>
          </Select>
          <Button.Group>
            <Button icon={<FileTextOutlined />} onClick={() => setViewMode('tree')} />
            <Button icon={<UnorderedListOutlined />} onClick={() => setViewMode('list')} />
            <Button icon={<AppstoreOutlined />} onClick={() => setViewMode('grid')} disabled />
          </Button.Group>
          <Button icon={<SettingOutlined />} onClick={() => setShowPageSizeModal(true)} />
        </Space>
      }
      style={{ height: 'calc(100vh - 140px)', borderRadius: 8, display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {renderContent()}
      </div>

      {/* ✅ 업로드 모달 추가 */}
      <Modal
        title="문서 업로드"
        visible={isModalVisible}
        onCancel={handleModalCancel}
        footer={null}
        destroyOnClose={true} // 모달이 닫힐 때 내부 컴포넌트 초기화
      >
        <FileUploader onUploadSuccess={handleUploadSuccess} />
      </Modal>

      {/* 페이지 크기 설정 모달 */}
      <Modal
        title="페이지 설정"
        visible={showPageSizeModal}
        onCancel={() => setShowPageSizeModal(false)}
        onOk={handlePageSizeConfirm}
        width={400}
        okText="확인"
        cancelText="취소"
      >
        <div style={{ padding: '20px 0' }}>
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <div>
              <Text style={{ marginBottom: 16, display: 'block' }}>페이지당 문서 수 선택:</Text>
              <Space wrap>
                {[5, 10, 20, 30, 50].map(size => (
                  <Button
                    key={size}
                    type={pageSize === size ? "primary" : "default"}
                    onClick={() => handlePageSizeChange(size)}
                    style={{ minWidth: 50 }}
                  >
                    {size}개
                  </Button>
                ))}
              </Space>
            </div>
            
            <div>
              <Text style={{ marginBottom: 16, display: 'block' }}>또는 +/- 버튼으로 원하는 개수 설정:</Text>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                gap: '12px',
                padding: '8px 0'
              }}>
                <Button 
                  type="primary"
                  shape="circle"
                  icon={<MinusOutlined />}
                  onClick={() => handlePageSizeChange(Math.max(5, pageSize - 1))}
                  disabled={pageSize <= 5}
                  size="small"
                />
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '80px',
                  height: '32px',
                  border: '1px solid #d9d9d9',
                  borderRadius: '6px',
                  backgroundColor: '#fafafa',
                  fontSize: '16px',
                  fontWeight: '500'
                }}>
                  {pageSize}개
                </div>
                <Button 
                  type="primary"
                  shape="circle"
                  icon={<PlusOutlined />}
                  onClick={() => handlePageSizeChange(Math.min(50, pageSize + 1))}
                  disabled={pageSize >= 50}
                  size="small"
                />
              </div>
            </div>
            
            <Text type="secondary" style={{ fontSize: '12px' }}>
              현재 설정: {pageSize}개씩 표시
            </Text>
          </Space>
        </div>
      </Modal>

      {/* Full Text 모달 */}
      <Modal
        title={
          <div style={{ cursor: 'move', width: '100%' }}>
            <Space>
              <ReadOutlined />
              <Text>{selectedDocumentForFullText?.upload?.originalName || selectedDocumentForFullText?.payload?.original_name || '문서 전체 텍스트'}</Text>
            </Space>
          </div>
        }
        visible={showFullTextModal}
        onCancel={handleFullTextModalClose}
        footer={[
          <Button key="close" onClick={handleFullTextModalClose}>
            닫기
          </Button>
        ]}
        width={800}
        style={{ top: 20 }}
        draggable={true}
        modalRender={(modal) => (
          <div
            onMouseDown={(e) => {
              const modalElement = e.currentTarget;
              const startX = e.clientX - modalElement.offsetLeft;
              const startY = e.clientY - modalElement.offsetTop;

              const handleMouseMove = (moveEvent) => {
                modalElement.style.left = `${moveEvent.clientX - startX}px`;
                modalElement.style.top = `${moveEvent.clientY - startY}px`;
              };

              const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
              };

              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }}
            style={{ position: 'absolute' }}
          >
            {modal}
          </div>
        )}
      >
        <div style={{ 
          maxHeight: '60vh', 
          overflowY: 'auto',
          padding: '16px',
          backgroundColor: '#fafafa',
          border: '1px solid #f0f0f0',
          borderRadius: '6px'
        }}>
          <pre style={{ 
            whiteSpace: 'pre-wrap', 
            wordBreak: 'break-word',
            fontFamily: 'inherit',
            margin: 0,
            lineHeight: '1.6'
          }}>
            {fullTextContent}
          </pre>
        </div>
      </Modal>
    </Card>
  );
};

export default CenterPane;