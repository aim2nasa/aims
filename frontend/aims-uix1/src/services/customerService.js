import axios from 'axios';
import { message } from 'antd';

const BASE_URL = 'http://tars.giize.com:3010/api';

class CustomerService {
  // 고객 목록 조회
  static async getCustomers(params = {}) {
    try {
      const { page = 1, limit = 10, search = '', ...filters } = params;
      
      // 필터 파라미터 정리
      const queryParams = { page, limit, search };
      
      // 고급 검색 필터 추가
      if (filters.customerType) queryParams.customerType = filters.customerType;
      if (filters.region) queryParams.region = filters.region;
      if (filters.startDate) queryParams.startDate = filters.startDate;
      if (filters.endDate) queryParams.endDate = filters.endDate;
      if (filters.hasDocuments) queryParams.hasDocuments = filters.hasDocuments;
      
      const response = await axios.get(`${BASE_URL}/customers`, {
        params: queryParams
      });
      
      if (response.data.success) {
        return {
          success: true,
          data: response.data.data
        };
      }
      
      throw new Error(response.data.error || '고객 목록 조회에 실패했습니다.');
    } catch (error) {
      message.error('고객 목록 조회에 실패했습니다.');
      console.error('CustomerService.getCustomers:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 고객 상세 조회
  static async getCustomer(customerId) {
    try {
      const response = await axios.get(`${BASE_URL}/customers/${customerId}`);
      
      if (response.data.success) {
        return {
          success: true,
          data: response.data.data
        };
      }
      
      throw new Error(response.data.error || '고객 정보를 불러오는데 실패했습니다.');
    } catch (error) {
      message.error('고객 정보를 불러오는데 실패했습니다.');
      console.error('CustomerService.getCustomer:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 고객 생성
  static async createCustomer(customerData) {
    try {
      const response = await axios.post(`${BASE_URL}/customers`, customerData);
      
      if (response.data.success) {
        if (response.data.data.was_renamed) {
          message.warning(response.data.data.message, 5);
        } else {
          message.success('고객이 등록되었습니다.');
        }
        
        return {
          success: true,
          data: response.data.data
        };
      }
      
      throw new Error(response.data.error || '고객 등록에 실패했습니다.');
    } catch (error) {
      message.error('고객 정보 저장에 실패했습니다.');
      console.error('CustomerService.createCustomer:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 고객 수정
  static async updateCustomer(customerId, customerData) {
    try {
      const response = await axios.put(`${BASE_URL}/customers/${customerId}`, customerData);
      
      if (response.data.success) {
        message.success('고객 정보가 수정되었습니다.');
        return {
          success: true,
          data: response.data.data
        };
      }
      
      throw new Error(response.data.error || '고객 수정에 실패했습니다.');
    } catch (error) {
      message.error('고객 정보 저장에 실패했습니다.');
      console.error('CustomerService.updateCustomer:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 고객 삭제
  static async deleteCustomer(customerId) {
    try {
      const response = await axios.delete(`${BASE_URL}/customers/${customerId}`);
      
      if (response.data.success) {
        message.success('고객이 삭제되었습니다.');
        return {
          success: true
        };
      }
      
      throw new Error(response.data.error || '고객 삭제에 실패했습니다.');
    } catch (error) {
      message.error('고객 삭제에 실패했습니다.');
      console.error('CustomerService.deleteCustomer:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 고객 문서 조회
  static async getCustomerDocuments(customerId) {
    try {
      const response = await axios.get(`${BASE_URL}/customers/${customerId}/documents`);
      
      if (response.data.success) {
        return {
          success: true,
          data: response.data.data.documents
        };
      }
      
      throw new Error(response.data.error || '고객 문서 조회에 실패했습니다.');
    } catch (error) {
      message.error('고객 문서 조회에 실패했습니다.');
      console.error('CustomerService.getCustomerDocuments:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default CustomerService;