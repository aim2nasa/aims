/**
 * statistics.test.js
 * 통계/대시보드 API 테스트
 *
 * 테스트 대상:
 * 1. 대시보드 통계
 * 2. 사용량 집계
 * 3. 활동 로그
 *
 * 참고: MongoDB 연결 없이 로직만 테스트
 */

const { ObjectId } = require('mongodb');

describe('Statistics API - 대시보드', () => {
  test('대시보드 통계 구조', () => {
    const dashboardStats = {
      customers: {
        total: 150,
        active: 120,
        inactive: 30
      },
      documents: {
        total: 500,
        processed: 480,
        pending: 20
      },
      contracts: {
        total: 200,
        active: 180,
        expired: 20
      },
      storage: {
        used: 2.5 * 1024 * 1024 * 1024, // 2.5GB
        limit: 10 * 1024 * 1024 * 1024   // 10GB
      }
    };

    expect(dashboardStats).toHaveProperty('customers');
    expect(dashboardStats).toHaveProperty('documents');
    expect(dashboardStats).toHaveProperty('contracts');
    expect(dashboardStats).toHaveProperty('storage');
    expect(dashboardStats.customers.total).toBe(150);
  });

  test('저장 용량 백분율 계산', () => {
    const used = 2.5 * 1024 * 1024 * 1024;
    const limit = 10 * 1024 * 1024 * 1024;
    const percentage = (used / limit) * 100;

    expect(percentage).toBe(25);
  });

  test('활성 고객 비율 계산', () => {
    const total = 150;
    const active = 120;
    const activePercentage = (active / total) * 100;

    expect(activePercentage).toBe(80);
  });
});

describe('Statistics API - 집계 파이프라인', () => {
  test('월별 문서 업로드 집계', () => {
    const userId = new ObjectId();
    const year = 2026;

    const pipeline = [
      {
        $match: {
          userId: userId,
          'upload.uploaded_at': {
            $gte: new Date(`${year}-01-01`),
            $lt: new Date(`${year + 1}-01-01`)
          }
        }
      },
      {
        $group: {
          _id: { $month: '$upload.uploaded_at' },
          count: { $sum: 1 },
          totalSize: { $sum: '$upload.size' }
        }
      },
      { $sort: { _id: 1 } }
    ];

    expect(pipeline).toHaveLength(3);
    expect(pipeline[0].$match.userId).toEqual(userId);
    expect(pipeline[1].$group._id.$month).toBe('$upload.uploaded_at');
  });

  test('고객별 계약 금액 합계', () => {
    const userId = new ObjectId();

    const pipeline = [
      { $match: { userId: userId } },
      {
        $group: {
          _id: '$customerId',
          totalPremium: { $sum: '$premium.amount' },
          contractCount: { $sum: 1 }
        }
      },
      { $sort: { totalPremium: -1 } },
      { $limit: 10 }
    ];

    expect(pipeline[1].$group).toHaveProperty('totalPremium');
    expect(pipeline[1].$group).toHaveProperty('contractCount');
    expect(pipeline[3].$limit).toBe(10);
  });

  test('보험사별 계약 분포', () => {
    const pipeline = [
      {
        $group: {
          _id: '$insurerName',
          count: { $sum: 1 },
          totalPremium: { $sum: '$premium.amount' }
        }
      },
      { $sort: { count: -1 } }
    ];

    expect(pipeline[0].$group._id).toBe('$insurerName');
  });
});

describe('Statistics API - 기간별 조회', () => {
  test('날짜 범위 쿼리 생성', () => {
    const startDate = new Date('2026-01-01');
    const endDate = new Date('2026-12-31');

    const dateQuery = {
      createdAt: {
        $gte: startDate,
        $lte: endDate
      }
    };

    expect(dateQuery.createdAt.$gte).toEqual(startDate);
    expect(dateQuery.createdAt.$lte).toEqual(endDate);
  });

  test('최근 N일 쿼리', () => {
    const days = 30;
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const query = {
      createdAt: { $gte: startDate }
    };

    expect(query.createdAt.$gte).toBeInstanceOf(Date);
    expect(query.createdAt.$gte.getTime()).toBeLessThan(now.getTime());
  });

  test('주간 통계 날짜 범위', () => {
    const today = new Date('2026-01-10');
    const dayOfWeek = today.getDay();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    expect(startOfWeek.getDay()).toBe(0); // 일요일
  });
});

