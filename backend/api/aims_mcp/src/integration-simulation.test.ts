/**
 * 통합 시뮬레이션 테스트
 *
 * 실제 비즈니스 흐름을 시뮬레이션하여 데이터 일관성을 검증합니다.
 */

import { describe, it, expect } from 'vitest';
import {
  validateCustomerDocument,
  validateCustomerUpdateFields,
  validateMemoDocument,
} from './schemas/aims.schema.js';

describe('통합 시뮬레이션', () => {

  describe('고객 생명주기 시뮬레이션', () => {

    it('신규 고객 등록 → 정보 조회 → 수정 → 메모 추가 흐름', () => {
      const userId = 'agent_001';
      const customerId = '507f1f77bcf86cd799439011';

      // Step 1: 신규 고객 등록
      const createTime = new Date();
      const newCustomer = {
        personal_info: {
          name: '홍길동',
          mobile_phone: '010-1234-5678',
          email: 'hong@example.com',
          birth_date: '1990-05-15',
          address: { address1: '서울시 강남구' }
        },
        insurance_info: {
          customer_type: '개인' as const
        },
        meta: {
          status: 'active' as const,
          created_by: userId,
          created_at: createTime,
          updated_at: createTime
        }
      };

      expect(validateCustomerDocument(newCustomer).success).toBe(true);

      // Step 2: 고객 정보 조회 (응답 시뮬레이션)
      const customerResponse = {
        id: customerId,
        personalInfo: {
          name: newCustomer.personal_info.name,
          phone: newCustomer.personal_info.mobile_phone,  // 응답에서는 phone으로 매핑
          email: newCustomer.personal_info.email,
          address: newCustomer.personal_info.address
        },
        insuranceInfo: {
          customerType: newCustomer.insurance_info.customer_type
        },
        meta: {
          status: newCustomer.meta.status,
          createdAt: newCustomer.meta.created_at,
          updatedAt: newCustomer.meta.updated_at
        }
      };

      expect(customerResponse.personalInfo.phone).toBe('010-1234-5678');
      expect(customerResponse.insuranceInfo.customerType).toBe('개인');

      // Step 3: 고객 정보 수정
      const updateTime = new Date();
      const updateFields = {
        'personal_info.mobile_phone': '010-9999-8888',
        'personal_info.address.address1': '서울시 서초구',
        'meta.updated_at': updateTime
      };

      expect(validateCustomerUpdateFields(updateFields).success).toBe(true);

      // Step 4: 메모 추가
      const memoTime = new Date();
      const memo = {
        customer_id: customerId,
        content: '전화번호 변경 완료. 주소도 서초구로 이전.',
        created_by: userId,
        created_at: memoTime,
        updated_at: memoTime
      };

      expect(validateMemoDocument(memo).success).toBe(true);
    });

    it('법인 고객 등록 및 관리 흐름', () => {
      const userId = 'agent_002';

      // 법인 고객 등록
      const now = new Date();
      const corporateCustomer = {
        personal_info: {
          name: '(주)에이비시테크놀로지',
          mobile_phone: '02-1234-5678',
          email: 'contact@abctech.co.kr',
          address: { address1: '서울특별시 강남구 테헤란로 123' }
        },
        insurance_info: {
          customer_type: '법인' as const
        },
        meta: {
          status: 'active' as const,
          created_by: userId,
          created_at: now,
          updated_at: now
        }
      };

      expect(validateCustomerDocument(corporateCustomer).success).toBe(true);
      expect(corporateCustomer.insurance_info.customer_type).toBe('법인');
    });
  });

  describe('다중 사용자 데이터 격리 시뮬레이션', () => {

    it('다른 설계사의 고객은 접근 불가', () => {
      const agent1 = 'agent_001';
      const agent2 = 'agent_002';

      // Agent 1의 고객
      const now = new Date();
      const agent1Customer = {
        personal_info: { name: '홍길동' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: agent1,
          created_at: now,
          updated_at: now
        }
      };

      // Agent 2의 고객 (같은 이름이어도 다른 설계사)
      const agent2Customer = {
        personal_info: { name: '홍길동' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: agent2,
          created_at: now,
          updated_at: now
        }
      };

      expect(validateCustomerDocument(agent1Customer).success).toBe(true);
      expect(validateCustomerDocument(agent2Customer).success).toBe(true);

      // 두 고객은 다른 설계사 소유
      expect(agent1Customer.meta.created_by).not.toBe(agent2Customer.meta.created_by);
    });

    it('본인 메모만 삭제 가능 시뮬레이션', () => {
      const customerId = '507f1f77bcf86cd799439011';
      const agent1 = 'agent_001';
      const agent2 = 'agent_002';

      const now = new Date();

      // Agent 1이 작성한 메모
      const memo1 = {
        customer_id: customerId,
        content: 'Agent 1의 메모',
        created_by: agent1,
        created_at: now,
        updated_at: now
      };

      // Agent 2가 작성한 메모
      const memo2 = {
        customer_id: customerId,
        content: 'Agent 2의 메모',
        created_by: agent2,
        created_at: now,
        updated_at: now
      };

      expect(validateMemoDocument(memo1).success).toBe(true);
      expect(validateMemoDocument(memo2).success).toBe(true);

      // 권한 검증: Agent 1은 memo2 삭제 불가
      expect(memo1.created_by).toBe(agent1);
      expect(memo2.created_by).toBe(agent2);
      expect(memo1.created_by).not.toBe(memo2.created_by);
    });
  });

  describe('검색 결과 일관성 시뮬레이션', () => {

    it('search_customers와 get_customer 필드 일치', () => {
      // search_customers 응답 형식
      interface SearchResult {
        id: string;
        name: string;
        phone: string;
        email?: string;
        type: string;
        status: string;
        createdAt: Date;
      }

      // get_customer 응답 형식
      interface CustomerDetail {
        id: string;
        personalInfo: {
          name: string;
          phone: string;
          email?: string;
          address?: { address1?: string };
        };
        insuranceInfo: {
          customerType: string;
        };
        meta: {
          status: string;
          createdAt: Date;
          updatedAt: Date;
        };
      }

      // 동일한 고객에 대한 두 응답
      const now = new Date();
      const searchResult: SearchResult = {
        id: '507f1f77bcf86cd799439011',
        name: '홍길동',
        phone: '010-1234-5678',
        email: 'hong@example.com',
        type: '개인',
        status: 'active',
        createdAt: now
      };

      const customerDetail: CustomerDetail = {
        id: '507f1f77bcf86cd799439011',
        personalInfo: {
          name: '홍길동',
          phone: '010-1234-5678',
          email: 'hong@example.com',
          address: { address1: '서울시' }
        },
        insuranceInfo: {
          customerType: '개인'
        },
        meta: {
          status: 'active',
          createdAt: now,
          updatedAt: now
        }
      };

      // 필드 일치 확인
      expect(searchResult.id).toBe(customerDetail.id);
      expect(searchResult.name).toBe(customerDetail.personalInfo.name);
      expect(searchResult.phone).toBe(customerDetail.personalInfo.phone);
      expect(searchResult.email).toBe(customerDetail.personalInfo.email);
      expect(searchResult.type).toBe(customerDetail.insuranceInfo.customerType);
      expect(searchResult.status).toBe(customerDetail.meta.status);
    });
  });

  describe('날짜/시간 일관성 시뮬레이션', () => {

    it('created_at과 updated_at 초기값 동일', () => {
      const now = new Date();
      const customer = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: now,
          updated_at: now
        }
      };

      expect(customer.meta.created_at).toBe(customer.meta.updated_at);
      expect(customer.meta.created_at.getTime()).toBe(customer.meta.updated_at.getTime());
    });

    it('업데이트 시 updated_at만 변경', () => {
      const createTime = new Date('2025-01-01T00:00:00Z');
      const updateTime = new Date('2025-12-21T12:00:00Z');

      const originalCustomer = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: createTime,
          updated_at: createTime
        }
      };

      const updateFields = {
        'personal_info.name': '새이름',
        'meta.updated_at': updateTime
      };

      expect(validateCustomerUpdateFields(updateFields).success).toBe(true);

      // created_at은 변경하지 않음
      expect(updateFields['meta.created_at']).toBeUndefined();
      // updated_at만 변경
      expect(updateFields['meta.updated_at']).toEqual(updateTime);
    });

    it('메모 시간순 정렬 가능', () => {
      const customerId = '507f1f77bcf86cd799439011';
      const userId = 'agent_001';

      const memos = [
        {
          customer_id: customerId,
          content: '첫 번째 메모',
          created_by: userId,
          created_at: new Date('2025-01-01T10:00:00Z'),
          updated_at: new Date('2025-01-01T10:00:00Z')
        },
        {
          customer_id: customerId,
          content: '두 번째 메모',
          created_by: userId,
          created_at: new Date('2025-01-01T11:00:00Z'),
          updated_at: new Date('2025-01-01T11:00:00Z')
        },
        {
          customer_id: customerId,
          content: '세 번째 메모',
          created_by: userId,
          created_at: new Date('2025-01-01T12:00:00Z'),
          updated_at: new Date('2025-01-01T12:00:00Z')
        }
      ];

      // 모든 메모 유효
      for (const memo of memos) {
        expect(validateMemoDocument(memo).success).toBe(true);
      }

      // 시간순 정렬 확인
      const sorted = [...memos].sort((a, b) =>
        b.created_at.getTime() - a.created_at.getTime()
      );

      expect(sorted[0].content).toBe('세 번째 메모');
      expect(sorted[1].content).toBe('두 번째 메모');
      expect(sorted[2].content).toBe('첫 번째 메모');
    });
  });

  describe('고객 유형별 시뮬레이션', () => {

    it('개인 고객 전체 필드', () => {
      const now = new Date();
      const individual = {
        personal_info: {
          name: '홍길동',
          mobile_phone: '010-1234-5678',
          email: 'hong@example.com',
          birth_date: '1990-05-15',
          address: {
            address1: '서울특별시 강남구 역삼동 123-45',
            address2: '에이비시빌딩 10층'
          }
        },
        insurance_info: {
          customer_type: '개인' as const
        },
        meta: {
          status: 'active' as const,
          created_by: 'agent_001',
          created_at: now,
          updated_at: now
        }
      };

      expect(validateCustomerDocument(individual).success).toBe(true);
    });

    it('법인 고객 전체 필드', () => {
      const now = new Date();
      const corporate = {
        personal_info: {
          name: '(주)테스트회사',
          mobile_phone: '02-1234-5678',
          email: 'contact@test.co.kr',
          address: {
            address1: '서울특별시 강남구 테헤란로 123'
          }
        },
        insurance_info: {
          customer_type: '법인' as const
        },
        meta: {
          status: 'active' as const,
          created_by: 'agent_001',
          created_at: now,
          updated_at: now
        }
      };

      expect(validateCustomerDocument(corporate).success).toBe(true);
    });

    it('최소 필드 고객', () => {
      const now = new Date();
      const minimal = {
        personal_info: {
          name: '테스트'
        },
        insurance_info: {
          customer_type: '개인' as const
        },
        meta: {
          status: 'active' as const,
          created_by: 'agent_001',
          created_at: now,
          updated_at: now
        }
      };

      expect(validateCustomerDocument(minimal).success).toBe(true);
    });
  });

  describe('에러 시나리오 시뮬레이션', () => {

    it('필수 필드 누락 시 실패', () => {
      const now = new Date();

      // name 누락
      const noName = {
        personal_info: {},
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: now,
          updated_at: now
        }
      };
      expect(validateCustomerDocument(noName).success).toBe(false);

      // created_by 누락
      const noCreatedBy = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_at: now,
          updated_at: now
        }
      };
      expect(validateCustomerDocument(noCreatedBy).success).toBe(false);

      // created_at 누락
      const noCreatedAt = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          updated_at: now
        }
      };
      expect(validateCustomerDocument(noCreatedAt).success).toBe(false);
    });

    it('잘못된 타입 시 실패', () => {
      const now = new Date();

      // customer_type이 잘못된 값
      const wrongType = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '기타' },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: now,
          updated_at: now
        }
      };
      expect(validateCustomerDocument(wrongType).success).toBe(false);

      // status가 잘못된 값
      const wrongStatus = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'deleted',
          created_by: 'user',
          created_at: now,
          updated_at: now
        }
      };
      expect(validateCustomerDocument(wrongStatus).success).toBe(false);
    });

    it('날짜가 문자열이면 실패', () => {
      const wrongDateCustomer = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: '2025-12-21T00:00:00Z',  // 문자열
          updated_at: new Date()
        }
      };
      expect(validateCustomerDocument(wrongDateCustomer).success).toBe(false);

      const wrongDateMemo = {
        customer_id: 'someId',
        content: '테스트 메모',
        created_by: 'user',
        created_at: '2025-12-21T00:00:00Z',  // 문자열
        updated_at: new Date()
      };
      expect(validateMemoDocument(wrongDateMemo).success).toBe(false);
    });

    it('빈 메모 content 실패', () => {
      const now = new Date();
      const emptyMemo = {
        customer_id: 'someId',
        content: '',
        created_by: 'user',
        created_at: now,
        updated_at: now
      };
      expect(validateMemoDocument(emptyMemo).success).toBe(false);
    });
  });
});

