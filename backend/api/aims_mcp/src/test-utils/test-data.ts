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
import {
  loadCustomers,
  loadContracts,
  loadRelationships,
  loadDocuments,
  getFilePath,
  getFileBuffer,
  type CustomerFixture,
  type ContractFixture,
  type RelationshipFixture,
  type DocumentFixture
} from '../__tests__/fixtures/index.js';

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
   * 고객 관계 생성 (MCP 사용)
   */
  async createRelationship(
    customerId1: string,
    customerId2: string,
    relationshipType: string,
    category: 'family' | 'social' | 'professional' = 'family'
  ): Promise<Relationship> {
    const result = await this.mcp.call<{
      success: boolean;
      relationshipId: string;
      message: string;
    }>('create_relationship', {
      fromCustomerId: customerId1,
      toCustomerId: customerId2,
      relationshipType,
      category
    });

    if (result.relationshipId) {
      this.createdRelationshipIds.push(result.relationshipId);
    }

    return {
      _id: result.relationshipId,
      customerId1,
      customerId2,
      relationshipType
    };
  }

  /**
   * 관계 삭제 (MCP 사용)
   */
  async deleteRelationship(customerId: string, relationshipId: string): Promise<void> {
    await this.mcp.call('delete_relationship', {
      customerId,
      relationshipId
    });
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

    // fixture ID 매핑 초기화
    this.fixtureIdMap.clear();
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

  // --------------------------------------------------------
  // Fixtures 연동
  // --------------------------------------------------------

  /** fixture ID → 실제 DB ID 매핑 */
  private fixtureIdMap: Map<string, string> = new Map();

  /**
   * Fixture ID로 실제 DB ID 조회
   */
  getDbId(fixtureId: string): string | undefined {
    return this.fixtureIdMap.get(fixtureId);
  }

  /**
   * Fixture에서 고객 생성
   */
  async createCustomerFromFixture(fixture: CustomerFixture): Promise<Customer> {
    const customer = await this.createCustomer({
      name: fixture.personal_info.name,
      type: fixture.insurance_info.customer_type === '개인' ? 'individual' : 'corporate',
      phone: fixture.personal_info.mobile_phone,
      email: fixture.personal_info.email,
      birthDate: fixture.personal_info.birth_date,
      address: fixture.personal_info.address?.address1
    });

    this.fixtureIdMap.set(fixture.id, customer._id);
    return customer;
  }

  /**
   * Fixture에서 계약 생성
   */
  async createContractFromFixture(fixture: ContractFixture): Promise<Contract> {
    const customerId = this.fixtureIdMap.get(fixture.customer_ref);
    if (!customerId) {
      throw new Error(`Customer fixture not found: ${fixture.customer_ref}. Create customer first.`);
    }

    // 상대 날짜 처리
    let expiryDate = fixture.expiry_date;
    if (fixture.expiry_date_relative_days !== undefined) {
      const date = new Date();
      date.setDate(date.getDate() + fixture.expiry_date_relative_days);
      expiryDate = date.toISOString().split('T')[0];
    }

    const contract = await this.createContract(customerId, {
      policy_number: fixture.policy_number,
      contract_date: fixture.contract_date,
      premium: fixture.premium,
      payment_status: fixture.payment_status || '정상'
    });

    this.fixtureIdMap.set(fixture.id, contract._id);
    return contract;
  }

  /**
   * Fixture에서 관계 생성
   */
  async createRelationshipFromFixture(fixture: RelationshipFixture): Promise<Relationship> {
    const fromId = this.fixtureIdMap.get(fixture.from_customer_ref);
    const toId = this.fixtureIdMap.get(fixture.to_customer_ref);

    if (!fromId || !toId) {
      throw new Error(
        `Customer fixtures not found: ${fixture.from_customer_ref}, ${fixture.to_customer_ref}. Create customers first.`
      );
    }

    const relationship = await this.createRelationship(
      fromId,
      toId,
      fixture.relationship_type,
      fixture.relationship_category
    );

    this.fixtureIdMap.set(fixture.id, relationship._id);
    return relationship;
  }

  /**
   * 모든 fixtures에서 데이터 생성
   * @param options 생성할 데이터 유형 선택
   */
  async createAllFromFixtures(options: {
    customers?: boolean | string[];  // true = 전체, string[] = 특정 ID만
    contracts?: boolean | string[];
    relationships?: boolean | string[];
  } = { customers: true }): Promise<{
    customers: Customer[];
    contracts: Contract[];
    relationships: Relationship[];
  }> {
    const result: {
      customers: Customer[];
      contracts: Contract[];
      relationships: Relationship[];
    } = {
      customers: [],
      contracts: [],
      relationships: []
    };

    // 고객 생성
    if (options.customers) {
      const fixtures = loadCustomers();
      const targetIds = Array.isArray(options.customers) ? options.customers : null;

      for (const fixture of fixtures) {
        if (targetIds && !targetIds.includes(fixture.id)) continue;
        const customer = await this.createCustomerFromFixture(fixture);
        result.customers.push(customer);
      }
    }

    // 계약 생성
    if (options.contracts) {
      const fixtures = loadContracts();
      const targetIds = Array.isArray(options.contracts) ? options.contracts : null;

      for (const fixture of fixtures) {
        if (targetIds && !targetIds.includes(fixture.id)) continue;
        // 해당 고객이 생성되어 있는지 확인
        if (!this.fixtureIdMap.has(fixture.customer_ref)) continue;

        try {
          const contract = await this.createContractFromFixture(fixture);
          result.contracts.push(contract);
        } catch (e) {
          console.warn(`Failed to create contract ${fixture.id}:`, e);
        }
      }
    }

    // 관계 생성
    if (options.relationships) {
      const fixtures = loadRelationships();
      const targetIds = Array.isArray(options.relationships) ? options.relationships : null;

      for (const fixture of fixtures) {
        if (targetIds && !targetIds.includes(fixture.id)) continue;
        // 양쪽 고객이 생성되어 있는지 확인
        if (!this.fixtureIdMap.has(fixture.from_customer_ref)) continue;
        if (!this.fixtureIdMap.has(fixture.to_customer_ref)) continue;

        try {
          const relationship = await this.createRelationshipFromFixture(fixture);
          result.relationships.push(relationship);
        } catch (e) {
          console.warn(`Failed to create relationship ${fixture.id}:`, e);
        }
      }
    }

    return result;
  }

  /**
   * 가족 시나리오 생성 (홍길동 가족)
   */
  async createFamilyScenario(): Promise<{
    father: Customer;
    mother: Customer;
    child: Customer;
    relationships: Relationship[];
  }> {
    const data = await this.createAllFromFixtures({
      customers: ['customer_hong', 'customer_kim', 'customer_hongminsu'],
      relationships: true
    });

    return {
      father: data.customers.find(c => c.name === '홍길동')!,
      mother: data.customers.find(c => c.name === '김영희')!,
      child: data.customers.find(c => c.name === '홍민수')!,
      relationships: data.relationships
    };
  }

  /**
   * 법인 고객 시나리오 생성
   */
  async createCorporateScenario(): Promise<{
    customer: Customer;
    contracts: Contract[];
  }> {
    const data = await this.createAllFromFixtures({
      customers: ['customer_corp_test'],
      contracts: true
    });

    return {
      customer: data.customers[0],
      contracts: data.contracts
    };
  }

  /**
   * 전체 테스트 시나리오 생성 (모든 fixtures)
   */
  async createFullScenario(): Promise<{
    customers: Customer[];
    contracts: Contract[];
    relationships: Relationship[];
  }> {
    return await this.createAllFromFixtures({
      customers: true,
      contracts: true,
      relationships: true
    });
  }
}
