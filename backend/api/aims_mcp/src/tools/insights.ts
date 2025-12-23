import { z, ZodError } from 'zod';
import { ObjectId } from 'mongodb';
import { getDB, toSafeObjectId, COLLECTIONS, formatZodError } from '../db.js';
import { getCurrentUserId } from '../auth.js';
import { sendErrorLog } from '../systemLogger.js';

// ============================================================
// 스키마 정의
// ============================================================

export const analyzeCustomerValueSchema = z.object({
  customerId: z.string().optional().describe('특정 고객 ID (생략 시 전체 분석)'),
  limit: z.number().optional().default(10).describe('상위 N명 (전체 분석 시)')
});

export const findCoverageGapsSchema = z.object({
  customerId: z.string().describe('고객 ID')
});

export const suggestNextActionSchema = z.object({
  customerId: z.string().optional().describe('특정 고객 ID (생략 시 전체 대상)'),
  limit: z.number().optional().default(10).describe('상위 N건')
});

// ============================================================
// Tool 정의
// ============================================================

export const insightToolDefinitions = [
  {
    name: 'analyze_customer_value',
    description: '고객 가치를 분석합니다. 계약 수, 보험료, 관계망, 고객 기간 등을 종합하여 가치 점수와 등급을 산출합니다. 특정 고객 또는 전체 고객의 가치 순위를 확인할 수 있습니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: '특정 고객 ID (생략 시 전체 분석)' },
        limit: { type: 'number', description: '상위 N명 (전체 분석 시, 기본: 10)' }
      }
    }
  },
  {
    name: 'find_coverage_gaps',
    description: '고객의 보장 공백을 분석합니다. 현재 보유한 계약의 보장 유형을 분석하고, 부족한 보장 영역과 추천 상품 카테고리를 제안합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: '고객 ID' }
      },
      required: ['customerId']
    }
  },
  {
    name: 'suggest_next_action',
    description: '다음 영업 액션을 추천합니다. 계약 만기, 생일, 마지막 접촉일, 미완성 정보 등을 분석하여 우선순위별로 추천합니다.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customerId: { type: 'string', description: '특정 고객 ID (생략 시 전체 대상)' },
        limit: { type: 'number', description: '상위 N건 (기본: 10)' }
      }
    }
  }
];

// ============================================================
// 상수 정의
// ============================================================

// 보장 카테고리 정의
const COVERAGE_CATEGORIES = {
  life: { name: '생명보험', keywords: ['종신', '정기', '생명', 'life'] },
  health: { name: '건강/질병보험', keywords: ['건강', '질병', '암', '치매', '간병', 'health', 'cancer'] },
  accident: { name: '상해보험', keywords: ['상해', '상해보험', 'accident', '재해'] },
  auto: { name: '자동차보험', keywords: ['자동차', '운전자', 'auto', 'car'] },
  property: { name: '재산보험', keywords: ['화재', '재산', '주택', 'property', 'home'] },
  pension: { name: '연금보험', keywords: ['연금', '노후', 'pension', 'annuity'] },
  savings: { name: '저축성보험', keywords: ['저축', '변액', '유니버셜', 'savings'] }
};

// 가치 등급 기준
const VALUE_GRADES = [
  { grade: 'VIP', minScore: 80, description: '핵심 고객' },
  { grade: '우수', minScore: 60, description: '우수 고객' },
  { grade: '일반', minScore: 30, description: '일반 고객' },
  { grade: '관리필요', minScore: 0, description: '관리 필요 고객' }
];

// ============================================================
// 헬퍼 함수
// ============================================================

/**
 * 고객 가치 점수 계산
 */
interface CustomerData {
  _id: ObjectId;
  personal_info?: {
    name?: string;
    mobile_phone?: string;
  };
  insurance_info?: {
    customer_type?: string;
  };
  meta?: {
    created_at?: Date;
    status?: string;
  };
}

interface ContractData {
  customer_id: ObjectId;
  premium?: number | string;
  status?: string;
}

