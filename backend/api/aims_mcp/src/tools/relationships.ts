import { z, ZodError } from 'zod';
import { ObjectId } from 'mongodb';
import { getDB, toSafeObjectId, COLLECTIONS, formatZodError } from '../db.js';
import { getCurrentUserId } from '../auth.js';
import { sendErrorLog } from '../systemLogger.js';
import { createRelationship, deleteRelationship } from '../internalApi.js';

// 관계 유형 정의 (aims_api와 동일)
const RELATIONSHIP_TYPES: Record<string, Record<string, { reverse: string; bidirectional: boolean; label: string }>> = {
  family: {
    spouse: { reverse: 'spouse', bidirectional: true, label: '배우자' },
    parent: { reverse: 'child', bidirectional: false, label: '부모' },
    child: { reverse: 'parent', bidirectional: false, label: '자녀' }
  },
  relative: {
    uncle_aunt: { reverse: 'nephew_niece', bidirectional: false, label: '삼촌/이모' },
    nephew_niece: { reverse: 'uncle_aunt', bidirectional: false, label: '조카' },
    cousin: { reverse: 'cousin', bidirectional: true, label: '사촌' },
    in_law: { reverse: 'in_law', bidirectional: true, label: '처가/시가' }
  },
  social: {
    friend: { reverse: 'friend', bidirectional: true, label: '친구' },
    acquaintance: { reverse: 'acquaintance', bidirectional: true, label: '지인' },
    neighbor: { reverse: 'neighbor', bidirectional: true, label: '이웃' }
  },
  professional: {
    supervisor: { reverse: 'subordinate', bidirectional: false, label: '상사' },
    subordinate: { reverse: 'supervisor', bidirectional: false, label: '부하' },
    colleague: { reverse: 'colleague', bidirectional: true, label: '동료' },
    business_partner: { reverse: 'business_partner', bidirectional: true, label: '사업파트너' },
    client: { reverse: 'service_provider', bidirectional: false, label: '클라이언트' },
    service_provider: { reverse: 'client', bidirectional: false, label: '서비스제공자' }
  },
  corporate: {
    ceo: { reverse: 'company', bidirectional: false, label: '대표이사' },
    executive: { reverse: 'company', bidirectional: false, label: '임원' },
    employee: { reverse: 'employer', bidirectional: false, label: '직원' },
    shareholder: { reverse: 'company', bidirectional: false, label: '주주' },
    director: { reverse: 'company', bidirectional: false, label: '이사' },
    company: { reverse: 'employee', bidirectional: false, label: '회사' },
    employer: { reverse: 'employee', bidirectional: false, label: '고용주' }
  }
};

// 모든 관계 유형을 평면화
function getAllRelationshipTypes(): Record<string, { reverse: string; bidirectional: boolean; label: string; category: string }> {
  const allTypes: Record<string, { reverse: string; bidirectional: boolean; label: string; category: string }> = {};
  Object.entries(RELATIONSHIP_TYPES).forEach(([category, types]) => {
    Object.entries(types).forEach(([type, config]) => {
      allTypes[type] = { ...config, category };
    });
  });
  return allTypes;
}

// 스키마 정의
export const createRelationshipSchema = z.object({
  fromCustomerId: z.string().describe('관계를 설정할 고객 ID (기준 고객)'),
  toCustomerId: z.string().describe('관계 대상 고객 ID'),
  relationshipType: z.string().describe('관계 유형 (spouse, parent, child, friend, colleague 등)'),
  relationshipCategory: z.enum(['family', 'relative', 'social', 'professional', 'corporate']).optional().describe('관계 카테고리'),
  notes: z.string().optional().describe('관계에 대한 메모')
});

export const deleteRelationshipSchema = z.object({
  fromCustomerId: z.string().describe('관계의 기준 고객 ID'),
  relationshipId: z.string().optional().describe('삭제할 관계 ID (toCustomerId와 둘 중 하나 필수)'),
  toCustomerId: z.string().optional().describe('관계 대상 고객 ID - 관계 ID 없이 고객명으로 삭제할 때 사용')
}).refine(
  data => data.relationshipId || data.toCustomerId,
  { message: 'relationshipId 또는 toCustomerId 중 하나는 필수입니다' }
);

