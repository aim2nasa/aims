import React, { useState, useEffect } from 'react';
import { 
  Table, Button, Modal, Form, Input, Select, DatePicker, 
  Space, Tag, Card, message,
  Tabs, Drawer, Row, Col
} from 'antd';
import { 
  PlusOutlined, UserOutlined, FileTextOutlined, PhoneOutlined,
  SearchOutlined, BankOutlined, IdcardOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import AddressSearchInput from './AddressSearchInput';
import CustomerService from '../services/customerService';
import CustomerRegionalTreeView from './CustomerRegionalTreeView';
import CustomerRelationshipTreeView from './CustomerRelationshipTreeView';
import { RelationshipProvider } from '../contexts/RelationshipContext';

const { Option } = Select;
const { TabPane } = Tabs;

const CustomerManagement = ({ onCustomerClick, selectedMenuKey, onRefreshCustomerListSet, editModalVisible, editingCustomer, onEditModalClose, onCustomerUpdated }) => {
  // 고객 목록 관리
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  });
  const [searchText, setSearchText] = useState('');
  const [showRegionalView, setShowRegionalView] = useState(false);
  const [showRelationshipView, setShowRelationshipView] = useState(false);

  // 통합 모달 관리 - 외부 props 우선
  const [internalModalVisible, setInternalModalVisible] = useState(false);
  const [internalEditingCustomer, setInternalEditingCustomer] = useState(null);
  
  // 외부에서 제어되는 경우 외부 props 사용, 그렇지 않으면 내부 상태 사용
  const modalVisible = editModalVisible !== undefined ? editModalVisible : internalModalVisible;
  const currentEditingCustomer = editingCustomer !== undefined ? editingCustomer : internalEditingCustomer;
  const [currentAddress1, setCurrentAddress1] = useState('');
  const [addressSearchVisible, setAddressSearchVisible] = useState(false);
  
  // 기타
  const [customerDocuments, setCustomerDocuments] = useState([]);
  const [documentsDrawerVisible, setDocumentsDrawerVisible] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchCustomers();
  }, [pagination.current, pagination.pageSize]);

  // selectedMenuKey 변경 시 뷰 모드 자동 활성화
  useEffect(() => {
    if (selectedMenuKey === 'customers-relationship') {
      setShowRelationshipView(true);
      setShowRegionalView(false);
    } else if (selectedMenuKey === 'customers-regional') {
      setShowRegionalView(true);
      setShowRelationshipView(false);
    } else if (selectedMenuKey === 'customers-all') {
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
  }, [searchText]);

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
  }, [onRefreshCustomerListSet]);

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

  const fetchCustomers = async () => {
    setLoading(true);
    const result = await CustomerService.getCustomers({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText
    });
    
    if (result.success) {
      setCustomers(result.data.customers);
      setPagination(prev => ({
        ...prev,
        total: result.data.pagination.totalCount
      }));
    }
    setLoading(false);
  };

  const handleTableChange = (page, pageSize) => {
    setPagination({
      current: page,
      pageSize: pageSize,
      total: pagination.total
    });
  };

  // 통합 모달 열기 함수
  const openCustomerModal = (customer = null) => {
    if (editModalVisible !== undefined) {
      // 외부에서 제어되는 경우 - 외부 상태는 외부에서 관리
      return;
    }
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
    if (onEditModalClose) {
      // 외부에서 제어되는 경우 외부 콜백 호출
      onEditModalClose();
    } else {
      // 내부에서 제어되는 경우
      setInternalModalVisible(false);
      setInternalEditingCustomer(null);
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

  const columns = [
    {
      title: '고객명',
      dataIndex: ['personal_info', 'name'],
      key: 'name',
      width: 200,
      render: (name, record) => {
        const isIndividual = record.insurance_info?.customer_type === '개인';
        const CustomerIcon = isIndividual ? IdcardOutlined : BankOutlined;
        const iconColor = isIndividual ? '#52c41a' : '#1890ff';
        
        return (
          <Space>
            <CustomerIcon style={{ color: iconColor }} />
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
          type="link" 
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
      <Card
        title={
          <Space>
            <UserOutlined />
            고객 관리
            {searchText && (
              <span style={{ color: '#1890ff', fontSize: '14px' }}>
                - "{searchText}" 검색결과 ({customers.length}건)
              </span>
            )}
            {!searchText && (
              <span style={{ color: '#999', fontSize: '14px' }}>
                ({pagination.total}건)
              </span>
            )}
          </Space>
        }
        extra={
          <Space>
            <Input
              placeholder="고객명, 전화번호, 이메일 검색"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 300 }}
              prefix={<SearchOutlined />}
              allowClear
              disabled={showRegionalView || showRelationshipView}
            />
            <Button 
              type="primary" 
              icon={<PlusOutlined />}
              onClick={() => openCustomerModal()}
            >
              새 고객 등록
            </Button>
          </Space>
        }
      >
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
            scroll={{ x: false }}
            tableLayout="fixed"
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: pagination.total,
              showSizeChanger: true,
              showQuickJumper: true,
              onChange: handleTableChange,
              onShowSizeChange: handleTableChange
            }}
            onRow={(record) => ({
              onClick: () => handleCustomerRowSelect(record),
              style: {
                cursor: 'pointer'
              }
            })}
          />
        )}
      </Card>

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
                <Input />
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
                <div style={{ border: '1px solid #d9d9d9', borderRadius: '6px', padding: '16px', backgroundColor: '#fafafa' }}>
                  {/* 주소 검색 영역 */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ marginBottom: '8px', fontWeight: '500', color: '#262626' }}>📍 주소 검색</div>
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
                          style={{ cursor: 'pointer' }}
                        />
                      </Col>
                      <Col span={6}>
                        <Button 
                          type="primary" 
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
                    <div style={{ marginBottom: '8px', fontWeight: '500', color: '#262626' }}>🏠 검색된 주소</div>
                    <Row gutter={8}>
                      <Col span={8}>
                        <Form.Item name="postal_code" style={{ marginBottom: 0 }}>
                          <Input 
                            placeholder="우편번호"
                            readOnly
                            style={{ backgroundColor: '#fff', color: '#595959' }}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={16}>
                        <Form.Item name="address1" style={{ marginBottom: 0 }}>
                          <Input 
                            placeholder="주소를 검색하면 자동으로 채워집니다"
                            readOnly
                            style={{ backgroundColor: '#fff', color: '#595959' }}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  </div>
                  
                  {/* 상세주소 입력 영역 */}
                  <div>
                    <div style={{ marginBottom: '8px', fontWeight: '500', color: '#262626' }}>✏️ 상세주소 입력</div>
                    <Form.Item name="address2" style={{ marginBottom: 0 }}>
                      <Input 
                        placeholder={currentAddress1 ? "상세주소를 입력하세요 (동/호수, 건물명 등)" : "❌ 주소검색을 먼저 해주세요"}
                        style={{ 
                          backgroundColor: currentAddress1 ? '#fff' : '#f5f5f5',
                          border: currentAddress1 ? '2px solid #1890ff' : '1px solid #d9d9d9',
                          borderRadius: '6px',
                          color: currentAddress1 ? '#000' : '#999'
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
              <Form.Item label="고객 유형" name="customer_type">
                <Select>
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
              <Button onClick={closeCustomerModal}>취소</Button>
              <Button type="primary" htmlType="submit">
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