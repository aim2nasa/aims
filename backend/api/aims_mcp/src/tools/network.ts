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
    description: `특정 고객의 관계 네트워크를 트리 형태로 조회합니다.

응답에 포함된 networkTree를 그대로 출력하세요. 수정하지 마세요.`,
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

// 카테고리 라벨
const CATEGORY_LABELS: Record<string, string> = {
  family: '가족 관계',
  corporate: '법인 관계',
  professional: '전문 관계',
  relative: '친척 관계',
  social: '사회 관계',
  other: '기타 관계'
};

// 관계 노드 인터페이스
interface RelationNode {
  id: string;
  name: string;
  label: string;
  category: string;
  customerType?: string;
  children?: RelationNode[];
}

/**
 * ASCII 트리 생성 함수 (2차 관계 지원)
 */
function generateAsciiTree(
  customerName: string,
  nodes: RelationNode[]
): string {
  if (nodes.length === 0) {
    return `${customerName}\n+-- (관계 없음)`;
  }

  const lines: string[] = [customerName];

  // 카테고리별 그룹화
  const byCategory: Record<string, RelationNode[]> = {};
  nodes.forEach(node => {
    if (!byCategory[node.category]) {
      byCategory[node.category] = [];
    }
    byCategory[node.category].push(node);
  });

  const categories = Object.keys(byCategory);
  categories.forEach((category, catIdx) => {
    const isLastCategory = catIdx === categories.length - 1;
    const catPrefix = isLastCategory ? '+--' : '|--';
    const catLabel = CATEGORY_LABELS[category] || category;

    lines.push(`${catPrefix} ${catLabel}`);

    const categoryNodes = byCategory[category];
    categoryNodes.forEach((node, nodeIdx) => {
      const isLastNode = nodeIdx === categoryNodes.length - 1;
      const linePrefix = isLastCategory ? '    ' : '|   ';
      const nodePrefix = isLastNode ? '+--' : '|--';

      lines.push(`${linePrefix}${nodePrefix} ${node.label}: ${node.name}`);

      // 2차 관계 (children) 출력
      if (node.children && node.children.length > 0) {
        node.children.forEach((child, childIdx) => {
          const isLastChild = childIdx === node.children!.length - 1;
          const childLinePrefix = linePrefix + (isLastNode ? '    ' : '|   ');
          const childPrefix = isLastChild ? '+--' : '|--';

          lines.push(`${childLinePrefix}${childPrefix} ${child.label}: ${child.name}`);
        });
      }
    });
  });

  return lines.join('\n');
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

    // 1차 관계 노드 생성 및 법인 고객 ID 수집
    const relationNodes: RelationNode[] = [];
    const corporateCustomerIds: string[] = [];
    const processedKeys = new Set<string>();

    relationships.forEach(rel => {
      const fromId = rel.relationship_info?.from_customer_id?.toString();
      const toId = rel.relationship_info?.to_customer_id?.toString();
      const isSource = fromId === params.customerId;
      const relatedId = isSource ? toId : fromId;
      const relatedCustomer = customerMap.get(relatedId || '');

      const category = rel.relationship_info?.relationship_category;
      const type = rel.relationship_info?.relationship_type;

      // 중복 방지
      const key = `${relatedId}-${category}-${type}`;
      if (processedKeys.has(key)) return;
      processedKeys.add(key);

      const customerType = relatedCustomer?.insurance_info?.customer_type;

      const node: RelationNode = {
        id: relatedId || '',
        name: relatedCustomer?.personal_info?.name || '알 수 없음',
        label: getRelationshipLabel(category, type),
        category: category || 'other',
        customerType
      };

      relationNodes.push(node);

      // 법인 고객이면 2차 관계 조회 대상에 추가
      if (category === 'corporate' && customerType === '법인') {
        corporateCustomerIds.push(relatedId || '');
      }
    });

    // 2차 관계 조회 (법인 고객들의 관계)
    if (corporateCustomerIds.length > 0) {
      const corporateObjectIds = corporateCustomerIds
        .map(id => toSafeObjectId(id))
        .filter((id): id is ObjectId => id !== null);

      const secondaryRelationships = await db.collection(COLLECTIONS.CUSTOMER_RELATIONSHIPS)
        .find({
          $or: [
            { 'relationship_info.from_customer_id': { $in: corporateObjectIds } },
            { 'relationship_info.to_customer_id': { $in: corporateObjectIds } }
          ],
          'relationship_info.status': 'active'
        })
        .toArray();

      // 2차 관계 고객 ID 수집
      const secondaryCustomerIds = new Set<string>();
      secondaryRelationships.forEach(rel => {
        const fromId = rel.relationship_info?.from_customer_id?.toString();
        const toId = rel.relationship_info?.to_customer_id?.toString();

        // 원래 고객과 1차 관계 고객 제외
        if (fromId && fromId !== params.customerId && !corporateCustomerIds.includes(fromId)) {
          secondaryCustomerIds.add(fromId);
        }
        if (toId && toId !== params.customerId && !corporateCustomerIds.includes(toId)) {
          secondaryCustomerIds.add(toId);
        }
      });

      // 2차 고객 정보 조회
      const secondaryObjectIds = Array.from(secondaryCustomerIds)
        .map(id => toSafeObjectId(id))
        .filter((id): id is ObjectId => id !== null);

      if (secondaryObjectIds.length > 0) {
        const secondaryCustomers = await db.collection(COLLECTIONS.CUSTOMERS)
          .find({ _id: { $in: secondaryObjectIds } })
          .project({
            _id: 1,
            'personal_info.name': 1,
            'insurance_info.customer_type': 1
          })
          .toArray();

        const secondaryCustomerMap = new Map(secondaryCustomers.map(c => [c._id.toString(), c]));

        // 각 법인 노드에 2차 관계 연결
        const processedSecondaryKeys = new Set<string>();

        secondaryRelationships.forEach(rel => {
          const fromId = rel.relationship_info?.from_customer_id?.toString();
          const toId = rel.relationship_info?.to_customer_id?.toString();
          const category = rel.relationship_info?.relationship_category;
          const type = rel.relationship_info?.relationship_type;

          // 법인과 연결된 관계 찾기
          let corporateId: string | null = null;
          let relatedId: string | null = null;

          if (corporateCustomerIds.includes(fromId || '')) {
            corporateId = fromId || null;
            relatedId = toId || null;
          } else if (corporateCustomerIds.includes(toId || '')) {
            corporateId = toId || null;
            relatedId = fromId || null;
          }

          if (!corporateId || !relatedId) return;
          if (relatedId === params.customerId) return; // 원래 고객 제외

          // 중복 방지
          const key = `${corporateId}-${relatedId}-${type}`;
          if (processedSecondaryKeys.has(key)) return;
          processedSecondaryKeys.add(key);

          const secondaryCustomer = secondaryCustomerMap.get(relatedId);
          if (!secondaryCustomer) return;

          // 해당 법인 노드 찾아서 children에 추가
          const corporateNode = relationNodes.find(n => n.id === corporateId);
          if (corporateNode) {
            if (!corporateNode.children) {
              corporateNode.children = [];
            }
            corporateNode.children.push({
              id: relatedId,
              name: secondaryCustomer.personal_info?.name || '알 수 없음',
              label: getRelationshipLabel(category, type),
              category: category || 'other',
              customerType: secondaryCustomer.insurance_info?.customer_type
            });
          }
        });
      }
    }

    // ASCII 트리 생성
    const customerName = customer.personal_info?.name || '알 수 없음';
    const networkTree = generateAsciiTree(customerName, relationNodes);

    // 총 관계 수 계산 (2차 포함)
    let totalRelationships = relationNodes.length;
    relationNodes.forEach(node => {
      if (node.children) {
        totalRelationships += node.children.length;
      }
    });

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          customerId: params.customerId,
          customerName,
          totalRelationships,
          networkTree,
          instruction: '위의 networkTree를 그대로 출력하세요.'
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
