import { z, ZodError } from 'zod';
import { ObjectId } from 'mongodb';
import { getDB, toSafeObjectId, COLLECTIONS, formatZodError } from '../db.js';
import { getCurrentUserId } from '../auth.js';
import { sendErrorLog } from '../systemLogger.js';

// 스키마 정의
export const getCustomerNetworkSchema = z.object({
  customerId: z.string().describe('고객 ID')
});

// Tool 정의
export const networkToolDefinitions = [
  {
    name: 'get_customer_network',
    description: `특정 고객의 관계 네트워크를 조회합니다.

**반드시 모든 카테고리를 표시해야 합니다:**
- 가족 관계 (family): 배우자, 부모, 자녀, 형제자매
- 법인 관계 (corporate): 대표이사, 임원, 직원, 주주 등
- 전문 관계 (professional): 동료, 상사, 부하 등
- 친척 관계 (relative): 삼촌/이모, 조카, 사촌 등
- 사회 관계 (social): 친구, 지인, 이웃 등

**응답 형식 (예시):**
🔗 **가족 관계**
- 배우자: 김다영 (010-1234-5678)
- 자녀: 김준호

🔗 **법인 관계**
- 대표이사: (주)캐치업코리아

📊 총 3건의 관계가 있습니다.

⚠️ byCategory에 있는 모든 카테고리를 빠짐없이 표시하세요!`,
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

    // 관계 조회 - relationship_info 내부 필드 사용 (relationships.ts와 동일 구조)
    const relationships = await db.collection(COLLECTIONS.CUSTOMER_RELATIONSHIPS)
      .find({
        $or: [
          { 'relationship_info.from_customer_id': objectId },
          { 'relationship_info.to_customer_id': objectId }
        ],
        'relationship_info.status': 'active'
      })
      .toArray();

    // 관련 고객 ID 수집
    const relatedCustomerIds = new Set<string>();
    relationships.forEach(rel => {
      const fromId = rel.relationship_info?.from_customer_id?.toString();
      const toId = rel.relationship_info?.to_customer_id?.toString();

      if (fromId && fromId !== params.customerId) {
        relatedCustomerIds.add(fromId);
      }
      if (toId && toId !== params.customerId) {
        relatedCustomerIds.add(toId);
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

    // 관계 정보 정리
    const network = relationships.map(rel => {
      const fromId = rel.relationship_info?.from_customer_id?.toString();
      const toId = rel.relationship_info?.to_customer_id?.toString();
      const isSource = fromId === params.customerId;
      const relatedId = isSource ? toId : fromId;
      const relatedCustomer = customerMap.get(relatedId || '');

      const category = rel.relationship_info?.relationship_category;
      const type = rel.relationship_info?.relationship_type;

      return {
        relatedCustomerId: relatedId,
        relatedCustomerName: relatedCustomer?.personal_info?.name || '알 수 없음',
        relatedCustomerPhone: relatedCustomer?.personal_info?.mobile_phone,
        relatedCustomerType: relatedCustomer?.insurance_info?.customer_type,
        relationshipCategory: category,
        relationshipType: type,
        relationshipLabel: getRelationshipLabel(category, type),
        direction: isSource ? 'outgoing' : 'incoming',
        notes: rel.relationship_details?.notes
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

    // 카테고리별 요약 생성
    const categorySummary: Record<string, string[]> = {};
    const categoryLabels: Record<string, string> = {
      family: '가족 관계',
      corporate: '법인 관계',
      professional: '전문 관계',
      relative: '친척 관계',
      social: '사회 관계',
      other: '기타 관계'
    };

    // 중복 제거를 위해 relatedCustomerId 기준으로 유니크하게 처리
    const uniqueRelationships = new Map<string, typeof network[0]>();
    network.forEach(rel => {
      const key = `${rel.relatedCustomerId}-${rel.relationshipCategory}-${rel.relationshipType}`;
      if (!uniqueRelationships.has(key)) {
        uniqueRelationships.set(key, rel);
      }
    });

    const uniqueNetwork = Array.from(uniqueRelationships.values());

    uniqueNetwork.forEach(rel => {
      const category = rel.relationshipCategory || 'other';
      if (!categorySummary[category]) {
        categorySummary[category] = [];
      }
      const phoneInfo = rel.relatedCustomerPhone ? ` (${rel.relatedCustomerPhone})` : '';
      categorySummary[category].push(`${rel.relationshipLabel}: ${rel.relatedCustomerName}${phoneInfo}`);
    });

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          customerId: params.customerId,
          customerName: customer.personal_info?.name,
          totalRelationships: uniqueNetwork.length,
          byCategory,
          relationships: uniqueNetwork,
          // AI가 응답 형식을 명확히 알 수 있도록 display_hint 추가
          display_hint: {
            instruction: '아래 categorySummary의 모든 카테고리를 빠짐없이 표시하세요',
            categorySummary,
            categoryLabels,
            format_example: '🔗 **가족 관계**\\n- 배우자: 김다영\\n\\n🔗 **법인 관계**\\n- 대표이사: (주)캐치업코리아\\n\\n📊 총 N건의 관계가 있습니다.'
          }
        }, null, 2)
      }]
    };
  } catch (error) {
    // 에러 로깅
    console.error('[MCP] get_customer_network 에러:', error);
    sendErrorLog('aims_mcp', 'get_customer_network 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `관계 네트워크 조회 실패: ${errorMessage}`
      }]
    };
  }
}