function calculateValueScore(
  customer: CustomerData,
  contracts: ContractData[],
  relationshipCount: number
): { score: number; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};

  // 1. 계약 수 점수 (최대 30점)
  const activeContracts = contracts.filter(c => c.status === '유지중' || c.status === 'active').length;
  breakdown.contracts = Math.min(activeContracts * 5, 30);

  // 2. 총 보험료 점수 (최대 30점)
  const totalPremium = contracts.reduce((sum, c) => {
    const premium = typeof c.premium === 'string' ? parseFloat(c.premium) : (c.premium || 0);
    return sum + (isNaN(premium) ? 0 : premium);
  }, 0);
  // 월 100만원 기준 30점
  breakdown.premium = Math.min((totalPremium / 1000000) * 30, 30);

  // 3. 관계망 점수 (최대 20점)
  breakdown.network = Math.min(relationshipCount * 4, 20);

  // 4. 고객 기간 점수 (최대 20점)
  const createdAt = customer.meta?.created_at;
  if (createdAt) {
    const monthsActive = Math.floor((Date.now() - new Date(createdAt).getTime()) / (30 * 24 * 60 * 60 * 1000));
    breakdown.tenure = Math.min(monthsActive * 2, 20);
  } else {
    breakdown.tenure = 0;
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score, breakdown };
}

/**
 * 가치 등급 결정
 */
function getValueGrade(score: number): { grade: string; description: string } {
  for (const level of VALUE_GRADES) {
    if (score >= level.minScore) {
      return { grade: level.grade, description: level.description };
    }
  }
  return { grade: '관리필요', description: '관리 필요 고객' };
}

/**
 * 보장 카테고리 식별
 */
function identifyCoverageCategory(productName: string): string[] {
  const categories: string[] = [];
  const lowerName = productName.toLowerCase();

  for (const [key, config] of Object.entries(COVERAGE_CATEGORIES)) {
    if (config.keywords.some(kw => lowerName.includes(kw.toLowerCase()))) {
      categories.push(key);
    }
  }

  return categories.length > 0 ? categories : ['unknown'];
}

// ============================================================
// 핸들러
// ============================================================

/**
 * 고객 가치 분석 핸들러
 */
