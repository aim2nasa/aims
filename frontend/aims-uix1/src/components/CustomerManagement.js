import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Table, Modal, Form, Input, Select, DatePicker, 
  Space, Tag,
  Tabs, Drawer, Row, Col
} from 'antd';
import { Button } from './common';
import { 
  PlusOutlined, UserOutlined, FileTextOutlined, PhoneOutlined,
  SearchOutlined
} from '@ant-design/icons';
import { getCustomerTypeIconWithColor } from '../utils/customerUtils';
import dayjs from 'dayjs';
import '../styles/pagination.css';
import AddressSearchInput from './AddressSearchInput';
import CustomerService from '../services/customerService';
import CustomerRegionalTreeView from './CustomerRegionalTreeView';
import CustomerRelationshipTreeView from './CustomerRelationshipTreeView';
import CustomerSearchBar from './CustomerSearchBar';
import { RelationshipProvider } from '../contexts/RelationshipContext';

const { Option } = Select;
const { TabPane } = Tabs;

const CustomerManagement = ({ onCustomerClick, selectedMenuKey, onRefreshCustomerListSet, editModalVisible, editingCustomer, onEditModalClose, onCustomerUpdated }) => {
  // 고객 목록 관리
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  });
  const [isResponsive, setIsResponsive] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [searchFilters, setSearchFilters] = useState({});
  const [showRegionalView, setShowRegionalView] = useState(false);
  const [showRelationshipView, setShowRelationshipView] = useState(false);

  // 통합 모달 관리 - 외부 props 우선
  const [internalModalVisible, setInternalModalVisible] = useState(false);
  const [internalEditingCustomer, setInternalEditingCustomer] = useState(null);
  
  // 외부에서 제어되는 경우 외부 props 사용, 그렇지 않으면 내부 상태 사용
  // 내부 상태가 활성화되면 내부 상태 우선 (새고객등록용)
  const modalVisible = internalModalVisible || editModalVisible;
  const currentEditingCustomer = internalEditingCustomer || editingCustomer;
  const [currentAddress1, setCurrentAddress1] = useState('');
  const [addressSearchVisible, setAddressSearchVisible] = useState(false);
  
  // 기타
  const [customerDocuments, setCustomerDocuments] = useState([]);
  const [documentsDrawerVisible, setDocumentsDrawerVisible] = useState(false);
  const [form] = Form.useForm();
  const customerNameInputRef = useRef(null);

  // 페이지네이션에 Select 드롭다운 추가
  useEffect(() => {
    const addSelectDropdown = () => {
      // 페이지네이션 리스트 찾기 (페이지 번호가 있는 ul 요소)
      const paginationList = document.querySelector('.ant-pagination');
      if (paginationList && pagination.total > 0) {
        // 이미 select가 있으면 제거
        const existingContainer = paginationList.querySelector('.custom-page-select-container');
        if (existingContainer) {
          existingContainer.remove();
        }
        
        // 새로운 select container 생성 (li 요소로)
        const selectContainer = document.createElement('li');
        selectContainer.className = 'custom-page-select-container';
        selectContainer.style.cssText = `
          display: flex;
          align-items: center;
          gap: 6px;
        `;
        
        const totalPages = Math.ceil(pagination.total / pagination.pageSize);
        selectContainer.innerHTML = `
          <span style="font-size: 13px; color: var(--color-text-secondary)">Go to</span>
          <select id="page-jumper-select" style="
            padding: 2px 6px;
            border: 1px solid var(--color-border);
            border-radius: 4px;
            background-color: var(--color-bg-primary);
            color: var(--color-text-primary);
            cursor: pointer;
            font-size: 13px;
            min-width: 50px;
            height: 24px;
          ">
            ${Array.from({ length: totalPages }, (_, i) => `
              <option value="${i + 1}" ${pagination.current === i + 1 ? 'selected' : ''}>${i + 1}</option>
            `).join('')}
          </select>
          <span style="font-size: 13px; color: var(--color-text-secondary)">Page</span>
        `;
        
        // 페이지네이션 리스트의 끝에 추가
        paginationList.appendChild(selectContainer);
        
        // select 이벤트 리스너 추가
        const select = selectContainer.querySelector('#page-jumper-select');
        if (select) {
          select.addEventListener('change', (e) => {
            const targetPage = Number(e.target.value);
            setPagination(prev => ({
              ...prev,
              current: targetPage
            }));
          });
        }
      }
    };
    
    // 페이지네이션이 렌더링된 후 실행
    setTimeout(addSelectDropdown, 200);
    
    // cleanup
    return () => {
      const selectContainer = document.querySelector('.custom-page-select-container');
      if (selectContainer) {
        selectContainer.remove();
      }
    };
  }, [pagination.current, pagination.total, pagination.pageSize]);

  // 브라우저 크기에 따른 아이템 수 계산
  const calculateItemsPerPage = useCallback(() => {
    if (!isResponsive) return pagination.pageSize;
    
    const appHeader = 64;
    const customerHeader = 80;
    const searchBarHeight = showRegionalView || showRelationshipView ? 0 : 120;
    const tableHeaderHeight = 55;
    const paginationHeight = 60;
    
    const fixedElementsHeight = appHeader + customerHeader + searchBarHeight + tableHeaderHeight + paginationHeight;
    
    const tableRow = document.querySelector('.ant-table-tbody > tr');
    const rowHeight = tableRow?.offsetHeight || 47;
    
    const availableHeight = window.innerHeight - fixedElementsHeight;
    const maxItemsPerPage = Math.floor(availableHeight / rowHeight);
    
    return Math.max(10, Math.min(maxItemsPerPage, 100));
  }, [isResponsive, pagination.pageSize, showRegionalView, showRelationshipView]);

  // 브라우저 크기 변경 시 pageSize 업데이트
  useEffect(() => {
    let resizeTimer;
    
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (isResponsive) {
          const newPageSize = calculateItemsPerPage();
          setPagination(prev => {
            // 같은 값이면 업데이트하지 않음
            if (prev.pageSize === newPageSize) return prev;
            return {
              ...prev,
              pageSize: newPageSize,
              current: 1 // 페이지 크기 변경시 첫 페이지로
            };
          });
        }
      }, 300); // 300ms 디바운싱
    };

    // 초기 설정 (DOM이 완전히 로드된 후)
    if (isResponsive) {
      setTimeout(() => {
        const initialPageSize = calculateItemsPerPage();
        setPagination(prev => ({
          ...prev,
          pageSize: initialPageSize
        }));
      }, 100);
    }

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimer);
    };
  }, [isResponsive, calculateItemsPerPage]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    
    const queryParams = {
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText,
      ...searchFilters
    };

    // 날짜 범위 처리
    if (searchFilters.dateRange && searchFilters.dateRange.length === 2) {
      queryParams.startDate = searchFilters.dateRange[0].format('YYYY-MM-DD');
      queryParams.endDate = searchFilters.dateRange[1].format('YYYY-MM-DD');
      delete queryParams.dateRange; // API에 dateRange 직접 전달 방지
    }
    
    const result = await CustomerService.getCustomers(queryParams);
    
    if (result.success) {
      setCustomers(result.data.customers);
      setPagination(prev => ({
        ...prev,
        total: result.data.pagination.totalCount
      }));
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.current, pagination.pageSize, searchText, searchFilters]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // selectedMenuKey 변경 시 뷰 모드 자동 활성화
  useEffect(() => {
    if (selectedMenuKey === 'customers-relationship') {
      setShowRelationshipView(true);
      setShowRegionalView(false);
    } else if (selectedMenuKey === 'customers-regional') {
      setShowRegionalView(true);
      setShowRelationshipView(false);
    } else if (selectedMenuKey === 'customers-all' || selectedMenuKey === 'customers') {
      // "고객관리" 메뉴 클릭 시 "전체보기"와 동일한 동작
      setShowRelationshipView(false);
      setShowRegionalView(false);
    }
  }, [selectedMenuKey]);

  // 실시간 검색을 위한 debounce 효과
  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      // 검색어가 변경되면 첫 페이지로 돌아가서 검색
      if (pagination.current !== 1) {
        setPagination(prev => ({
          ...prev,
          current: 1
        }));
      } else {
        fetchCustomers();
      }
    }, 300); // 300ms 후에 검색 실행

    return () => clearTimeout(delayedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, searchFilters]);

  // 컴포넌트 마운트 시 새로고침 콜백 등록
  useEffect(() => {
    if (onRefreshCustomerListSet) {
      onRefreshCustomerListSet(() => fetchCustomers);
    }
    
    return () => {
      if (onRefreshCustomerListSet) {
        onRefreshCustomerListSet(null);
      }
    };
  }, [onRefreshCustomerListSet, fetchCustomers]);

  // 외부에서 모달을 열 때 폼 데이터 설정
  useEffect(() => {
    if (editModalVisible && editingCustomer) {
      const address1 = editingCustomer.personal_info?.address?.address1 || '';
      setCurrentAddress1(address1);
      
      form.setFieldsValue({
        name: editingCustomer.personal_info?.name,
        name_en: editingCustomer.personal_info?.name_en,
        birth_date: editingCustomer.personal_info?.birth_date ? dayjs(editingCustomer.personal_info.birth_date) : null,
        gender: editingCustomer.personal_info?.gender,
        phone: editingCustomer.personal_info?.phone,
        email: editingCustomer.personal_info?.email,
        postal_code: editingCustomer.personal_info?.address?.postal_code,
        address1: address1,
        address2: editingCustomer.personal_info?.address?.address2,
        customer_type: editingCustomer.insurance_info?.customer_type,
        risk_level: editingCustomer.insurance_info?.risk_level,
        annual_premium: editingCustomer.insurance_info?.annual_premium,
        total_coverage: editingCustomer.insurance_info?.total_coverage
      });
    }
  }, [editModalVisible, editingCustomer, form]);

  // 모달이 열릴 때 고객명 필드에 자동 포커스
  useEffect(() => {
    if (modalVisible) {
      // 모달 애니메이션 완료 후 포커스 설정
      setTimeout(() => {
        if (customerNameInputRef.current) {
          customerNameInputRef.current.focus();
        }
      }, 100);
    }
  }, [modalVisible]);

  const handleTableChange = (page, pageSize) => {
    setIsResponsive(false); // 수동 설정 시 반응형 모드 비활성화
    setPagination({
      current: page,
      pageSize: pageSize,
      total: pagination.total
    });
  };

  const handleResponsiveModeChange = (responsive) => {
    setIsResponsive(responsive);
    if (responsive) {
      // DOM 업데이트 후 계산하도록 지연
      setTimeout(() => {
        const newPageSize = calculateItemsPerPage();
        setPagination(prev => ({
          ...prev,
          pageSize: newPageSize,
          current: 1
        }));
      }, 50);
    } else {
      // Auto-fit 해제시 기본값으로 복귀
      setPagination(prev => ({
        ...prev,
        pageSize: 10,
        current: 1
      }));
    }
  };

  // 통합 모달 열기 함수
  const openCustomerModal = (customer = null) => {
    setInternalEditingCustomer(customer);
    setInternalModalVisible(true);
    
    if (customer) {
      // 수정 모드: 기존 데이터 로드
      const address1 = customer.personal_info?.address?.address1 || '';
      setCurrentAddress1(address1);
      
      form.setFieldsValue({
        ...customer.personal_info,
        birth_date: customer.personal_info.birth_date ? dayjs(customer.personal_info.birth_date) : null,
        postal_code: customer.personal_info?.address?.postal_code,
        address1: address1,
        address2: customer.personal_info?.address?.address2,
        customer_type: customer.insurance_info?.customer_type,
        risk_level: customer.insurance_info?.risk_level,
        annual_premium: customer.insurance_info?.annual_premium,
        total_coverage: customer.insurance_info?.total_coverage
      });
    } else {
      // 새 등록 모드: 폼 초기화
      form.resetFields();
      setCurrentAddress1('');
    }
  };

  // 통합 모달 닫기 함수
  const closeCustomerModal = () => {
    // 내부 상태가 활성화된 경우
    if (internalModalVisible) {
      setInternalModalVisible(false);
      setInternalEditingCustomer(null);
    } 
    // 외부 상태가 활성화된 경우
    else if (onEditModalClose) {
      onEditModalClose();
    }
    setCurrentAddress1('');
    form.resetFields();
  };

  // 통합 제출 함수
  const handleSubmit = async (values) => {
    try {
      const customerData = {
        personal_info: {
          name: values.name,
          name_en: values.name_en,
          birth_date: values.birth_date ? values.birth_date.toDate() : null,
          gender: values.gender,
          phone: values.phone,
          email: values.email,
          address: {
            postal_code: values.postal_code,
            address1: values.address1,
            address2: values.address2
          }
        },
        insurance_info: {
          customer_type: values.customer_type,
          risk_level: values.risk_level,
          annual_premium: values.annual_premium,
          total_coverage: values.total_coverage
        },
        contracts: [],
        documents: [],
        consultations: []
      };

      let result;
      if (currentEditingCustomer) {
        // 수정
        result = await CustomerService.updateCustomer(currentEditingCustomer._id, customerData);
      } else {
        // 새 등록
        result = await CustomerService.createCustomer(customerData);
      }

      if (result.success) {
        closeCustomerModal();
        fetchCustomers();
        
        // 외부 콜백 호출 (고객 정보 업데이트 알림)
        if (onCustomerUpdated) {
          onCustomerUpdated();
        }
      }
    } catch (error) {
      console.error('CustomerManagement.handleSubmit:', error);
    }
  };


  const showCustomerDocuments = async (customerId) => {
    setDocumentsDrawerVisible(true);
    
    const result = await CustomerService.getCustomerDocuments(customerId);
    if (result.success) {
      setCustomerDocuments(result.data);
    }
  };

  const handleCustomerNameClick = (customerId) => {
    if (onCustomerClick) {
      onCustomerClick(customerId);
    }
  };

  const handleCustomerRowSelect = (customer) => {
    if (onCustomerClick) {
      onCustomerClick(customer._id);
    }
  };

  // 새로운 검색 핸들러
  const handleAdvancedSearch = (searchValue, filters) => {
    setSearchText(searchValue);
    setSearchFilters(filters);
    setPagination(prev => ({
      ...prev,
      current: 1 // 검색 시 첫 페이지로 이동
    }));
  };

  const handleFilterChange = (filters) => {
    setSearchFilters(filters);
  };

  const columns = [
    {
      title: '고객명',
      dataIndex: ['personal_info', 'name'],
      key: 'name',
      width: 200,
      render: (name, record) => {
        const { Icon, color } = getCustomerTypeIconWithColor(record);
        
        return (
          <Space>
            <Icon style={{ color }} />
            <span 
              style={{ 
                fontWeight: 'bold', 
                color: '#1890ff', 
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
              onClick={() => handleCustomerNameClick(record._id)}
            >
              {name}
            </span>
            {record.insurance_info?.risk_level === '고위험' && 
              <Tag color="red">고위험</Tag>
            }
          </Space>
        );
      }
    },
    {
      title: '연락처',
      dataIndex: ['personal_info', 'phone'],
      key: 'phone',
      width: 150,
      render: phone => phone && (
        <Space>
          <PhoneOutlined />
          <span>{phone}</span>
        </Space>
      )
    },
    {
      title: '고객 유형',
      dataIndex: ['insurance_info', 'customer_type'],
      key: 'customer_type',
      width: 100,
      render: type => type && <Tag color={type === '법인' ? 'blue' : 'green'}>{type}</Tag>
    },
    {
      title: '문서 수',
      key: 'documents_count',
      width: 100,
      render: (_, record) => (
        <Button 
          variant="link" 
          icon={<FileTextOutlined />}
          onClick={() => showCustomerDocuments(record._id)}
        >
          {record.documents?.length || 0}개
        </Button>
      )
    },
    {
      title: '상태',
      dataIndex: ['meta', 'status'],
      key: 'status',
      width: 80,
      render: status => {
        const color = status === 'active' ? 'green' : 'red';
        const text = status === 'active' ? '활성' : '비활성';
        return <Tag color={color}>{text}</Tag>;
      }
    },
    {
      title: '등록일',
      dataIndex: ['meta', 'created_at'],
      key: 'created_at',
      width: 120,
      render: date => date && dayjs(date).format('YYYY-MM-DD')
    }
  ];

  const documentColumns = [
    {
      title: '파일명',
      dataIndex: 'originalName',
      key: 'originalName'
    },
    {
      title: '문서 유형',
      dataIndex: 'relationship',
      key: 'relationship',
      render: type => <Tag>{type}</Tag>
    },
    {
      title: '처리 상태',
      dataIndex: 'overallStatus',
      key: 'status',
      render: status => {
        const statusConfig = {
          completed: { color: 'green', text: '완료' },
          processing: { color: 'blue', text: '처리중' },
          error: { color: 'red', text: '오류' },
          pending: { color: 'orange', text: '대기' }
        };
        const config = statusConfig[status] || { color: 'default', text: status };
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    },
    {
      title: '연결일',
      dataIndex: 'linkedAt',
      key: 'linkedAt',
      render: date => date && dayjs(date).format('YYYY-MM-DD')
    }
  ];

  return (
    <div>
      {/* 고객 관리 제목 */}
      <div style={{ 
        padding: '16px 0 16px 0',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <UserOutlined />
        <span style={{ fontSize: '20px', fontWeight: 600, color: 'var(--color-text-primary)' }}>고객 관리</span>
        {searchText && (
          <span style={{ color: 'var(--color-primary)', fontSize: '16px' }}>
            - "{searchText}" 검색결과 ({customers.length}건)
          </span>
        )}
        {!searchText && (
          <span style={{ color: 'var(--color-text-tertiary)', fontSize: '16px' }}>
            ({pagination.total}건)
          </span>
        )}
      </div>

      {!showRegionalView && !showRelationshipView && (
        <CustomerSearchBar
          onSearch={handleAdvancedSearch}
          onFilterChange={handleFilterChange}
          loading={loading}
          rightActions={
            <Button 
              variant="primary" 
              icon={<PlusOutlined />}
              onClick={() => openCustomerModal()}
            >
              새 고객 등록
            </Button>
          }
        />
      )}
      
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        height: 'calc(100vh - 100px)',
        minHeight: 0,
        background: 'var(--color-surface-1)',
        borderRadius: '8px',
        boxShadow: '0 1px 3px 0 var(--color-shadow-sm)'
      }}>

        {/* 컨텐츠 영역 */}
        <div style={{ 
          flex: 1,
          overflowY: showRegionalView ? 'hidden' : 'auto', // 지역별 뷰에서는 스크롤 비활성화
          minHeight: 0,
          paddingBottom: '50px'
        }}>
        {showRegionalView ? (
          <CustomerRegionalTreeView 
            onCustomerSelect={handleCustomerNameClick}
            selectedCustomerId={null}
          />
        ) : showRelationshipView ? (
          <RelationshipProvider>
            <CustomerRelationshipTreeView 
              onCustomerSelect={handleCustomerNameClick}
              selectedCustomerId={null}
            />
          </RelationshipProvider>
        ) : (
          <Table
            columns={columns}
            dataSource={customers}
            rowKey="_id"
            loading={loading}
            scroll={{ 
              x: false,
              y: 'calc(100vh - 340px)' // 적절한 여백으로 조정
            }}
            tableLayout="fixed"
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: pagination.total,
              showSizeChanger: !isResponsive,
              showQuickJumper: false,
              onChange: (page, pageSize) => {
                setPagination(prev => ({
                  ...prev,
                  current: page
                }));
              },
              onShowSizeChange: handleTableChange,
              showTotal: (total, range) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  <span>
                    {range[0]}-{range[1]} of {total} customers
                  </span>
                  
                  {/* 반응형 모드 토글 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '13px',
                      color: 'var(--color-text-secondary)',
                      cursor: 'pointer',
                      userSelect: 'none'
                    }}>
                      <input
                        type="checkbox"
                        checked={isResponsive}
                        onChange={(e) => handleResponsiveModeChange(e.target.checked)}
                        style={{
                          cursor: 'pointer',
                          accentColor: 'var(--color-primary)'
                        }}
                      />
                      Auto-fit to screen
                    </label>
                  </div>
                  
                  {/* 반응형 모드일 때 현재 아이템 수 표시 */}
                  {isResponsive && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ 
                        fontSize: '13px', 
                        color: 'var(--color-text-secondary)',
                        fontWeight: 'normal',
                        textDecoration: 'none'
                      }}>
                        📱 {pagination.pageSize} per page (auto)
                      </span>
                    </div>
                  )}
                </div>
              ),
              className: 'fixed-bottom-pagination'
            }}
            onRow={(record) => ({
              onClick: () => handleCustomerRowSelect(record),
              style: {
                cursor: 'pointer'
              }
            })}
          />
        )}
        </div>
      </div>

      {/* 통합 고객 모달 */}
      <Modal
        title={
          <div 
            style={{ cursor: 'move' }}
            onMouseDown={(e) => {
              const modal = e.target.closest('.ant-modal');
              if (!modal) return;
              
              e.preventDefault();
              
              // 마우스 클릭 지점과 모달 좌상단 간의 오프셋 계산
              const rect = modal.getBoundingClientRect();
              const offsetX = e.clientX - rect.left;
              const offsetY = e.clientY - rect.top;
              
              const handleMouseMove = (moveEvent) => {
                // 마우스 위치에서 오프셋을 빼서 모달의 새로운 좌상단 위치 계산
                const newX = moveEvent.clientX - offsetX;
                const newY = moveEvent.clientY - offsetY;
                
                // 화면 경계 체크
                const maxX = window.innerWidth - modal.offsetWidth;
                const maxY = window.innerHeight - modal.offsetHeight;
                
                const clampedX = Math.max(0, Math.min(newX, maxX));
                const clampedY = Math.max(0, Math.min(newY, maxY));
                
                modal.style.left = `${clampedX}px`;
                modal.style.top = `${clampedY}px`;
                modal.style.transform = 'none';
                modal.style.position = 'fixed';
              };
              
              const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
                document.body.style.userSelect = '';
              };
              
              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
              document.body.style.userSelect = 'none';
            }}
          >
            {currentEditingCustomer ? "고객 정보 수정" : "새 고객 등록"}
          </div>
        }
        open={modalVisible}
        onCancel={closeCustomerModal}
        footer={null}
        width={800}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Tabs defaultActiveKey="personal">
            <TabPane tab="기본 정보" key="personal">
              <Form.Item label="고객명" name="name" rules={[{ required: true, message: '고객명을 입력해주세요' }]}>
                <Input ref={customerNameInputRef} />
              </Form.Item>
              
              <Form.Item label="영문명" name="name_en">
                <Input />
              </Form.Item>
              
              <Form.Item label="생년월일" name="birth_date">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
              
              <Form.Item label="성별" name="gender">
                <Select>
                  <Option value="M">남성</Option>
                  <Option value="F">여성</Option>
                </Select>
              </Form.Item>
              
              <Form.Item label="휴대폰번호" name="phone">
                <Input />
              </Form.Item>
              
              <Form.Item label="이메일" name="email">
                <Input type="email" />
              </Form.Item>
            </TabPane>
            
            <TabPane tab="주소 정보" key="address">
              <Form.Item label="주소">
                <div style={{ border: '1px solid var(--color-border)', borderRadius: '6px', padding: '16px', backgroundColor: 'var(--color-bg-tertiary)' }}>
                  {/* 주소 검색 영역 */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ marginBottom: '8px', fontWeight: '500', color: 'var(--color-text-primary)' }}>📍 주소 검색</div>
                    <Row gutter={8}>
                      <Col span={18}>
                        <Input
                          placeholder="도로명 또는 지번 주소를 검색하세요 (예: 테헤란로 123)"
                          onClick={() => setAddressSearchVisible(true)}
                          onFocus={(e) => {
                            e.target.blur();
                            setAddressSearchVisible(true);
                          }}
                          readOnly
                          style={{ 
                            cursor: 'pointer',
                            backgroundColor: 'var(--color-bg-primary)',
                            color: 'var(--color-text-primary)'
                          }}
                        />
                      </Col>
                      <Col span={6}>
                        <Button 
                          variant="primary" 
                          icon={<SearchOutlined />}
                          onClick={() => setAddressSearchVisible(true)}
                          block
                        >
                          검색
                        </Button>
                      </Col>
                    </Row>
                  </div>
                  
                  {/* 검색 결과 표시 영역 */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ marginBottom: '8px', fontWeight: '500', color: 'var(--color-text-primary)' }}>🏠 검색된 주소</div>
                    <Row gutter={8}>
                      <Col span={8}>
                        <Form.Item name="postal_code" style={{ marginBottom: 0 }}>
                          <Input 
                            placeholder="우편번호"
                            readOnly
                            style={{ backgroundColor: 'var(--color-bg-primary)', color: 'var(--color-text-secondary)' }}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={16}>
                        <Form.Item name="address1" style={{ marginBottom: 0 }}>
                          <Input 
                            placeholder="주소를 검색하면 자동으로 채워집니다"
                            readOnly
                            style={{ backgroundColor: 'var(--color-bg-primary)', color: 'var(--color-text-secondary)' }}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  </div>
                  
                  {/* 상세주소 입력 영역 */}
                  <div>
                    <div style={{ marginBottom: '8px', fontWeight: '500', color: 'var(--color-text-primary)' }}>✏️ 상세주소 입력</div>
                    <Form.Item name="address2" style={{ marginBottom: 0 }}>
                      <Input 
                        placeholder={currentAddress1 ? "상세주소를 입력하세요 (동/호수, 건물명 등)" : "❌ 주소검색을 먼저 해주세요"}
                        style={{ 
                          backgroundColor: currentAddress1 ? 'var(--color-bg-primary)' : 'var(--color-bg-tertiary)',
                          border: currentAddress1 ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                          borderRadius: '6px',
                          color: currentAddress1 ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)'
                        }}
                        disabled={!currentAddress1}
                        readOnly={!currentAddress1}
                      />
                    </Form.Item>
                  </div>
                </div>
              </Form.Item>
              
              {/* AddressSearchInput 숨김 컴포넌트 */}
              <div style={{ position: 'absolute', left: '-9999px', visibility: 'hidden' }}>
                <AddressSearchInput 
                  form={form} 
                  modalVisible={addressSearchVisible}
                  onModalVisibleChange={setAddressSearchVisible}
                  onChange={(address) => {
                    setCurrentAddress1(address.address1 || '');
                    form.setFieldsValue({
                      postal_code: address.postal_code,
                      address1: address.address1,
                      address2: address.address2
                    });
                  }}
                />
              </div>
            </TabPane>
            
            <TabPane tab="보험 정보" key="insurance">
              <Form.Item 
                label="고객 유형" 
                name="customer_type"
                rules={[{ required: true, message: '고객 유형을 선택해주세요' }]}
                initialValue="개인"
              >
                <Select placeholder="고객 유형을 선택하세요">
                  <Option value="개인">개인</Option>
                  <Option value="법인">법인</Option>
                </Select>
              </Form.Item>
              
              <Form.Item label="위험도" name="risk_level">
                <Select>
                  <Option value="저위험">저위험</Option>
                  <Option value="중위험">중위험</Option>
                  <Option value="고위험">고위험</Option>
                </Select>
              </Form.Item>
              
              <Form.Item label="연간 보험료" name="annual_premium">
                <Input type="number" addonAfter="원" />
              </Form.Item>
              
              <Form.Item label="총 보장금액" name="total_coverage">
                <Input type="number" addonAfter="원" />
              </Form.Item>
            </TabPane>
          </Tabs>
          
          <div style={{ textAlign: 'right', marginTop: 24 }}>
            <Space>
              <Button variant="secondary" onClick={closeCustomerModal}>취소</Button>
              <Button variant="primary" type="submit">
                {currentEditingCustomer ? '수정' : '등록'}
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* 고객 문서 목록 Drawer */}
      <Drawer
        title="고객 관련 문서"
        placement="right"
        onClose={() => setDocumentsDrawerVisible(false)}
        open={documentsDrawerVisible}
        width={600}
      >
        <Table
          columns={documentColumns}
          dataSource={customerDocuments}
          rowKey="_id"
          pagination={false}
          size="small"
        />
      </Drawer>
    </div>
  );
};

export default CustomerManagement;