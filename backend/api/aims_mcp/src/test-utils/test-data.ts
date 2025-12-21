/**
 * Test Data Factory
 *
 * Cross-system 테스트를 위한 테스트 데이터 생성 및 정리
 *
 * 사용 예:
 *   const factory = new TestDataFactory(mcp, api);
 *   const customer = await factory.createCustomer({ name: '테스트' });
 *   // ... 테스트 수행
 *   await factory.cleanup(); // 생성된 데이터 정리
 */

import { MCPTestClient } from './mcp-client.js';
import { APITestClient } from './api-client.js';

// ============================================================
// 타입 정의
// ============================================================

export interface Customer {
  _id: string;
  id?: string;
  name: string;
  type: 'individual' | 'corporate' | '개인' | '법인';
  status?: string;
  memo?: string;
  personal_info?: {
    phone?: string;
    email?: string;
    birth_date?: string;
    address?: string;
  };
  meta?: {
    created_at?: string;
    updated_at?: string;
  };
}

export interface Contract {
  _id: string;
  id?: string;
  agent_id: string;
  customer_id: string;
  policy_number: string;
  product_id?: string;
  product_name?: string;
  status?: string;
  contract_date?: string;
  premium?: number;
  payment_status?: string;
}

export interface Document {
  _id: string;
  id?: string;
  customerId?: string;
  fileName: string;
  filePath?: string;
  fileType?: string;
  status?: string;
}

export interface Memo {
  content: string;
  timestamp?: string;
  index?: number;
}

export interface Relationship {
  _id: string;
  customerId1: string;
  customerId2: string;
  relationshipType: string;
}

// ============================================================
// 테스트 데이터 팩토리
// ============================================================

export class TestDataFactory {
  private mcp: MCPTestClient;
  private api: APITestClient;
  private createdCustomerIds: string[] = [];
  private createdContractIds: string[] = [];
  private createdRelationshipIds: string[] = [];
  private testProductId: string | null = null;

  constructor(mcp: MCPTestClient, api: APITestClient) {
    this.mcp = mcp;
    this.api = api;
  }

  // --------------------------------------------------------
  // 고객 관련
  // --------------------------------------------------------

  /**
   * 테스트 고객 생성 (MCP 사용)
   */
  async createCustomer(overrides: Partial<{
    name: string;
    type: 'individual' | 'corporate';
    phone: string;
    email: string;
    birthDate: string;
    address: string;
  }> = {}): Promise<Customer> {
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const customerName = overrides.name || `테스트고객_${uniqueSuffix}`;

    // MCP는 customerType: '개인' | '법인' 형식 사용
    const customerTypeMap = {
      individual: '개인',
      corporate: '법인'
    } as const;
    const customerType = customerTypeMap[overrides.type || 'individual'];

    const result = await this.mcp.call<{
      success: boolean;
      customerId: string;
      name: string;
      customerType: string;
    }>('create_customer', {
      name: customerName,
      customerType,
      phone: overrides.phone,
      email: overrides.email,
      birthDate: overrides.birthDate,
      address: overrides.address
    });

    const customerId = result.customerId;
    if (customerId) {
      this.createdCustomerIds.push(customerId);
    }

    // Customer 형태로 반환
    return {
      _id: customerId,
      id: customerId,
      name: result.name || customerName,
      type: result.customerType === '개인' ? 'individual' : 'corporate'
    };
  }

  /**
   * 테스트 고객 생성 (API 사용)
   */
  async createCustomerViaAPI(overrides: Partial<{
    name: string;
    type: 'individual' | 'corporate';
    phone: string;
    email: string;
    birth_date: string;
    address: string;
  }> = {}): Promise<Customer> {
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const response = await this.api.post<Customer>('/customers', {
      name: overrides.name || `테스트고객API_${uniqueSuffix}`,
      type: overrides.type || 'individual',
      personal_info: {
        phone: overrides.phone,
        email: overrides.email,
        birth_date: overrides.birth_date,
        address: overrides.address
      }
    });

    const customer = this.api.unwrap(response);
    const customerId = customer._id || customer.id;
    if (customerId) {
      this.createdCustomerIds.push(customerId);
    }

    return customer;
  }

  // --------------------------------------------------------
  // 메모 관련
  // --------------------------------------------------------

  /**
   * 고객 메모 추가 (MCP 사용)
   */
  async addMemo(customerId: string, content: string): Promise<Memo> {
    const result = await this.mcp.call<{
      success: boolean;
      addedContent: string;
      timestamp: string;
    }>('add_customer_memo', {
      customerId,
      content
    });

    return {
      content: result.addedContent || content,
      timestamp: result.timestamp
    };
  }

  /**
   * 고객 메모 조회 (MCP 사용)
   * 실제 응답: { customerId, customerName, memo, hasContent }
   */
  async getMemos(customerId: string): Promise<{ memo: string; hasContent: boolean }> {
    return await this.mcp.call<{ memo: string; hasContent: boolean }>('list_customer_memos', { customerId });
  }

