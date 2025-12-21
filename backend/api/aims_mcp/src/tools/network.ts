import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { getDB, toSafeObjectId, COLLECTIONS } from '../db.js';
import { getCurrentUserId } from '../auth.js';

// 스키마 정의
export const getCustomerNetworkSchema = z.object({
  customerId: z.string().describe('고객 ID')
});

// Tool 정의
export const networkToolDefinitions = [
  {
    name: 'get_customer_network',
    description: '특정 고객의 관계 네트워크를 조회합니다. 가족, 친척, 지인 등의 관계를 확인할 수 있습니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: '고객 ID' }
      },
      required: ['customerId']
    }
  }
];

// 관계 유형 한글 매핑
const RELATIONSHIP_LABELS: Record<string, Record<string, string>> = {
  family: {
    spouse: '배우자',
    parent: '부모',
    child: '자녀',
    sibling: '형제자매'
  },
  relative: {
    uncle_aunt: '삼촌/이모',
    nephew_niece: '조카',
    cousin: '사촌',
    in_law: '인척'
  },
  social: {
    friend: '친구',
    acquaintance: '지인',
    neighbor: '이웃'
  },
  professional: {
    supervisor: '상사',
    subordinate: '부하',
    colleague: '동료',
    business_partner: '사업 파트너',
    client: '고객',
    service_provider: '서비스 제공자'
  },
  corporate: {
    ceo: '대표이사',
    executive: '임원',
    employee: '직원',
    shareholder: '주주',
    director: '이사',
    company: '회사',
    employer: '고용주'
  }
};

function getRelationshipLabel(category: string, type: string): string {
  return RELATIONSHIP_LABELS[category]?.[type] || type;
}

/**
 * 고객 관계 네트워크 조회 핸들러
 */
export async function handleGetCustomerNetwork(args: unknown) {
  try {
    const params = getCustomerNetworkSchema.parse(args);
    const db = getDB();
    const userId = getCurrentUserId();

    const objectId = toSafeObjectId(params.customerId);
    if (!objectId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '유효하지 않은 고객 ID입니다.' }]
      };
    }

    // 먼저 고객이 해당 설계사의 고객인지 확인
    const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
      _id: objectId,
      'meta.created_by': userId
    });

    if (!customer) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '고객을 찾을 수 없습니다.' }]
      };
    }

    // 관계 조회
    const relationships = await db.collection(COLLECTIONS.CUSTOMER_RELATIONSHIPS)
      .find({
        $or: [
          { source_customer_id: objectId },
          { target_customer_id: objectId }
        ]
      })
      .toArray();

    // 관련 고객 ID 수집 (toString() 한 번만 호출하여 최적화)
    const relatedCustomerIds = new Set<string>();
    relationships.forEach(rel => {
      const sourceId = rel.source_customer_id?.toString();
      const targetId = rel.target_customer_id?.toString();

      if (sourceId && sourceId !== params.customerId) {
        relatedCustomerIds.add(sourceId);
      }
      if (targetId && targetId !== params.customerId) {
        relatedCustomerIds.add(targetId);
      }
    });

    // 관련 고객 정보 조회
    const relatedObjectIds = Array.from(relatedCustomerIds)
      .map(id => toSafeObjectId(id))
      .filter((id): id is ObjectId => id !== null);

    const relatedCustomers = await db.collection(COLLECTIONS.CUSTOMERS)
      .find({
        _id: { $in: relatedObjectIds }
      })
      .project({
        _id: 1,
        'personal_info.name': 1,
        'personal_info.mobile_phone': 1,
        'insurance_info.customer_type': 1
      })
      .toArray();

    const customerMap = new Map(relatedCustomers.map(c => [c._id.toString(), c]));

    // 관계 정보 정리 (toString() 한 번만 호출하여 최적화)
    const network = relationships.map(rel => {
      const sourceId = rel.source_customer_id?.toString();
      const targetId = rel.target_customer_id?.toString();
      const isSource = sourceId === params.customerId;
      const relatedId = isSource ? targetId : sourceId;
      const relatedCustomer = customerMap.get(relatedId || '');

      return {
        relatedCustomerId: relatedId,
        relatedCustomerName: relatedCustomer?.personal_info?.name || '알 수 없음',
        relatedCustomerPhone: relatedCustomer?.personal_info?.mobile_phone,
        relatedCustomerType: relatedCustomer?.insurance_info?.customer_type,
        relationshipCategory: rel.relationship_category,
        relationshipType: rel.relationship_type,
        relationshipLabel: getRelationshipLabel(rel.relationship_category, rel.relationship_type),
        direction: isSource ? 'outgoing' : 'incoming',
        notes: rel.notes
      };
    });

    // 카테고리별 그룹화
    const byCategory: Record<string, typeof network> = {};
    network.forEach(rel => {
      const category = rel.relationshipCategory || 'other';
      if (!byCategory[category]) {
        byCategory[category] = [];
      }
      byCategory[category].push(rel);
    });

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          customerId: params.customerId,
          customerName: customer.personal_info?.name,
          totalRelationships: network.length,
          byCategory,
          relationships: network
        }, null, 2)
      }]
    };
  } catch (error) {
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `관계 네트워크 조회 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
      }]
    };
  }
}