export const listRelationshipsSchema = z.object({
  customerId: z.string().describe('고객 ID'),
  category: z.enum(['family', 'relative', 'social', 'professional', 'corporate']).optional().describe('관계 카테고리 필터')
});

// Tool 정의
export const relationshipToolDefinitions = [
  {
    name: 'create_relationship',
    description: '두 고객 간의 관계를 생성합니다. 고객 타입에 따라 관계 유형이 다릅니다. 법인 고객: 대표, 임원, 직원, 기타. 개인 고객: 배우자, 부모, 자녀만 가능.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        fromCustomerId: { type: 'string', description: '관계를 설정할 고객 ID (기준 고객)' },
        toCustomerId: { type: 'string', description: '관계 대상 고객 ID' },
        relationshipType: {
          type: 'string',
          description: '관계 유형 - 법인: ceo(대표), executive(임원), employee(직원), 기타 직접입력 / 개인: spouse(배우자), parent(부모), child(자녀)'
        },
        relationshipCategory: {
          type: 'string',
          enum: ['family', 'relative', 'social', 'professional', 'corporate'],
          description: '관계 카테고리 (선택사항, 자동 추론됨)'
        },
        notes: { type: 'string', description: '관계에 대한 메모' }
      },
      required: ['fromCustomerId', 'toCustomerId', 'relationshipType']
    }
  },
  {
    name: 'delete_relationship',
    description: '두 고객 간의 관계를 삭제합니다. 양방향 관계인 경우 역방향 관계도 함께 삭제됩니다. relationshipId 또는 toCustomerId 중 하나만 있으면 됩니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        fromCustomerId: { type: 'string', description: '관계의 기준 고객 ID' },
        relationshipId: { type: 'string', description: '삭제할 관계 ID (toCustomerId와 둘 중 하나 필수)' },
        toCustomerId: { type: 'string', description: '관계 대상 고객 ID - 관계 ID 없이 고객 ID로 삭제할 때 사용 (relationshipId와 둘 중 하나 필수)' }
      },
      required: ['fromCustomerId']
    }
  },
  {
    name: 'list_relationships',
    description: '특정 고객의 모든 관계 목록을 조회합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: '고객 ID' },
        category: {
          type: 'string',
          enum: ['family', 'relative', 'social', 'professional', 'corporate'],
          description: '관계 카테고리 필터'
        }
      },
      required: ['customerId']
    }
  }
];

/**
 * 관계 생성 핸들러
 */