export async function handleAnalyzeCustomerValue(args: unknown) {
  try {
    const params = analyzeCustomerValueSchema.parse(args || {});
    const db = getDB();
    const userId = getCurrentUserId();
    const agentObjectId = ObjectId.isValid(userId) ? new ObjectId(userId) : userId;

    // 특정 고객 분석
    if (params.customerId) {
      const objectId = toSafeObjectId(params.customerId);
      if (!objectId) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: '유효하지 않은 고객 ID입니다.' }]
        };
      }

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

      // 계약 조회
      const contractsRaw = await db.collection(COLLECTIONS.CONTRACTS).find({
        customer_id: objectId,
        $or: [{ agent_id: agentObjectId }, { agent_id: userId }]
      }).toArray();
      const contracts = contractsRaw as unknown as ContractData[];

      // 관계 수 조회
      const relationshipCount = await db.collection(COLLECTIONS.CUSTOMER_RELATIONSHIPS).countDocuments({
        $or: [
          { source_customer_id: objectId },
          { target_customer_id: objectId }
        ]
      });

      const { score, breakdown } = calculateValueScore(customer as CustomerData, contracts, relationshipCount);
      const gradeInfo = getValueGrade(score);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            customerId: params.customerId,
            customerName: customer.personal_info?.name,
            customerType: customer.insurance_info?.customer_type,
            valueAnalysis: {
              score: Math.round(score * 10) / 10,
              maxScore: 100,
              grade: gradeInfo.grade,
              gradeDescription: gradeInfo.description,
              breakdown: {
                contracts: { score: Math.round(breakdown.contracts * 10) / 10, description: `활성 계약 ${contracts.filter(c => c.status === '유지중' || c.status === 'active').length}건` },
                premium: { score: Math.round(breakdown.premium * 10) / 10, description: `월 보험료 기준` },
                network: { score: Math.round(breakdown.network * 10) / 10, description: `관계망 ${relationshipCount}명` },
                tenure: { score: Math.round(breakdown.tenure * 10) / 10, description: `고객 기간` }
              }
            },
            summary: {
              activeContracts: contracts.filter(c => c.status === '유지중' || c.status === 'active').length,
              totalContracts: contracts.length,
              relationshipCount
            }
          }, null, 2)
        }]
      };
    }

    // 전체 고객 분석 (상위 N명)
    const customers = await db.collection(COLLECTIONS.CUSTOMERS).find({
      'meta.created_by': userId,
      'meta.status': 'active'
    }).toArray();

    const customerValueList: Array<{
      customerId: string;
      customerName: string;
      customerType: string;
      score: number;
      grade: string;
      activeContracts: number;
      relationshipCount: number;
    }> = [];

    for (const customer of customers) {
      const customerId = customer._id;

      // 계약 조회
      const contractsRaw = await db.collection(COLLECTIONS.CONTRACTS).find({
        customer_id: customerId,
        $or: [{ agent_id: agentObjectId }, { agent_id: userId }]
      }).toArray();
      const contracts = contractsRaw as unknown as ContractData[];

      // 관계 수 조회
      const relationshipCount = await db.collection(COLLECTIONS.CUSTOMER_RELATIONSHIPS).countDocuments({
        $or: [
          { source_customer_id: customerId },
          { target_customer_id: customerId }
        ]
      });

      const { score } = calculateValueScore(customer as CustomerData, contracts, relationshipCount);
      const gradeInfo = getValueGrade(score);

      customerValueList.push({
        customerId: customerId.toString(),
        customerName: customer.personal_info?.name || '알 수 없음',
        customerType: customer.insurance_info?.customer_type || '미분류',
        score: Math.round(score * 10) / 10,
        grade: gradeInfo.grade,
        activeContracts: contracts.filter(c => c.status === '유지중' || c.status === 'active').length,
        relationshipCount
      });
    }

    // 점수순 정렬 후 상위 N명
    customerValueList.sort((a, b) => b.score - a.score);
    const topCustomers = customerValueList.slice(0, params.limit || 10);

    // 등급별 분포
    const gradeDistribution: Record<string, number> = {};
    customerValueList.forEach(c => {
      gradeDistribution[c.grade] = (gradeDistribution[c.grade] || 0) + 1;
    });

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          totalCustomers: customers.length,
          analyzedCustomers: customerValueList.length,
          gradeDistribution,
          topCustomers,
          message: `상위 ${topCustomers.length}명의 고객 가치 순위입니다.`
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] analyze_customer_value 에러:', error);
    sendErrorLog('aims_mcp', 'analyze_customer_value 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `고객 가치 분석 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * 보장 공백 분석 핸들러
 */
export async function handleFindCoverageGaps(args: unknown) {
  try {
    const params = findCoverageGapsSchema.parse(args);
    const db = getDB();
    const userId = getCurrentUserId();
    const agentObjectId = ObjectId.isValid(userId) ? new ObjectId(userId) : userId;

    const objectId = toSafeObjectId(params.customerId);
    if (!objectId) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: '유효하지 않은 고객 ID입니다.' }]
      };
    }

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

    // 활성 계약 조회
    const contracts = await db.collection(COLLECTIONS.CONTRACTS).find({
      customer_id: objectId,
      $or: [{ agent_id: agentObjectId }, { agent_id: userId }],
      status: { $in: ['유지중', 'active', '정상'] }
    }).toArray();

    // 현재 보유 보장 카테고리 분석
    const currentCoverages: Record<string, Array<{ productName: string; premium: number }>> = {};

    for (const contract of contracts) {
      const productName = contract.product_name || '';
      const categories = identifyCoverageCategory(productName);
      const premium = typeof contract.premium === 'string' ? parseFloat(contract.premium) : (contract.premium || 0);

      for (const cat of categories) {
        if (!currentCoverages[cat]) {
          currentCoverages[cat] = [];
        }
        currentCoverages[cat].push({ productName, premium: isNaN(premium) ? 0 : premium });
      }
    }

    // 보장 공백 식별
    const gaps: Array<{
      category: string;
      categoryName: string;
      importance: string;
      reason: string;
    }> = [];

    const customerType = customer.insurance_info?.customer_type;

    // 개인 고객 필수 보장
    const essentialForIndividual = ['life', 'health', 'accident'];
    // 법인 고객 필수 보장
    const essentialForCorporate = ['property', 'accident'];

    const essentialCategories = customerType === '법인' ? essentialForCorporate : essentialForIndividual;

    for (const catKey of essentialCategories) {
      if (!currentCoverages[catKey]) {
        const catInfo = COVERAGE_CATEGORIES[catKey as keyof typeof COVERAGE_CATEGORIES];
        gaps.push({
          category: catKey,
          categoryName: catInfo?.name || catKey,
          importance: '높음',
          reason: `${customerType || '개인'} 고객에게 필수적인 보장 영역입니다.`
        });
      }
    }

    // 추가 추천 보장
    const optionalCategories = Object.keys(COVERAGE_CATEGORIES).filter(
      k => !essentialCategories.includes(k) && !currentCoverages[k]
    );

    for (const catKey of optionalCategories) {
      const catInfo = COVERAGE_CATEGORIES[catKey as keyof typeof COVERAGE_CATEGORIES];
      if (catInfo) {
        gaps.push({
          category: catKey,
          categoryName: catInfo.name,
          importance: '보통',
          reason: '추가 보장으로 고려할 수 있습니다.'
        });
      }
    }

    // 현재 보장 요약
    const currentCoverageSummary = Object.entries(currentCoverages).map(([key, products]) => ({
      category: key,
      categoryName: COVERAGE_CATEGORIES[key as keyof typeof COVERAGE_CATEGORIES]?.name || key,
      productCount: products.length,
      products: products.map(p => p.productName),
      totalPremium: products.reduce((sum, p) => sum + p.premium, 0)
    }));

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          customerId: params.customerId,
          customerName: customer.personal_info?.name,
          customerType: customer.insurance_info?.customer_type,
          activeContractCount: contracts.length,
          currentCoverage: currentCoverageSummary,
          coverageGaps: gaps,
          recommendations: gaps.filter(g => g.importance === '높음').map(g => ({
            category: g.categoryName,
            suggestion: `${g.categoryName} 관련 상품 가입을 권장합니다.`
          })),
          message: gaps.length > 0
            ? `${gaps.filter(g => g.importance === '높음').length}개의 중요 보장 공백이 있습니다.`
            : '주요 보장 영역이 잘 갖춰져 있습니다.'
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] find_coverage_gaps 에러:', error);
    sendErrorLog('aims_mcp', 'find_coverage_gaps 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `보장 공백 분석 실패: ${errorMessage}`
      }]
    };
  }
}

