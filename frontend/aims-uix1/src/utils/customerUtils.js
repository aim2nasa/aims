import { IdcardOutlined, BankOutlined } from '@ant-design/icons';

// 고객 유형별 색상 상수
export const CUSTOMER_TYPE_COLORS = {
  INDIVIDUAL: '#52c41a', // 개인 - 녹색
  CORPORATE: '#1890ff'   // 법인 - 파란색
};

// 고객 유형 판별 함수
export const isIndividualCustomer = (customer) => {
  return customer?.insurance_info?.customer_type === '개인';
};

// 고객 유형별 아이콘 반환 함수
export const getCustomerTypeIcon = (customer) => {
  return isIndividualCustomer(customer) ? IdcardOutlined : BankOutlined;
};

// 고객 유형별 색상 반환 함수
export const getCustomerTypeColor = (customer) => {
  return isIndividualCustomer(customer) 
    ? CUSTOMER_TYPE_COLORS.INDIVIDUAL 
    : CUSTOMER_TYPE_COLORS.CORPORATE;
};

// 고객 유형별 아이콘과 색상을 함께 반환하는 함수
export const getCustomerTypeIconWithColor = (customer) => {
  const isIndividual = isIndividualCustomer(customer);
  return {
    Icon: isIndividual ? IdcardOutlined : BankOutlined,
    color: isIndividual ? CUSTOMER_TYPE_COLORS.INDIVIDUAL : CUSTOMER_TYPE_COLORS.CORPORATE
  };
};