export async function handleCreateRelationship(args: unknown) {
  try {
    const params = createRelationshipSchema.parse(args);
    const db = getDB();
    const userId = getCurrentUserId();

    // 자기 참조 체크 (즉시 UX 에러 반환)
    if (params.fromCustomerId === params.toCustomerId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '자기 자신과는 관계를 설정할 수 없습니다.' }]
      };
    }

    // 관계 유형 검증 (즉시 UX 에러 반환)
    const allTypes = getAllRelationshipTypes();
    let typeConfig = allTypes[params.relationshipType];

    if (!typeConfig) {
      if (params.relationshipCategory === 'corporate') {
        typeConfig = {
          reverse: params.relationshipType,
          bidirectional: false,
          category: 'corporate',
          label: params.relationshipType
        };
      } else {
        return {
          isError: true,
          content: [{
            type: 'text' as const,
            text: `유효하지 않은 관계 유형입니다. 사용 가능한 유형: ${Object.keys(allTypes).join(', ')}`
          }]
        };
      }
    }

    // 고객명 조회 (응답 메시지용) — Read 유지
    const fromObjectId = toSafeObjectId(params.fromCustomerId);
    const toObjectId = toSafeObjectId(params.toCustomerId);

    if (!fromObjectId || !toObjectId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '유효하지 않은 고객 ID입니다.' }]
      };
    }

    const [fromCustomer, toCustomer] = await Promise.all([
      db.collection(COLLECTIONS.CUSTOMERS).findOne({ _id: fromObjectId, 'meta.created_by': userId }, { projection: { 'personal_info.name': 1 } }),
      db.collection(COLLECTIONS.CUSTOMERS).findOne({ _id: toObjectId, 'meta.created_by': userId }, { projection: { 'personal_info.name': 1 } })
    ]);

    // Internal API로 관계 생성 (소유권 확인, 중복 체크, 역방향 처리 포함)
    const result = await createRelationship({
      fromCustomerId: params.fromCustomerId,
      toCustomerId: params.toCustomerId,
      relationshipType: params.relationshipType,
      relationshipCategory: params.relationshipCategory,
      notes: params.notes,
      userId
    });

    // API 에러 처리 (404: 고객 없음, 409: 중복, 400: 유효하지 않은 유형 등)
    if (!result.data) {
      return {
        isError: true,
        content: [{
          type: 'text' as const,
          text: result.error || '관계 생성에 실패했습니다.'
        }]
      };
    }

    const fromName = fromCustomer?.personal_info?.name || '(알 수 없음)';
    const toName = toCustomer?.personal_info?.name || '(알 수 없음)';

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          relationshipId: result.data.relationshipId,
          fromCustomer: fromName,
          toCustomer: toName,
          relationshipType: params.relationshipType,
          relationshipLabel: typeConfig.label,
          category: typeConfig.category,
          bidirectional: typeConfig.bidirectional,
          reverseRelationCreated: result.data.reverseCreated,
          message: `관계가 성공적으로 생성되었습니다: ${fromName} → ${toName} (${typeConfig.label})`
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] create_relationship 에러:', error);
    sendErrorLog('aims_mcp', 'create_relationship 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `관계 생성 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * 관계 삭제 핸들러
 * - relationshipId로 삭제: 기존 방식
 * - toCustomerId로 삭제: 관계 ID 없이 고객 ID로 직접 삭제 (UX 개선)
 */
export async function handleDeleteRelationship(args: unknown) {
  try {
    const params = deleteRelationshipSchema.parse(args);
    const db = getDB();
    const userId = getCurrentUserId();

    const fromObjectId = toSafeObjectId(params.fromCustomerId);
    if (!fromObjectId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '유효하지 않은 기준 고객 ID입니다.' }]
      };
    }

    // 고객명 조회 (응답 메시지용) — Read 유지
    const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
      _id: fromObjectId,
      'meta.created_by': userId
    }, { projection: { 'personal_info.name': 1 } });

    if (!customer) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '기준 고객을 찾을 수 없습니다.' }]
      };
    }

    let relationshipId: string | undefined;
    let toCustomer: any;
    let relationshipType: string | undefined;

    // 모드 1: relationshipId로 삭제
    if (params.relationshipId) {
      relationshipId = params.relationshipId;

      // 관계 정보 조회 (응답용 — Read 유지)
      const relationshipObjectId = toSafeObjectId(params.relationshipId);
      if (!relationshipObjectId) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: '유효하지 않은 관계 ID입니다.' }]
        };
      }

      const relationship = await db.collection(COLLECTIONS.CUSTOMER_RELATIONSHIPS).findOne({
        _id: relationshipObjectId,
        'relationship_info.from_customer_id': fromObjectId
      });

      if (relationship) {
        relationshipType = relationship.relationship_info.relationship_type;
        toCustomer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
          _id: relationship.relationship_info.to_customer_id
        }, { projection: { 'personal_info.name': 1 } });
      }
    }
    // 모드 2: toCustomerId로 관계를 찾아서 삭제
    else if (params.toCustomerId) {
      const toObjectId = toSafeObjectId(params.toCustomerId);
      if (!toObjectId) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: '유효하지 않은 대상 고객 ID입니다.' }]
        };
      }

      toCustomer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
        _id: toObjectId,
        'meta.created_by': userId
      }, { projection: { 'personal_info.name': 1 } });

      if (!toCustomer) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: '대상 고객을 찾을 수 없습니다.' }]
        };
      }

      // 두 고객 간의 관계 찾기 — Read 유지 (Internal API는 relationshipId만 받으므로)
      const relationship = await db.collection(COLLECTIONS.CUSTOMER_RELATIONSHIPS).findOne({
        'relationship_info.from_customer_id': fromObjectId,
        'relationship_info.to_customer_id': toObjectId,
        'relationship_info.status': 'active'
      });

      if (!relationship) {
        return {
          isError: true,
          content: [{
            type: 'text' as const,
            text: `${customer.personal_info?.name}과(와) ${toCustomer.personal_info?.name} 사이에 등록된 관계가 없습니다.`
          }]
        };
      }

      relationshipId = relationship._id.toString();
      relationshipType = relationship.relationship_info.relationship_type;
    }

    if (!relationshipId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '삭제할 관계를 찾을 수 없습니다.' }]
      };
    }

    // Internal API로 관계 삭제 (역방향 자동 처리 포함)
    const result = await deleteRelationship(relationshipId, userId);

    if (!result.data) {
      return {
        isError: true,
        content: [{
          type: 'text' as const,
          text: result.error || '관계 삭제에 실패했습니다.'
        }]
      };
    }

    const allTypes = getAllRelationshipTypes();
    const typeConfig = relationshipType ? allTypes[relationshipType] : undefined;
    const relationshipLabel = typeConfig?.label || relationshipType || '(알 수 없음)';

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          deletedRelationshipId: relationshipId,
          fromCustomerName: customer.personal_info?.name,
          toCustomerName: toCustomer?.personal_info?.name,
          relationshipType,
          relationshipLabel,
          reverseRelationDeleted: result.data.reverseDeleted,
          message: `${customer.personal_info?.name} 고객과 ${toCustomer?.personal_info?.name || '(알 수 없음)'} 고객 간의 관계(${relationshipLabel})가 삭제되었습니다.`
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] delete_relationship 에러:', error);
    sendErrorLog('aims_mcp', 'delete_relationship 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `관계 삭제 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * 관계 목록 조회 핸들러
 */
export async function handleListRelationships(args: unknown) {
  try {
    const params = listRelationshipsSchema.parse(args);
    const db = getDB();
    const userId = getCurrentUserId();

    const objectId = toSafeObjectId(params.customerId);
    if (!objectId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '유효하지 않은 고객 ID입니다.' }]
      };
    }

    // 고객이 해당 설계사의 고객인지 확인
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

    // 관계 조회 필터
    const filter: Record<string, unknown> = {
      'relationship_info.from_customer_id': objectId,
      'relationship_info.status': 'active'
    };

    if (params.category) {
      filter['relationship_info.relationship_category'] = params.category;
    }

    const relationships = await db.collection(COLLECTIONS.CUSTOMER_RELATIONSHIPS)
      .find(filter)
      .sort({ 'meta.created_at': -1 })
      .toArray();

    // 관련 고객 정보 조회
    const relatedCustomerIds = relationships.map(rel => rel.relationship_info.to_customer_id);
    const relatedCustomers = await db.collection(COLLECTIONS.CUSTOMERS)
      .find({ _id: { $in: relatedCustomerIds } })
      .project({
        _id: 1,
        'personal_info.name': 1,
        'personal_info.mobile_phone': 1,
        'insurance_info.customer_type': 1
      })
      .toArray();

    const customerMap = new Map(relatedCustomers.map(c => [c._id.toString(), c]));

    const allTypes = getAllRelationshipTypes();
    const formattedRelationships = relationships.map(rel => {
      const relatedCustomer = customerMap.get(rel.relationship_info.to_customer_id.toString());
      const typeConfig = allTypes[rel.relationship_info.relationship_type];

      return {
        relationshipId: rel._id.toString(),
        relatedCustomerId: rel.relationship_info.to_customer_id.toString(),
        relatedCustomerName: relatedCustomer?.personal_info?.name || '알 수 없음',
        relatedCustomerPhone: relatedCustomer?.personal_info?.mobile_phone,
        relatedCustomerType: relatedCustomer?.insurance_info?.customer_type,
        relationshipType: rel.relationship_info.relationship_type,
        relationshipLabel: typeConfig?.label || rel.relationship_info.relationship_type,
        relationshipCategory: rel.relationship_info.relationship_category,
        strength: rel.relationship_info.strength,
        notes: rel.relationship_details?.notes,
        createdAt: rel.meta?.created_at
      };
    });

    // 카테고리별 그룹화
    const byCategory: Record<string, typeof formattedRelationships> = {};
    formattedRelationships.forEach(rel => {
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
          totalRelationships: formattedRelationships.length,
          byCategory,
          relationships: formattedRelationships
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] list_relationships 에러:', error);
    sendErrorLog('aims_mcp', 'list_relationships 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `관계 목록 조회 실패: ${errorMessage}`
      }]
    };
  }
}
