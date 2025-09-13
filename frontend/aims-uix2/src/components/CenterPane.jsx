import React, { useState } from 'react';
import { Card, List, Typography, Button, Space, Tag, Select, Tree, Spin, Modal, Pagination, message, Tooltip } from 'antd';
import { UnorderedListOutlined, AppstoreOutlined, FileTextOutlined, FolderOutlined, UploadOutlined, SettingOutlined, PlusOutlined, MinusOutlined, ReadOutlined, LinkOutlined } from '@ant-design/icons';
import FileUploader from './FileUploader';
import DocumentStatusDashboard from './DocumentStatusDashboard';
import CustomerManagement from './CustomerManagement';
import CustomerManagementMain from './CustomerManagementMain';
import DocumentManagementMain from './DocumentManagementMain';
import DocumentLinkModal from './DocumentLinkModal';
import { extractDocumentId } from '../utils/documentHelper';
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


const CenterPane = ({ onDocumentClick, onDocumentPreview, onCustomerClick, searchResults, isLoading, showDashboard, showCustomerManagement, showCustomerManagementMain, showDocumentManagementMain, selectedMenuKey, onDocumentLinked, editModalVisible, editingCustomer, onEditModalClose, onCustomerUpdated, onRefreshCustomerListSet, rightPaneVisible }) => {
  const [viewMode, setViewMode] = useState('list');
  const [uploadedFiles, setUploadedFiles] = useState([]); // 업로드된 파일 목록 상태 추가
  const [isModalVisible, setIsModalVisible] = useState(false); // 모달 가시성 상태 추가
  
  // 스크롤 위치 보존을 위한 ref와 상태
  const scrollContainerRef = React.useRef(null);
  const [savedScrollPosition, setSavedScrollPosition] = React.useState(0);
  
  // 선택된 문서 상태
  const [selectedDocumentId, setSelectedDocumentId] = useState(null);
  
  // 페이지네이션 관련 상태
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showPageSizeModal, setShowPageSizeModal] = useState(false);
  
  // Full text 모달 관련 상태
  const [showFullTextModal, setShowFullTextModal] = useState(false);
  const [selectedDocumentForFullText, setSelectedDocumentForFullText] = useState(null);
  const [fullTextContent, setFullTextContent] = useState('');
  
  // 문서 연결 모달 관련 상태
  const [showDocumentLinkModal, setShowDocumentLinkModal] = useState(false);
  const [selectedDocumentForLink, setSelectedDocumentForLink] = useState(null);
  
  // 문서 클릭 시 스크롤 위치를 저장하는 핸들러
  const handleDocumentClickWithScrollSave = (doc) => {
    // 현재 스크롤 위치 저장
    if (scrollContainerRef.current) {
      const currentScrollTop = scrollContainerRef.current.scrollTop;
      setSavedScrollPosition(currentScrollTop);
    }
    
    // 선택된 문서 ID 저장 - 같은 문서를 다시 클릭해도 선택 상태 유지
    const docId = extractDocumentId(doc);
    if (docId !== selectedDocumentId) {
      setSelectedDocumentId(docId);
    }
    
    // 원래 문서 클릭 핸들러 호출
    if (onDocumentClick) {
      onDocumentClick(doc);
    }
  };
  
  // DOM 변경 즉시 스크롤 위치 복원 (layoutEffect 사용)
  React.useLayoutEffect(() => {
    if (scrollContainerRef.current && savedScrollPosition > 0) {
      scrollContainerRef.current.scrollTop = savedScrollPosition;
    }
  });

  // 추가적인 복원 시점들 - RightPane 너비 변경 감지
  React.useEffect(() => {
    if (scrollContainerRef.current && savedScrollPosition > 0) {
      const restoreScroll = () => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = savedScrollPosition;
        }
      };
      
      // 즉시 복원
      restoreScroll();
      
      // 여러 시점에서 복원 시도
      const timeouts = [
        setTimeout(restoreScroll, 0),
        setTimeout(restoreScroll, 10),
        setTimeout(restoreScroll, 50),
        setTimeout(restoreScroll, 100)
      ];
      
      return () => {
        timeouts.forEach(clearTimeout);
      };
    }
  }, [savedScrollPosition]);
  
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

  // 페이지네이션 핸들러 - 선택 상태 유지
  const handlePageChange = (page) => {
    if (typeof page === 'number' && page > 0) {
      setCurrentPage(page);
      // 선택된 문서 ID는 유지됨 (초기화하지 않음)
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
    const docId = extractDocumentId(document);
    
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

  // 문서 연결 모달 핸들러
  const handleDocumentLink = (document) => {
    setSelectedDocumentForLink(document);
    setShowDocumentLinkModal(true);
  };

  const handleDocumentLinkModalClose = () => {
    setShowDocumentLinkModal(false);
    setSelectedDocumentForLink(null);
  };

  const handleLinkSuccess = (linkedDocumentId, customerInfo) => {
    // 연결 성공 후 우측 패널의 고객 정보 새로고침
    message.success('문서가 고객에게 성공적으로 연결되었습니다.');
    if (onDocumentLinked) {
      onDocumentLinked(linkedDocumentId, customerInfo);
    }
  };

  // 현재 페이지에 표시할 데이터 계산
  const getPaginatedData = (data) => {
    if (!data || !Array.isArray(data)) return [];
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return data.slice(startIndex, endIndex);
  };

  const renderContent = () => {
    const hasSearchResults = searchResults && searchResults.length > 0;
    
    // 검색 결과가 있으면 검색 결과를 최우선으로 표시
    if (hasSearchResults) {
      // 검색 결과 표시 (리스트 모드로)
    } else if (showCustomerManagement) {
      // 검색 결과가 없을 때만 고객 관리 화면 표시
      return <CustomerManagement 
        onCustomerClick={onCustomerClick} 
        selectedMenuKey={selectedMenuKey}
        editModalVisible={editModalVisible}
        editingCustomer={editingCustomer}
        onEditModalClose={onEditModalClose}
        onCustomerUpdated={onCustomerUpdated}
        onRefreshCustomerListSet={onRefreshCustomerListSet}
      />;
    }
    
    // showDashboard가 true이거나 (좌측 메뉴에서 DSD 선택)
    // 검색 결과가 없고 업로드된 파일이 있으면 DSD 표시
    const hasUploadedFiles = uploadedFiles && uploadedFiles.length > 0;
    const shouldShowDashboard = showDashboard || (!hasSearchResults && hasUploadedFiles && !isLoading);
    
    if (shouldShowDashboard) {
      // Dashboard는 자체적으로 전체 화면을 관리하므로 return 전에 렌더링
      return (
        <div className="-m-xl h-screen-128">
          <div className="dashboard-container">
            <DocumentStatusDashboard 
              initialFiles={uploadedFiles} 
              onDocumentClick={handleDocumentClickWithScrollSave}
              onDocumentPreview={onDocumentPreview}
              rightPaneVisible={rightPaneVisible}
            />
          </div>
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="text-center py-xl">
          <Spin size="large" />
          <p className="mt-lg text-tertiary">
            문서를 검색 중입니다...
          </p>
        </div>
      );
    }

    if (viewMode === 'list') {
      const paginatedData = getPaginatedData(searchResults);
      
      return (
        <div className="flex-column h-screen-200">
          <div 
            ref={scrollContainerRef}
            className="flex-1 overflow-auto mb-lg"
          >
            <List
              itemLayout="horizontal"
              dataSource={paginatedData}
              renderItem={(item) => {
                // 현재 아이템이 선택된 문서인지 확인
                const itemId = extractDocumentId(item);
                const isSelected = selectedDocumentId === itemId;
                
                return (
                  <List.Item
                    key={itemId}
                    actions={[
                      <Tooltip title={item.customer_relation ? "이미 고객과 연결됨" : "문서를 고객과 연결합니다"}>
                        <Button
                          type="text"
                          icon={<LinkOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!item.customer_relation) {
                              handleDocumentLink(item);
                            }
                          }}
                          disabled={item.customer_relation}
                          className={item.customer_relation ? 'text-disabled cursor-not-allowed' : 'text-success cursor-pointer'}
                        >
                          고객연결
                        </Button>
                      </Tooltip>,
                      <Tooltip title="문서의 전체 텍스트를 확인합니다">
                        <Button
                          type="text"
                          icon={<ReadOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFullTextView(item);
                          }}
                          className="text-primary"
                        >
                          Full Text
                        </Button>
                      </Tooltip>
                    ]}
                    onClick={() => handleDocumentClickWithScrollSave(item)}
                    className={`cursor-pointer py-md rounded-lg my-1 transition-all ${isSelected ? 'selected-document-item bg-primary' : ''}`}
                  >
                    <List.Item.Meta
                      avatar={<FileTextOutlined className="text-2xl text-primary" />}
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
                          <Text type="secondary">{
                            (() => {
                              // meta에서 full_text 확인
                              const metaFullText = item.meta?.full_text || 
                                (typeof item.meta === 'string' ? (() => {
                                  try { 
                                    const parsed = JSON.parse(item.meta);
                                    return parsed.full_text;
                                  } catch { return null; }
                                })() : null);
                              
                              // meta에 full_text가 있는 경우 - meta summary 사용
                              if (metaFullText && metaFullText.trim()) {
                                const metaSummary = item.meta?.summary || 
                                  (typeof item.meta === 'string' ? (() => {
                                    try { 
                                      const parsed = JSON.parse(item.meta);
                                      return parsed.summary;
                                    } catch { return null; }
                                  })() : null);
                                
                                if (metaSummary && metaSummary !== 'null') {
                                  return metaSummary;
                                }
                                
                                // meta summary가 없으면 meta full_text의 앞부분 사용
                                const cleanText = metaFullText.trim();
                                return cleanText.length > 100 ? cleanText.substring(0, 100) + '...' : cleanText;
                              }
                              
                              // meta에 full_text가 없는 경우 - ocr summary 사용
                              const ocrSummary = item.ocr?.summary || 
                                (typeof item.ocr === 'string' ? (() => {
                                  try { 
                                    const parsed = JSON.parse(item.ocr);
                                    return parsed.summary;
                                  } catch { return null; }
                                })() : null);
                              
                              if (ocrSummary && ocrSummary !== 'null') {
                                return ocrSummary;
                              }
                              
                              // ocr summary가 없으면 ocr full_text의 앞부분 사용
                              const ocrFullText = item.ocr?.full_text || 
                                (typeof item.ocr === 'string' ? (() => {
                                  try { 
                                    const parsed = JSON.parse(item.ocr);
                                    return parsed.full_text;
                                  } catch { return null; }
                                })() : null);
                              
                              if (ocrFullText && ocrFullText.trim()) {
                                const cleanText = ocrFullText.trim();
                                return cleanText.length > 100 ? cleanText.substring(0, 100) + '...' : cleanText;
                              }
                              
                              // 마지막으로 payload.summary 시도
                              if (item.payload?.summary) {
                                return item.payload.summary;
                              }
                              
                              return '요약 정보: 없음';
                            })()
                          }</Text>
                          {item.score && (
                             <Text type="secondary">유사도: <Tag color="green">{item.score.toFixed(4)}</Tag></Text>
                          )}
                        </Space>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          </div>
          
          {/* 페이지네이션 */}
          {searchResults && searchResults.length > 0 && (
            <div className="flex justify-between align-center py-sm border-t border-light">
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
        <div className="h-full overflow-auto">
          <Tree
            showIcon
            defaultExpandAll
            onSelect={onTreeSelect}
            treeData={mockTreeDocuments}
            className="cursor-pointer"
          />
        </div>
      );
    }
  };

  // 카드 제목 동적 생성
  const getCardTitle = () => {
    if (showCustomerManagement) {
      return null; // CustomerManagement 컴포넌트 자체에서 제목 관리
    }
    
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

  // 고객 관리 메인 화면인 경우 전용 컴포넌트 렌더링
  if (showCustomerManagementMain) {
    return <CustomerManagementMain />;
  }

  // 문서 관리 메인 화면인 경우 전용 컴포넌트 렌더링
  if (showDocumentManagementMain) {
    return <DocumentManagementMain />;
  }

  // 고객 관리 화면인 경우 Card 없이 직접 렌더링
  if (showCustomerManagement) {
    return <CustomerManagement 
      onCustomerClick={onCustomerClick}
      selectedMenuKey={selectedMenuKey}
      editModalVisible={editModalVisible}
      editingCustomer={editingCustomer}
      onEditModalClose={onEditModalClose}
      onCustomerUpdated={onCustomerUpdated}
      onRefreshCustomerListSet={onRefreshCustomerListSet}
    />;
  }

  return (
    <Card
      title={getCardTitle()}
      extra={
        <Space>
          {/* ✅ 업로드 버튼 추가 */}
          <Tooltip title="새 문서를 업로드합니다">
            <Button icon={<UploadOutlined />} onClick={showUploadModal}>업로드</Button>
          </Tooltip>
          <Tooltip title="문서 정렬 기준을 선택합니다">
            <Select defaultValue="업로드일" className="w-30">
              <Option value="업로드일">업로드일</Option>
              <Option value="문서명">문서명</Option>
              <Option value="상태">상태</Option>
            </Select>
          </Tooltip>
          <Button.Group>
            <Tooltip title="트리 형태로 문서를 보여줍니다">
              <Button icon={<FileTextOutlined />} onClick={() => setViewMode('tree')} />
            </Tooltip>
            <Tooltip title="목록 형태로 문서를 보여줍니다">
              <Button icon={<UnorderedListOutlined />} onClick={() => setViewMode('list')} />
            </Tooltip>
            <Tooltip title="그리드 형태로 문서를 보여줍니다 (준비 중)">
              <Button icon={<AppstoreOutlined />} onClick={() => setViewMode('grid')} disabled />
            </Tooltip>
          </Button.Group>
          <Tooltip title="페이지 표시 설정을 변경합니다">
            <Button icon={<SettingOutlined />} onClick={() => setShowPageSizeModal(true)} />
          </Tooltip>
        </Space>
      }
      className="h-screen-140 rounded-lg flex flex-col"
    >
      <div className="flex-1 flex flex-col">
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
        <div className="py-5">
          <Space direction="vertical" className="w-full" size="large">
            <div>
              <Text className="mb-lg block">페이지당 문서 수 선택:</Text>
              <Space wrap>
                {[5, 10, 20, 30, 50].map(size => (
                  <Tooltip key={size} title={`페이지당 ${size}개씩 표시합니다`}>
                    <Button
                      type={pageSize === size ? "primary" : "default"}
                      onClick={() => handlePageSizeChange(size)}
                      className="min-w-12"
                    >
                      {size}개
                    </Button>
                  </Tooltip>
                ))}
              </Space>
            </div>
            
            <div>
              <Text className="mb-lg block">또는 +/- 버튼으로 원하는 개수 설정:</Text>
              <div className="page-size-controls">
                <Tooltip title="페이지당 표시 개수를 하나 줄입니다">
                  <Button 
                    type="primary"
                    shape="circle"
                    icon={<MinusOutlined />}
                    onClick={() => handlePageSizeChange(Math.max(5, pageSize - 1))}
                    disabled={pageSize <= 5}
                    size="small"
                  />
                </Tooltip>
                <div className="page-size-display">
                  {pageSize}개
                </div>
                <Tooltip title="페이지당 표시 개수를 하나 늘립니다">
                  <Button 
                    type="primary"
                    shape="circle"
                    icon={<PlusOutlined />}
                    onClick={() => handlePageSizeChange(Math.min(50, pageSize + 1))}
                    disabled={pageSize >= 50}
                    size="small"
                  />
                </Tooltip>
              </div>
            </div>
            
            <Text type="secondary" className="text-xs">
              현재 설정: {pageSize}개씩 표시
            </Text>
          </Space>
        </div>
      </Modal>

      {/* Full Text 모달 */}
      <Modal
        title={
          <div className="cursor-move w-full">
            <Space>
              <ReadOutlined />
              <Text>{selectedDocumentForFullText?.upload?.originalName || selectedDocumentForFullText?.payload?.original_name || '문서 전체 텍스트'}</Text>
            </Space>
          </div>
        }
        visible={showFullTextModal}
        onCancel={handleFullTextModalClose}
        footer={[
          <Tooltip title="전체 텍스트 창을 닫습니다">
            <Button key="close" onClick={handleFullTextModalClose}>
              닫기
            </Button>
          </Tooltip>
        ]}
        width={800}
        className="modal-top-20"
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
            className="absolute"
          >
            {modal}
          </div>
        )}
      >
        <div className="modal-debug-container">
          <pre className="modal-debug-pre">
            {fullTextContent}
          </pre>
        </div>
      </Modal>

      {/* 문서 연결 모달 */}
      <DocumentLinkModal
        visible={showDocumentLinkModal}
        onCancel={handleDocumentLinkModalClose}
        documentId={selectedDocumentForLink?._id || selectedDocumentForLink?.id}
        documentName={selectedDocumentForLink?.upload?.originalName || selectedDocumentForLink?.name}
        onLinkSuccess={handleLinkSuccess}
      />
    </Card>
  );
};

export default CenterPane;