/**
 * 다음 액션 추천 핸들러
 */
export async function handleSuggestNextAction(args: unknown) {
  try {
    const params = suggestNextActionSchema.parse(args || {});
    const db = getDB();
    const userId = getCurrentUserId();
    const agentObjectId = ObjectId.isValid(userId) ? new ObjectId(userId) : userId;

    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysLater = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    interface ActionItem {
      customerId: string;
      customerName: string;
      actionType: string;
      priority: string;
      priorityScore: number;
      description: string;
      dueDate?: string;
      details?: Record<string, unknown>;
    }

    const actions: ActionItem[] = [];

    // 특정 고객 또는 전체
    let customerFilter: Record<string, unknown> = { 'meta.created_by': userId, 'meta.status': 'active' };

    if (params.customerId) {
      const objectId = toSafeObjectId(params.customerId);
      if (!objectId) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: '유효하지 않은 고객 ID입니다.' }]
        };
      }
      customerFilter._id = objectId;
    }

    const customers = await db.collection(COLLECTIONS.CUSTOMERS).find(customerFilter).toArray();

    for (const customer of customers) {
      const customerId = customer._id.toString();
      const customerName = customer.personal_info?.name || '알 수 없음';

      // 1. 계약 만기 임박 체크
      const expiringContracts = await db.collection(COLLECTIONS.CONTRACTS).find({
        customer_id: customer._id,
        $or: [{ agent_id: agentObjectId }, { agent_id: userId }],
        status: { $in: ['유지중', 'active', '정상'] },
        expiry_date: { $gte: now, $lte: sixtyDaysLater }
      }).toArray();

      for (const contract of expiringContracts) {
        const expiryDate = new Date(contract.expiry_date);
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        const isUrgent = daysUntilExpiry <= 30;

        actions.push({
          customerId,
          customerName,
          actionType: '계약갱신',
          priority: isUrgent ? '긴급' : '높음',
          priorityScore: isUrgent ? 100 : 80,
          description: `${contract.product_name || '계약'} 만기 ${daysUntilExpiry}일 전`,
          dueDate: expiryDate.toISOString().split('T')[0],
          details: {
            contractId: contract._id.toString(),
            productName: contract.product_name,
            premium: contract.premium
          }
        });
      }

      // 2. 생일 임박 체크
      const birthDate = customer.personal_info?.birth_date;
      if (birthDate) {
        const birth = new Date(birthDate);
        const thisYearBirthday = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
        if (thisYearBirthday < now) {
          thisYearBirthday.setFullYear(thisYearBirthday.getFullYear() + 1);
        }

        const daysUntilBirthday = Math.ceil((thisYearBirthday.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

        if (daysUntilBirthday <= 14) {
          actions.push({
            customerId,
            customerName,
            actionType: '생일축하',
            priority: daysUntilBirthday <= 7 ? '높음' : '보통',
            priorityScore: daysUntilBirthday <= 7 ? 70 : 50,
            description: `생일 ${daysUntilBirthday}일 전`,
            dueDate: thisYearBirthday.toISOString().split('T')[0]
          });
        }
      }

      // 3. 장기 미접촉 고객 체크 (마지막 업데이트 기준)
      // 메모는 customers.memo 필드에 저장되며, 업데이트 시 meta.updated_at이 갱신됨
      const lastContact = customer.meta?.updated_at || customer.meta?.created_at;
      if (lastContact) {
        const daysSinceContact = Math.floor((now.getTime() - new Date(lastContact).getTime()) / (24 * 60 * 60 * 1000));

        if (daysSinceContact >= 90) {
          actions.push({
            customerId,
            customerName,
            actionType: '정기연락',
            priority: daysSinceContact >= 180 ? '높음' : '보통',
            priorityScore: daysSinceContact >= 180 ? 60 : 40,
            description: `마지막 접촉 ${daysSinceContact}일 전`,
            details: {
              lastContactDate: new Date(lastContact).toISOString().split('T')[0]
            }
          });
        }
      }

      // 4. 미완성 정보 체크
      const personalInfo = customer.personal_info || {};
      const missingFields: string[] = [];
      if (!personalInfo.mobile_phone) missingFields.push('전화번호');
      if (!personalInfo.email) missingFields.push('이메일');
      if (!personalInfo.birth_date) missingFields.push('생년월일');
      if (!personalInfo.address?.address1) missingFields.push('주소');

      if (missingFields.length >= 2) {
        actions.push({
          customerId,
          customerName,
          actionType: '정보보완',
          priority: '낮음',
          priorityScore: 20,
          description: `누락 정보: ${missingFields.join(', ')}`,
          details: { missingFields }
        });
      }
    }

    // 우선순위 정렬
    actions.sort((a, b) => b.priorityScore - a.priorityScore);

    // 상위 N건
    const topActions = actions.slice(0, params.limit || 10);

    // 액션 유형별 분포
    const actionDistribution: Record<string, number> = {};
    actions.forEach(a => {
      actionDistribution[a.actionType] = (actionDistribution[a.actionType] || 0) + 1;
    });

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          totalActions: actions.length,
          analyzedCustomers: customers.length,
          actionDistribution,
          priorityBreakdown: {
            urgent: actions.filter(a => a.priority === '긴급').length,
            high: actions.filter(a => a.priority === '높음').length,
            medium: actions.filter(a => a.priority === '보통').length,
            low: actions.filter(a => a.priority === '낮음').length
          },
          suggestedActions: topActions.map(a => ({
            customerId: a.customerId,
            customerName: a.customerName,
            actionType: a.actionType,
            priority: a.priority,
            description: a.description,
            dueDate: a.dueDate,
            details: a.details
          })),
          message: topActions.length > 0
            ? `${actions.filter(a => a.priority === '긴급' || a.priority === '높음').length}건의 우선 처리 액션이 있습니다.`
            : '현재 특별히 필요한 액션이 없습니다.'
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('[MCP] suggest_next_action 에러:', error);
    sendErrorLog('aims_mcp', 'suggest_next_action 에러', error);
    const errorMessage = error instanceof ZodError
      ? formatZodError(error)
      : (error instanceof Error ? error.message : '알 수 없는 오류');
    return {
      isError: true,
      content: [{
        type: 'text' as const,
        text: `액션 추천 실패: ${errorMessage}`
      }]
    };
  }
}