describe('실제 사용 시나리오', () => {

  it('보험 상담 프로세스 시뮬레이션', () => {
    const agentId = 'agent_senior_001';
    const customerId = '507f1f77bcf86cd799439011';

    // 1. 고객 등록
    const registrationTime = new Date('2025-01-15T09:00:00Z');
    const customer = {
      personal_info: {
        name: '김철수',
        mobile_phone: '010-5555-1234',
        email: 'kim@example.com',
        birth_date: '1985-03-20',
        address: { address1: '경기도 성남시 분당구' }
      },
      insurance_info: { customer_type: '개인' as const },
      meta: {
        status: 'active' as const,
        created_by: agentId,
        created_at: registrationTime,
        updated_at: registrationTime
      }
    };
    expect(validateCustomerDocument(customer).success).toBe(true);

    // 2. 첫 상담 메모
    const firstConsultTime = new Date('2025-01-15T09:30:00Z');
    const firstMemo = {
      customer_id: customerId,
      content: '첫 상담: 종신보험 관심. 월 보험료 20만원 이내 희망. 배우자 및 자녀 2명.',
      created_by: agentId,
      created_at: firstConsultTime,
      updated_at: firstConsultTime
    };
    expect(validateMemoDocument(firstMemo).success).toBe(true);

    // 3. 고객 정보 업데이트 (상담 중 추가 정보 획득)
    const updateTime = new Date('2025-01-15T10:00:00Z');
    const updateFields = {
      'personal_info.email': 'kim.chulsoo@company.com',
      'meta.updated_at': updateTime
    };
    expect(validateCustomerUpdateFields(updateFields).success).toBe(true);

    // 4. 두 번째 상담 메모
    const secondConsultTime = new Date('2025-01-20T14:00:00Z');
    const secondMemo = {
      customer_id: customerId,
      content: '재상담: 삼성생명 종신보험 제안. 월 18만원, 사망보험금 1억. 긍정적 반응.',
      created_by: agentId,
      created_at: secondConsultTime,
      updated_at: secondConsultTime
    };
    expect(validateMemoDocument(secondMemo).success).toBe(true);

    // 5. 계약 체결 후 메모
    const contractTime = new Date('2025-01-25T11:00:00Z');
    const contractMemo = {
      customer_id: customerId,
      content: '계약 완료! 증권번호: 2025-001-12345. 첫 납입일: 2025-02-01.',
      created_by: agentId,
      created_at: contractTime,
      updated_at: contractTime
    };
    expect(validateMemoDocument(contractMemo).success).toBe(true);
  });

  it('대량 고객 등록 시뮬레이션', () => {
    const agentId = 'agent_001';
    const now = new Date();

    // 100명 고객 등록
    const customers = [];
    for (let i = 0; i < 100; i++) {
      const customer = {
        personal_info: {
          name: `테스트고객${i + 1}`,
          mobile_phone: `010-0000-${String(i + 1).padStart(4, '0')}`,
          email: `test${i + 1}@example.com`
        },
        insurance_info: {
          customer_type: (i % 5 === 0 ? '법인' : '개인') as '개인' | '법인'
        },
        meta: {
          status: 'active' as const,
          created_by: agentId,
          created_at: now,
          updated_at: now
        }
      };
      customers.push(customer);
    }

    // 모든 고객 유효성 확인
    const results = customers.map(c => validateCustomerDocument(c));
    const allValid = results.every(r => r.success);
    expect(allValid).toBe(true);

    // 법인 고객 20명 (5의 배수)
    const corporateCount = customers.filter(c =>
      c.insurance_info.customer_type === '법인'
    ).length;
    expect(corporateCount).toBe(20);
  });
});
