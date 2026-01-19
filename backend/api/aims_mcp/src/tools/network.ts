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
    description: `특정 고객의 관계 네트워크를 다이어그램으로 조회합니다. 가족(직계)과 법인 관계를 표시하며, 법인의 2차 관계까지 표시됩니다.

응답에 포함된 mermaidDiagram을 그대로 출력하세요. Mermaid 다이어그램으로 렌더링됩니다.`,
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

// 직계 가족 관계 타입
const DIRECT_FAMILY_TYPES = ['spouse', 'parent', 'child'];

function getRelationshipLabel(category: string, type: string): string {
  return RELATIONSHIP_LABELS[category]?.[type] || type;
}

interface RelationshipNode {
  customerId: string;
  customerName: string;
  customerType?: string;
  relationshipLabel: string;
  relationshipCategory: string;
  children?: RelationshipNode[];
}

/**
 * Mermaid 다이어그램 생성 함수
 */
function generateMermaidDiagram(
  centerName: string,
  nodes: RelationshipNode[]
): string {
  if (nodes.length === 0) {
    return `\`\`\`mermaid
graph LR
    A["${centerName}"]
    A --- B["관계 없음"]
\`\`\``;
  }

  const lines: string[] = ['```mermaid', 'graph LR'];
  const centerNodeId = 'CENTER';

  // 중앙 고객 노드
  lines.push(`    ${centerNodeId}["👤 ${centerName}"]`);

  // 1차 관계 노드들
  nodes.forEach((node, idx) => {
    const nodeId = `N${idx}`;
    const icon = node.relationshipCategory === 'family' ? '👨‍👩‍👧' : '🏢';

    // 노드 정의
    lines.push(`    ${nodeId}["${icon} ${node.customerName}"]`);

    // 연결선 (관계 라벨 포함)
    lines.push(`    ${centerNodeId} -->|${node.relationshipLabel}| ${nodeId}`);

    // 2차 관계 (법인의 하위 관계)
    if (node.children && node.children.length > 0) {
      node.children.forEach((child, childIdx) => {
        const childNodeId = `N${idx}C${childIdx}`;
        const childIcon = child.relationshipCategory === 'family' ? '👤' : '👤';

        lines.push(`    ${childNodeId}["${childIcon} ${child.customerName}"]`);
        lines.push(`    ${nodeId} -->|${child.relationshipLabel}| ${childNodeId}`);
      });
    }
  });

  // 스타일 추가
  lines.push('');
  lines.push(`    style ${centerNodeId} fill:#4F46E5,stroke:#4338CA,color:#fff`);

  nodes.forEach((node, idx) => {
    const nodeId = `N${idx}`;
    if (node.relationshipCategory === 'family') {
      lines.push(`    style ${nodeId} fill:#10B981,stroke:#059669,color:#fff`);
    } else {
      lines.push(`    style ${nodeId} fill:#F59E0B,stroke:#D97706,color:#fff`);
    }
  });

  lines.push('```');

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

    const customerName = customer.personal_info?.name || '알 수 없음';

    // 1차 관계 조회
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

    // 1차 관계 정보 정리 (가족 직계 + 법인만)
    const primaryRelations: RelationshipNode[] = [];
    const corporateCustomerIds: string[] = []; // 법인 고객 ID 수집 (2차 관계 조회용)
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

      // 가족은 직계만, 법인은 모두 포함
      const isDirectFamily = category === 'family' && DIRECT_FAMILY_TYPES.includes(type);
      const isCorporate = category === 'corporate';

      if (!isDirectFamily && !isCorporate) return;

      const customerType = relatedCustomer?.insurance_info?.customer_type;

      const node: RelationshipNode = {
        customerId: relatedId || '',
        customerName: relatedCustomer?.personal_info?.name || '알 수 없음',
        customerType,
        relationshipLabel: getRelationshipLabel(category, type),
        relationshipCategory: category
      };

      primaryRelations.push(node);

      // 법인 고객이면 2차 관계 조회 대상에 추가
      if (isCorporate && customerType === '법인') {
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

        // 각 법인 고객에 2차 관계 연결
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
          const corporateNode = primaryRelations.find(n => n.customerId === corporateId);
          if (corporateNode) {
            if (!corporateNode.children) {
              corporateNode.children = [];
            }
            corporateNode.children.push({
              customerId: relatedId,
              customerName: secondaryCustomer.personal_info?.name || '알 수 없음',
              customerType: secondaryCustomer.insurance_info?.customer_type,
              relationshipLabel: getRelationshipLabel(category, type),
              relationshipCategory: category
            });
          }
        });
      }
    }

    // 가족 관계를 먼저, 법인 관계를 나중에 정렬
    primaryRelations.sort((a, b) => {
      if (a.relationshipCategory === 'family' && b.relationshipCategory !== 'family') return -1;
      if (a.relationshipCategory !== 'family' && b.relationshipCategory === 'family') return 1;
      return 0;
    });

    // Mermaid 다이어그램 생성
    const mermaidDiagram = generateMermaidDiagram(customerName, primaryRelations);

    // 총 관계 수 계산
    let totalRelationships = primaryRelations.length;
    primaryRelations.forEach(node => {
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
          mermaidDiagram,
          instruction: '위의 mermaidDiagram을 그대로 출력하세요. 절대 수정하지 마세요.'
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
