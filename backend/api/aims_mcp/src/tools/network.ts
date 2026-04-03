import { z, ZodError } from 'zod';
import { formatZodError } from '../db.js';
import { getCurrentUserId } from '../auth.js';
import { sendErrorLog } from '../systemLogger.js';
import { queryCustomers, queryRelationships } from '../internalApi.js';

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
    const userId = getCurrentUserId();

    // Internal API 경유: 고객 소유권 확인
    const customerResults = await queryCustomers(
      { _id: params.customerId, 'meta.created_by': userId },
      null, null, 1
    );
    const customer = customerResults[0] || null;

    if (!customer) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '고객을 찾을 수 없습니다.' }]
      };
    }

    // Internal API 경유: 관계 조회 (양방향)
    const [relsFrom, relsTo] = await Promise.all([
      queryRelationships({
        'relationship_info.from_customer_id': params.customerId,
        'relationship_info.status': 'active'
      }),
      queryRelationships({
        'relationship_info.to_customer_id': params.customerId,
        'relationship_info.status': 'active'
      })
    ]);
    const relationships = [...relsFrom, ...relsTo];

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

    // Internal API 경유: 관련 고객 정보 조회
    const relatedIdArray = Array.from(relatedCustomerIds);
    const relatedCustomers = relatedIdArray.length > 0
      ? await queryCustomers(
          { _id: { $in: relatedIdArray } },
          { _id: 1, 'personal_info.name': 1, 'personal_info.mobile_phone': 1, 'insurance_info.customer_type': 1 }
        )
      : [];

    const customerMap = new Map(relatedCustomers.map((c: any) => [c._id?.toString(), c]));

    // 역방향 관계 타입을 기준 고객 관점으로 반전하는 매핑
    // 예: 곽지민→곽승철:parent (곽지민 관점) → 곽승철에서 보면 곽지민은 child
    const REVERSE_TYPE_MAP: Record<string, string> = {
      spouse: 'spouse', parent: 'child', child: 'parent',
      uncle_aunt: 'nephew_niece', nephew_niece: 'uncle_aunt',
      cousin: 'cousin', in_law: 'in_law',
      friend: 'friend', acquaintance: 'acquaintance', neighbor: 'neighbor',
      supervisor: 'subordinate', subordinate: 'supervisor',
      colleague: 'colleague', business_partner: 'business_partner',
      client: 'service_provider', service_provider: 'client',
      ceo: 'company', executive: 'company', employee: 'employer',
      shareholder: 'company', director: 'company',
      company: 'employee', employer: 'employee'
    };

    // 1차 관계 노드 생성 및 법인 고객 ID 수집
    const relationNodes: RelationNode[] = [];
    const corporateCustomerIds: string[] = [];
    const processedRelatedIds = new Set<string>();

    // 정방향 관계 먼저 처리 (from_customer_id = 조회 대상 고객)
    // 이 방향이 올바른 관계 라벨을 가짐 (곽승철→곽지민:child = "곽지민은 자녀")
    relationships
      .filter(rel => rel.relationship_info?.from_customer_id?.toString() === params.customerId)
      .forEach(rel => {
        const toId = rel.relationship_info?.to_customer_id?.toString();
        if (!toId) return;

        const relatedCustomer = customerMap.get(toId);
        const category = rel.relationship_info?.relationship_category;
        const type = rel.relationship_info?.relationship_type;
        const customerType = relatedCustomer?.insurance_info?.customer_type;

        processedRelatedIds.add(toId);

        relationNodes.push({
          id: toId,
          name: relatedCustomer?.personal_info?.name || '알 수 없음',
          label: getRelationshipLabel(category, type),
          category: category || 'other',
          customerType
        });

        if (category === 'corporate' && customerType === '법인') {
          corporateCustomerIds.push(toId);
        }
      });

    // 역방향 관계 처리 (to_customer_id = 조회 대상 고객)
    // 정방향에서 이미 처리된 고객은 건너뜀 (양방향 저장으로 인한 중복 방지)
    // 역방향만 있는 경우(법인 관계 등) 타입을 반전하여 올바른 관점으로 표시
    relationships
      .filter(rel => rel.relationship_info?.to_customer_id?.toString() === params.customerId)
      .forEach(rel => {
        const fromId = rel.relationship_info?.from_customer_id?.toString();
        if (!fromId || processedRelatedIds.has(fromId)) return;

        processedRelatedIds.add(fromId);

        const relatedCustomer = customerMap.get(fromId);
        const category = rel.relationship_info?.relationship_category;
        const type = rel.relationship_info?.relationship_type;
        const flippedType = REVERSE_TYPE_MAP[type] || type;
        const customerType = relatedCustomer?.insurance_info?.customer_type;

        relationNodes.push({
          id: fromId,
          name: relatedCustomer?.personal_info?.name || '알 수 없음',
          label: getRelationshipLabel(category, flippedType),
          category: category || 'other',
          customerType
        });

        if (category === 'corporate' && customerType === '법인') {
          corporateCustomerIds.push(fromId);
        }
      });

    // 2차 관계 조회 (법인 고객들의 관계) — Internal API 경유
    if (corporateCustomerIds.length > 0) {
      const [secRelsFrom, secRelsTo] = await Promise.all([
        queryRelationships({
          'relationship_info.from_customer_id': { $in: corporateCustomerIds },
          'relationship_info.status': 'active'
        }),
        queryRelationships({
          'relationship_info.to_customer_id': { $in: corporateCustomerIds },
          'relationship_info.status': 'active'
        })
      ]);
      const secondaryRelationships = [...secRelsFrom, ...secRelsTo];

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

      // Internal API 경유: 2차 고객 정보 조회
      const secondaryIdArray = Array.from(secondaryCustomerIds);

      if (secondaryIdArray.length > 0) {
        const secondaryCustomers = await queryCustomers(
          { _id: { $in: secondaryIdArray } },
          { _id: 1, 'personal_info.name': 1, 'insurance_info.customer_type': 1 }
        );

        const secondaryCustomerMap = new Map(secondaryCustomers.map((c: any) => [c._id?.toString(), c]));

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
