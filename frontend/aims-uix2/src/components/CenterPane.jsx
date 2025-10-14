import React, { useState, useRef, useEffect } from 'react';
import { Typography, Space, Select, Button, Tooltip, Modal, List, Tag, Pagination } from 'antd';
import {
  UnorderedListOutlined,
  AppstoreOutlined,
  FileTextOutlined,
  FolderOutlined,
  UploadOutlined,
  SettingOutlined,
  LinkOutlined
} from '@ant-design/icons';

import { StandardCenterPane } from './common';
import FileUploader from './FileUploader';
import DocumentStatusDashboard from './DocumentStatusDashboard';
import CustomerManagement from './CustomerManagement';
import CustomerManagementMain from './CustomerManagementMain';
import DocumentManagementMain from './DocumentManagementMain';
import DocumentLinkModal from './DocumentLinkModal';
import { extractDocumentId } from '../utils/documentHelper';

const { Title, Text } = Typography;
const { Option } = Select;

/**
 * CenterPane - StandardCenterPane 프레임워크 기반
 * 모든 메뉴에서 일관된 구조 사용
 */
const CenterPane = ({
  onDocumentClick,
  onDocumentPreview,
  onCustomerClick,
  searchResults,
  isLoading,
  showDashboard,
  showCustomerManagement,
  showCustomerManagementMain,
  showDocumentManagementMain,
  selectedMenuKey,
  onDocumentLinked,
  editModalVisible,
  editingCustomer,
  onEditModalClose,
  onCustomerUpdated,
  onRefreshCustomerListSet,
  rightPaneVisible
}) => {
  const [viewMode, setViewMode] = useState('list');
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [showPageSizeModal, setShowPageSizeModal] = useState(false);

  // 문서 목록 관련 상태
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedDocumentId, setSelectedDocumentId] = useState(null);
  const [selectedDocumentForLink, setSelectedDocumentForLink] = useState(null);

  // 스크롤 관련
  const scrollContainerRef = useRef(null);
  const [savedScrollPosition, setSavedScrollPosition] = useState(0);

  // 파일 업로드 성공 핸들러
  const handleUploadSuccess = (file) => {
    const tempDocument = {
      id: `temp-${Date.now()}-${Math.random()}`,
      upload: {
        originalName: file.name,
        fileSize: file.size,
        uploadDate: new Date().toISOString()
      },
      status: 'processing',
      isTemp: true
    };
    setUploadedFiles(prev => [tempDocument, ...prev]);
  };

  // 업로드 모달 표시
  const showUploadModal = () => {
    setIsModalVisible(true);
  };

  // 페이지 크기 확인
  const handlePageSizeConfirm = () => {
    setShowPageSizeModal(false);
  };

  // 문서 클릭 핸들러 (스크롤 위치 보존)
  const handleDocumentClickWithScrollSave = (doc) => {
    // 현재 스크롤 위치 저장
    if (scrollContainerRef.current) {
      const currentScrollTop = scrollContainerRef.current.scrollTop;
      setSavedScrollPosition(currentScrollTop);
    }

    // 선택된 문서 ID 저장
    const docId = extractDocumentId(doc);
    if (docId !== selectedDocumentId) {
      setSelectedDocumentId(docId);
    }

    // 부모 컴포넌트에 클릭 이벤트 전달
    if (onDocumentClick) {
      onDocumentClick(doc);
    }
  };

  // 문서 연결 모달 열기
  const openDocumentLinkModal = (document) => {
    setSelectedDocumentForLink(document);
  };

  // 문서 연결 모달 닫기
  const closeDocumentLinkModal = () => {
    setSelectedDocumentForLink(null);
  };

  // 페이지네이션 데이터 계산
  const getPaginatedData = (data) => {
    if (!data || !Array.isArray(data)) return [];
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return data.slice(startIndex, endIndex);
  };

  // 스크롤 위치 복원
  useEffect(() => {
    if (savedScrollPosition > 0 && scrollContainerRef.current) {
      const timeouts = [];
      const restoreScroll = () => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = savedScrollPosition;
          setSavedScrollPosition(0);
        }
      };

      timeouts.push(setTimeout(restoreScroll, 100));
      timeouts.push(setTimeout(restoreScroll, 300));
      timeouts.push(setTimeout(restoreScroll, 500));

      return () => {
        timeouts.forEach(clearTimeout);
      };
    }
  }, [savedScrollPosition]);

  // 문서 목록 렌더링
  const renderDocumentList = () => {
    const hasSearchResults = searchResults && searchResults.length > 0;
    const dataSource = hasSearchResults ? searchResults : [];

    if (!hasSearchResults) {
      return (
        <div className="flex flex-col items-center justify-center h-64 text-gray-400">
          <FileTextOutlined className="text-4xl mb-4" />
          <p className="text-lg">검색 결과가 없습니다</p>
          <p className="text-sm">상단 검색창을 이용해 문서를 검색해보세요</p>
        </div>
      );
    }

    if (viewMode === 'list') {
      const paginatedData = getPaginatedData(dataSource);

      return (
        <div className="flex flex-col h-full">
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-auto"
          >
            <List
              itemLayout="horizontal"
              dataSource={paginatedData}
              renderItem={(item) => {
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
                              openDocumentLinkModal(item);
                            }
                          }}
                          disabled={!!item.customer_relation}
                          className={item.customer_relation ? "text-success" : ""}
                        />
                      </Tooltip>
                    ]}
                    onClick={() => handleDocumentClickWithScrollSave(item)}
                    className={`cursor-pointer py-md rounded-lg my-1 transition-all ${
                      isSelected ? 'selected-document-item bg-primary' : ''
                    }`}
                  >
                    <List.Item.Meta
                      avatar={<FileTextOutlined className="text-2xl text-primary" />}
                      title={
                        <Space>
                          <Text>{item.upload?.originalName || item.payload?.original_name || item.name || '이름 없음'}</Text>
                          {item.type && <Tag color="blue">{item.type}</Tag>}
                        </Space>
                      }
                      description={
                        <div>
                          <Text type="secondary">
                            업로드일: {item.upload?.uploadDate || item.payload?.upload_date || '정보 없음'}
                          </Text>
                          {item.customer_relation && (
                            <div>
                              <Text type="success">
                                연결된 고객: {item.customer_relation.customer_name}
                              </Text>
                            </div>
                          )}
                        </div>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          </div>

          {/* 페이지네이션 */}
          {dataSource.length > pageSize && (
            <div className="flex justify-between items-center py-4 border-t border-light">
              <Space>
                <Text type="secondary">
                  총 {dataSource.length}개 문서 중 {Math.min(((currentPage - 1) * pageSize) + 1, dataSource.length)}-{Math.min(currentPage * pageSize, dataSource.length)}개 표시
                </Text>
              </Space>
              <Pagination
                current={currentPage}
                pageSize={pageSize}
                total={dataSource.length}
                onChange={(page) => setCurrentPage(page)}
                showSizeChanger={false}
                showQuickJumper
              />
            </div>
          )}
        </div>
      );
    }

    // 트리 모드 (간단한 구현)
    if (viewMode === 'tree') {
      return (
        <div className="p-4">
          <p className="text-center text-gray-500">트리 뷰는 준비 중입니다.</p>
        </div>
      );
    }

    return null;
  };

  // === 메뉴별 컨텐츠 렌더링 ===

  // 1. 고객 관리 메인
  if (showCustomerManagementMain) {
    return (
      <StandardCenterPane
        title="고객 관리"
        loading={isLoading}
      >
        <CustomerManagementMain />
      </StandardCenterPane>
    );
  }

  // 2. 문서 관리 메인
  if (showDocumentManagementMain) {
    return (
      <StandardCenterPane
        title="문서 관리"
        loading={isLoading}
      >
        <DocumentManagementMain />
      </StandardCenterPane>
    );
  }

  // 3. 고객 관리 상세
  if (showCustomerManagement) {
    return (
      <StandardCenterPane
        loading={isLoading}
        showHeader={false} // CustomerManagement가 자체 헤더를 가짐
      >
        <CustomerManagement
          onCustomerClick={onCustomerClick}
          selectedMenuKey={selectedMenuKey}
          editModalVisible={editModalVisible}
          editingCustomer={editingCustomer}
          onEditModalClose={onEditModalClose}
          onCustomerUpdated={onCustomerUpdated}
          onRefreshCustomerListSet={onRefreshCustomerListSet}
        />
      </StandardCenterPane>
    );
  }

  // 4. 문서 처리 현황 (Dashboard)
  const hasSearchResults = searchResults && searchResults.length > 0;
  const hasUploadedFiles = uploadedFiles && uploadedFiles.length > 0;
  const shouldShowDashboard = showDashboard || (!hasSearchResults && hasUploadedFiles && !isLoading);

  if (shouldShowDashboard) {
    return (
      <StandardCenterPane
        title="문서 처리 현황"
        loading={isLoading}
        className="dashboard-center-pane"
      >
        <DocumentStatusDashboard
          initialFiles={uploadedFiles}
          onDocumentClick={onDocumentClick}
          onDocumentPreview={onDocumentPreview}
          rightPaneVisible={rightPaneVisible}
        />
      </StandardCenterPane>
    );
  }

  // 5. 기본 문서 목록/검색 결과
  const getTitle = () => {
    if (hasSearchResults) {
      return `검색 결과 (${searchResults.length}개 문서)`;
    }
    return "문서 목록";
  };

  const getHeaderActions = () => (
    <>
      <Tooltip title="새 문서를 업로드합니다">
        <Button icon={<UploadOutlined />} onClick={showUploadModal}>
          업로드
        </Button>
      </Tooltip>

      <Tooltip title="문서 정렬 기준을 선택합니다">
        <Select defaultValue="업로드일" style={{ width: 120 }}>
          <Option value="업로드일">업로드일</Option>
          <Option value="문서명">문서명</Option>
          <Option value="상태">상태</Option>
        </Select>
      </Tooltip>

      <Button.Group>
        <Tooltip title="트리 형태로 문서를 보여줍니다">
          <Button
            icon={<FileTextOutlined />}
            onClick={() => setViewMode('tree')}
            type={viewMode === 'tree' ? 'primary' : 'default'}
          />
        </Tooltip>
        <Tooltip title="목록 형태로 문서를 보여줍니다">
          <Button
            icon={<UnorderedListOutlined />}
            onClick={() => setViewMode('list')}
            type={viewMode === 'list' ? 'primary' : 'default'}
          />
        </Tooltip>
        <Tooltip title="그리드 형태로 문서를 보여줍니다 (준비 중)">
          <Button
            icon={<AppstoreOutlined />}
            onClick={() => setViewMode('grid')}
            disabled
          />
        </Tooltip>
      </Button.Group>

      <Tooltip title="페이지 표시 설정을 변경합니다">
        <Button
          icon={<SettingOutlined />}
          onClick={() => setShowPageSizeModal(true)}
        />
      </Tooltip>
    </>
  );

  return (
    <>
      <StandardCenterPane
        title={getTitle()}
        headerActions={getHeaderActions()}
        loading={isLoading}
        loadingText="문서를 검색 중입니다..."
      >
        {/* 문서 목록 컨텐츠 */}
        {renderDocumentList()}
      </StandardCenterPane>

      {/* 업로드 모달 */}
      <Modal
        title="문서 업로드"
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={null}
        width={600}
      >
        <FileUploader onUploadSuccess={handleUploadSuccess} />
      </Modal>

      {/* 페이지 크기 설정 모달 */}
      <Modal
        title="페이지 설정"
        open={showPageSizeModal}
        onCancel={() => setShowPageSizeModal(false)}
        onOk={handlePageSizeConfirm}
        width={400}
      >
        <p>페이지당 표시할 항목 수를 설정하세요.</p>
      </Modal>

      {/* 문서 연결 모달 */}
      {selectedDocumentForLink && (
        <DocumentLinkModal
          document={selectedDocumentForLink}
          visible={!!selectedDocumentForLink}
          onClose={closeDocumentLinkModal}
          onLinked={onDocumentLinked}
        />
      )}
    </>
  );
};

export default CenterPane;