  // --------------------------------------------------------
  // 계약 관련
  // --------------------------------------------------------

  /**
   * 테스트 계약 생성 (API 사용)
   */
  async createContract(customerId: string, overrides: Partial<{
    policy_number: string;
    product_id: string;
    status: string;
    contract_date: string;
    premium: number;
    payment_status: string;
  }> = {}): Promise<Contract> {
    const uniqueSuffix = `${Date.now()}`;
    const productId = overrides.product_id || await this.getTestProductId();

    const response = await this.api.post<Contract>('/contracts', {
      agent_id: this.api.getUserId(),
      customer_id: customerId,
      policy_number: overrides.policy_number || `POL-TEST-${uniqueSuffix}`,
      product_id: productId,
      contract_date: overrides.contract_date || new Date().toISOString().split('T')[0],
      premium: overrides.premium || 100000,
      payment_status: overrides.payment_status || '정상'
    });

    const contract = this.api.unwrap(response);
    const contractId = contract._id || contract.id;
    if (contractId) {
      this.createdContractIds.push(contractId);
    }

    return contract;
  }

  /**
   * 테스트용 보험 상품 ID 조회
   */
  async getTestProductId(): Promise<string> {
    if (this.testProductId) {
      return this.testProductId;
    }

    // 기존 상품 검색
    const result = await this.mcp.call<{ products: Array<{ id: string; _id: string }> }>('search_products', {
      limit: 1
    });

    if (result.products && result.products.length > 0) {
      this.testProductId = result.products[0].id || result.products[0]._id;
      return this.testProductId;
    }

    // 상품이 없으면 임의의 ObjectId 반환 (테스트용)
    this.testProductId = '000000000000000000000000';
    return this.testProductId;
  }

  // --------------------------------------------------------
  // 관계 관련 (현재 API 엔드포인트 없음)
  // --------------------------------------------------------

  /**
   * 고객 관계 생성 (API 사용)
   * 주의: /api/customer-relationships 엔드포인트가 현재 없음
   */
  async createRelationship(
    _customerId1: string,
    _customerId2: string,
    _relationshipType: string
  ): Promise<Relationship> {
    throw new Error('customer-relationships API endpoint not available');
  }

  // --------------------------------------------------------
  // 유틸리티
  // --------------------------------------------------------

  /**
   * 고객과 메모가 있는 테스트 데이터 생성
   */
  async createCustomerWithMemo(
    customerName?: string,
    memoContent?: string
  ): Promise<{ customer: Customer; memo: Memo }> {
    const customer = await this.createCustomer({ name: customerName });
    const customerId = customer._id || customer.id;
    if (!customerId) {
      throw new Error('Failed to get customer ID');
    }
    const memo = await this.addMemo(customerId, memoContent || `테스트 메모 ${Date.now()}`);
    return { customer, memo };
  }

  /**
   * 고객과 계약이 있는 테스트 데이터 생성
   */
  async createCustomerWithContract(
    customerName?: string
  ): Promise<{ customer: Customer; contract: Contract }> {
    const customer = await this.createCustomer({ name: customerName });
    const customerId = customer._id || customer.id;
    if (!customerId) {
      throw new Error('Failed to get customer ID');
    }
    const contract = await this.createContract(customerId);
    return { customer, contract };
  }

  /**
   * 관계가 있는 두 고객 생성
   * 주의: customer-relationships API가 없어서 실제 관계는 생성되지 않음
   */
  async createRelatedCustomers(
    _relationshipType: string = 'spouse'
  ): Promise<{ customer1: Customer; customer2: Customer }> {
    const customer1 = await this.createCustomer({ name: `관계고객1_${Date.now()}` });
    const customer2 = await this.createCustomer({ name: `관계고객2_${Date.now()}` });
    return { customer1, customer2 };
  }

  // --------------------------------------------------------
  // 정리
  // --------------------------------------------------------

  /**
   * 생성된 모든 테스트 데이터 정리
   * (역순으로 삭제하여 의존성 문제 방지)
   */
  async cleanup(): Promise<void> {
    // 관계 삭제 (현재 API 없음, 나중을 위해 보존)
    this.createdRelationshipIds = [];

    // 계약 삭제
    for (const id of this.createdContractIds.reverse()) {
      try {
        await this.api.delete(`/contracts/${id}`);
      } catch {
        // 이미 삭제된 경우 무시
      }
    }
    this.createdContractIds = [];

    // 고객 삭제
    for (const id of this.createdCustomerIds.reverse()) {
      try {
        await this.api.delete(`/customers/${id}`);
      } catch {
        // 이미 삭제된 경우 무시
      }
    }
    this.createdCustomerIds = [];
  }

  /**
   * 생성된 데이터 ID 목록 조회
   */
  getCreatedIds(): {
    customers: string[];
    contracts: string[];
    relationships: string[];
  } {
    return {
      customers: [...this.createdCustomerIds],
      contracts: [...this.createdContractIds],
      relationships: [...this.createdRelationshipIds]
    };
  }
}