describe('Statistics API - 사용량 추적', () => {
  test('OCR 사용량 기록 구조', () => {
    const ocrUsage = {
      userId: new ObjectId(),
      date: new Date(),
      pageCount: 10,
      characterCount: 5000,
      cost: 0.05
    };

    expect(ocrUsage).toHaveProperty('pageCount');
    expect(ocrUsage).toHaveProperty('characterCount');
    expect(ocrUsage).toHaveProperty('cost');
  });

  test('AI 토큰 사용량 기록', () => {
    const tokenUsage = {
      userId: new ObjectId(),
      date: new Date(),
      inputTokens: 1000,
      outputTokens: 500,
      model: 'gpt-4',
      cost: 0.03
    };

    expect(tokenUsage).toHaveProperty('inputTokens');
    expect(tokenUsage).toHaveProperty('outputTokens');
    expect(tokenUsage.inputTokens + tokenUsage.outputTokens).toBe(1500);
  });

  test('월별 사용량 합계', () => {
    const dailyUsages = [
      { pageCount: 10, cost: 0.05 },
      { pageCount: 20, cost: 0.10 },
      { pageCount: 15, cost: 0.075 }
    ];

    const monthlyTotal = dailyUsages.reduce(
      (acc, usage) => ({
        pageCount: acc.pageCount + usage.pageCount,
        cost: acc.cost + usage.cost
      }),
      { pageCount: 0, cost: 0 }
    );

    expect(monthlyTotal.pageCount).toBe(45);
    expect(monthlyTotal.cost).toBeCloseTo(0.225, 3);
  });
});

describe('Statistics API - 활동 로그', () => {
  test('활동 로그 구조', () => {
    const activityLog = {
      userId: new ObjectId(),
      action: 'document_upload',
      resource: 'documents',
      resourceId: new ObjectId(),
      details: {
        filename: 'test.pdf',
        size: 1024000
      },
      ip: '192.168.1.1',
      userAgent: 'Mozilla/5.0...',
      createdAt: new Date()
    };

    expect(activityLog).toHaveProperty('action');
    expect(activityLog).toHaveProperty('resource');
    expect(activityLog).toHaveProperty('ip');
    expect(activityLog).toHaveProperty('createdAt');
  });

  test('활동 타입 검증', () => {
    const validActions = [
      'login', 'logout',
      'document_upload', 'document_delete', 'document_view',
      'customer_create', 'customer_update', 'customer_delete',
      'contract_create', 'contract_update'
    ];

    expect(validActions).toContain('document_upload');
    expect(validActions).not.toContain('invalid_action');
  });

  test('사용자별 최근 활동 조회', () => {
    const userId = new ObjectId();

    const pipeline = [
      { $match: { userId: userId } },
      { $sort: { createdAt: -1 } },
      { $limit: 20 },
      {
        $project: {
          action: 1,
          resource: 1,
          createdAt: 1,
          details: 1
        }
      }
    ];

    expect(pipeline[0].$match.userId).toEqual(userId);
    expect(pipeline[1].$sort.createdAt).toBe(-1);
    expect(pipeline[2].$limit).toBe(20);
  });
});

describe('Statistics API - 리포트 생성', () => {
  test('요약 리포트 데이터 구조', () => {
    const report = {
      period: {
        start: new Date('2026-01-01'),
        end: new Date('2026-01-31')
      },
      summary: {
        newCustomers: 15,
        newDocuments: 120,
        newContracts: 25,
        totalPremium: 50000000
      },
      trends: {
        customersGrowth: 10.5,
        documentsGrowth: 15.2,
        premiumGrowth: 8.3
      }
    };

    expect(report).toHaveProperty('period');
    expect(report).toHaveProperty('summary');
    expect(report).toHaveProperty('trends');
    expect(report.summary.newCustomers).toBe(15);
  });

  test('성장률 계산', () => {
    const previousValue = 100;
    const currentValue = 115;
    const growthRate = ((currentValue - previousValue) / previousValue) * 100;

    expect(growthRate).toBe(15);
  });

  test('전월 대비 변화율 계산', () => {
    const currentMonth = 150;
    const previousMonth = 120;
    const changeRate = ((currentMonth - previousMonth) / previousMonth) * 100;

    expect(changeRate).toBeCloseTo(25, 1);
  });
});

describe('Statistics API - 데이터 정렬', () => {
  test('인기 문서 타입 정렬', () => {
    const documentTypes = [
      { type: 'pdf', count: 100 },
      { type: 'image', count: 50 },
      { type: 'excel', count: 30 }
    ];

    const sorted = documentTypes.sort((a, b) => b.count - a.count);

    expect(sorted[0].type).toBe('pdf');
    expect(sorted[0].count).toBe(100);
  });

  test('상위 고객 정렬 (계약금액순)', () => {
    const customers = [
      { name: '고객A', totalPremium: 1000000 },
      { name: '고객B', totalPremium: 5000000 },
      { name: '고객C', totalPremium: 2000000 }
    ];

    const topCustomers = customers
      .sort((a, b) => b.totalPremium - a.totalPremium)
      .slice(0, 2);

    expect(topCustomers[0].name).toBe('고객B');
    expect(topCustomers).toHaveLength(2);
  });
});
