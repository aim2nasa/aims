import React from 'react';
import { Form, Input, Select, DatePicker, Space, Row, Col, Divider } from 'antd';
import { Button } from './common';
import { SaveOutlined, UndoOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import AddressSearchInput from './AddressSearchInput';

const { Option } = Select;

const CustomerEditForm = ({ customer, onSave, onCancel }) => {
  const [form] = Form.useForm();

  React.useEffect(() => {
    if (customer) {
      form.setFieldsValue({
        ...customer.personal_info,
        birth_date: customer.personal_info?.birth_date ? dayjs(customer.personal_info.birth_date) : null,
        postal_code: customer.personal_info?.address?.postal_code,
        address1: customer.personal_info?.address?.address1,
        address2: customer.personal_info?.address?.address2,
        customer_type: customer.insurance_info?.customer_type,
        risk_level: customer.insurance_info?.risk_level,
        annual_premium: customer.insurance_info?.annual_premium,
        total_coverage: customer.insurance_info?.total_coverage
      });
    }
  }, [customer, form]);

  const handleSubmit = (values) => {
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
      }
    };
    onSave(customerData);
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      style={{ padding: '16px 0' }}
      initialValues={{
        customer_type: '개인'
      }}
    >
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item label="고객명" name="name" rules={[{ required: true, message: '고객명을 입력해주세요' }]}>
            <Input />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="영문명" name="name_en">
            <Input />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item label="생년월일" name="birth_date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="성별" name="gender">
            <Select>
              <Option value="M">남성</Option>
              <Option value="F">여성</Option>
            </Select>
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item label="휴대폰번호" name="phone">
            <Input />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="이메일" name="email">
            <Input type="email" />
          </Form.Item>
        </Col>
      </Row>

      <Divider orientation="left">주소 정보</Divider>
      
      <Form.Item label="주소">
        <AddressSearchInput form={form} />
      </Form.Item>

      <Divider orientation="left">보험 정보</Divider>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item label="고객 유형" name="customer_type">
            <Select>
              <Option value="개인">개인</Option>
              <Option value="법인">법인</Option>
            </Select>
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="위험도" name="risk_level">
            <Select>
              <Option value="저위험">저위험</Option>
              <Option value="중위험">중위험</Option>
              <Option value="고위험">고위험</Option>
            </Select>
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item label="연간 보험료" name="annual_premium">
            <Input type="number" addonAfter="원" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="총 보장금액" name="total_coverage">
            <Input type="number" addonAfter="원" />
          </Form.Item>
        </Col>
      </Row>

      <div style={{ textAlign: 'right', marginTop: 24, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
        <Space>
          <Button onClick={onCancel} variant="secondary" icon={<UndoOutlined />}>
            취소
          </Button>
          <Button variant="primary" htmlType="submit" icon={<SaveOutlined />}>
            저장
          </Button>
        </Space>
      </div>
    </Form>
  );
};

export default CustomerEditForm;