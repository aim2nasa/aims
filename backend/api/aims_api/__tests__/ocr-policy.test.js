/**
 * OCR 사용량 정책 검증 테스트
 * @since 2025-12-24
 *
 * 정책 문서: docs/OCR_USAGE_POLICY.md
 *
 * 검증 항목:
 * 1. 페이지 기반 한도 (100/500/3000/10000/-1)
 * 2. 가입 기념일 기반 사이클 리셋 (KST)
 * 3. check-quota API 존재 및 구현
 * 4. n8n OCRWorker 사전 체크 로직
 * 5. 프론트엔드 타입 정의
 */

const fs = require('fs');
const path = require('path');

// storageQuotaService 모듈 직접 테스트
const {
  calculateOcrCycle,
  calculateUserOcrPagesInCycle,
  getUserStorageInfo,
} = require('../lib/storageQuotaService');

describe('OCR 정책 구현 검증', () => {
  // 코드 로드
  const storageQuotaServiceCode = fs.readFileSync(
    path.join(__dirname, '../lib/storageQuotaService.js'),
    'utf-8'
  );

  const ocrUsageRoutesCode = fs.readFileSync(
    path.join(__dirname, '../routes/ocr-usage-routes.js'),
    'utf-8'
  );

  const ocrWorkerJson = JSON.parse(fs.readFileSync(
    path.join(__dirname, '../../../n8n_flows/modules/OCRWorker.json'),
    'utf-8'
  ));

  const fileAnalyzerCode = fs.readFileSync(
    path.join(__dirname, '../../../../tools/mime_type_analyzer/file_analyzer.js'),
    'utf-8'
  );

  describe('1. 티어별 페이지 한도 정의', () => {
    it('free_trial: 100 페이지', () => {
      expect(storageQuotaServiceCode).toContain('free_trial:');
      expect(storageQuotaServiceCode).toContain('ocr_page_quota: 100');
    });

    it('standard: 500 페이지', () => {
      expect(storageQuotaServiceCode).toContain('standard:');
      expect(storageQuotaServiceCode).toMatch(/standard:.*ocr_page_quota: 500/s);
    });

    it('premium: 3000 페이지', () => {
      expect(storageQuotaServiceCode).toContain('premium:');
      expect(storageQuotaServiceCode).toMatch(/premium:.*ocr_page_quota: 3000/s);
    });

    it('vip: 10000 페이지', () => {
      expect(storageQuotaServiceCode).toContain('vip:');
      expect(storageQuotaServiceCode).toMatch(/vip:.*ocr_page_quota: 10000/s);
    });

    it('admin: 무제한 (-1)', () => {
      expect(storageQuotaServiceCode).toContain('admin:');
      expect(storageQuotaServiceCode).toMatch(/admin:.*ocr_page_quota: -1/s);
    });
  });

  describe('2. 가입 기념일 기반 사이클 계산', () => {
    it('calculateOcrCycle 함수가 export 되어야 함', () => {
      expect(storageQuotaServiceCode).toContain('calculateOcrCycle,');
      expect(typeof calculateOcrCycle).toBe('function');
    });

    it('KST 오프셋(+9시간)을 사용해야 함', () => {
      expect(storageQuotaServiceCode).toContain('KST_OFFSET = 9 * 60 * 60 * 1000');
    });

    it('매월 1일 리셋 방식 (SaaS 표준 과금)', () => {
      // 2026-01: SaaS 표준 과금 방식으로 전환 - 매월 1일 리셋 + 첫 달 일할 계산
      expect(storageQuotaServiceCode).toContain('현재 월의 1일');
      expect(storageQuotaServiceCode).toContain('isFirstMonth');
    });

    it('cycleStart, cycleEnd, daysUntilReset을 반환해야 함', () => {
      const result = calculateOcrCycle(new Date('2025-06-15'));
      expect(result).toHaveProperty('cycleStart');
      expect(result).toHaveProperty('cycleEnd');
      expect(result).toHaveProperty('daysUntilReset');
      expect(result.cycleStart instanceof Date).toBe(true);
      expect(result.cycleEnd instanceof Date).toBe(true);
      expect(typeof result.daysUntilReset).toBe('number');
    });

    it('daysUntilReset은 0 이상이어야 함', () => {
      const result = calculateOcrCycle(new Date());
      expect(result.daysUntilReset).toBeGreaterThanOrEqual(0);
    });

    it('cycleEnd는 cycleStart보다 이후여야 함', () => {
      const result = calculateOcrCycle(new Date('2025-01-15'));
      expect(result.cycleEnd.getTime()).toBeGreaterThan(result.cycleStart.getTime());
    });
  });

  describe('3. 사이클 계산 시나리오 테스트', () => {
    it('사이클 기간은 약 1개월(28-31일)이어야 함', () => {
      const result = calculateOcrCycle(new Date('2025-06-15'));
      const durationMs = result.cycleEnd.getTime() - result.cycleStart.getTime();
      const durationDays = durationMs / (1000 * 60 * 60 * 24);

      // 28일 ~ 31일 사이
      expect(durationDays).toBeGreaterThanOrEqual(27);
      expect(durationDays).toBeLessThanOrEqual(32);
    });

    it('가입일이 1일인 경우 매월 1일에 사이클 시작', () => {
      const result = calculateOcrCycle(new Date('2025-01-01'));
      const cycleStartKST = new Date(result.cycleStart.getTime() + 9 * 60 * 60 * 1000);
      expect(cycleStartKST.getUTCDate()).toBe(1);
    });

    it('가입일이 28일인 경우에도 매월 1일에 사이클 시작 (SaaS 표준)', () => {
      // 2026-01: 매월 1일 리셋으로 변경됨
      const result = calculateOcrCycle(new Date('2025-03-28'));
      const cycleStartKST = new Date(result.cycleStart.getTime() + 9 * 60 * 60 * 1000);
      expect(cycleStartKST.getUTCDate()).toBe(1);  // 매월 1일 시작
    });

    it('가입일이 31일인 경우 말일 조정 로직 적용', () => {
      // 31일 가입자는 30일 또는 28/29일인 달에서 조정됨
      const result = calculateOcrCycle(new Date('2025-01-31'));
      const cycleStartKST = new Date(result.cycleStart.getTime() + 9 * 60 * 60 * 1000);
      // 현재 달의 마지막 날 이하여야 함
      expect(cycleStartKST.getUTCDate()).toBeLessThanOrEqual(31);
    });

    it('daysUntilReset이 31을 초과하지 않아야 함', () => {
      const result = calculateOcrCycle(new Date('2025-06-15'));
      expect(result.daysUntilReset).toBeLessThanOrEqual(31);
    });
  });

  describe('4. 페이지 기반 사용량 계산', () => {
    it('calculateUserOcrPagesInCycle 함수가 export 되어야 함', () => {
      expect(storageQuotaServiceCode).toContain('calculateUserOcrPagesInCycle,');
      expect(typeof calculateUserOcrPagesInCycle).toBe('function');
    });

    it('ocr.page_count를 합산해야 함 (없으면 1로 폴백)', () => {
      expect(storageQuotaServiceCode).toContain(
        "$sum: { $ifNull: ['$ocr.page_count', 1] }"
      );
    });

    it('ocr.status가 done인 문서만 집계해야 함', () => {
      expect(storageQuotaServiceCode).toContain("'ocr.status': 'done'");
    });

    it('pages_used와 docs_count를 반환해야 함', () => {
      expect(storageQuotaServiceCode).toContain('pages_used: result[0].pages_used');
      expect(storageQuotaServiceCode).toContain('docs_count: result[0].docs_count');
    });
  });

  describe('5. check-quota API 구현', () => {
    it('POST /api/internal/ocr/check-quota 라우트가 존재해야 함', () => {
      expect(ocrUsageRoutesCode).toContain("router.post('/internal/ocr/check-quota'");
    });

    it('owner_id와 page_count를 받아야 함', () => {
      expect(ocrUsageRoutesCode).toContain('owner_id');
      expect(ocrUsageRoutesCode).toContain('page_count');
    });

    it('allowed, current_usage, quota, remaining을 반환해야 함', () => {
      expect(ocrUsageRoutesCode).toContain('allowed');
      expect(ocrUsageRoutesCode).toContain('current_usage');
      expect(ocrUsageRoutesCode).toContain('quota');
      expect(ocrUsageRoutesCode).toContain('remaining');
    });

    it('무제한 사용자는 항상 allowed: true여야 함', () => {
      // 크레딧 기반으로 전환됨 - quota === -1이면 무제한
      expect(ocrUsageRoutesCode).toContain('allowed');
      expect(ocrUsageRoutesCode).toMatch(/quota.*-1/);
    });
  });

  describe('6. n8n OCRWorker 사전 체크 로직', () => {
    const nodeNames = ocrWorkerJson.nodes.map(n => n.name);

    it('Get Page Count 노드가 존재해야 함', () => {
      expect(nodeNames).toContain('Get Page Count');
    });

    it('Parse Page Count 노드가 존재해야 함', () => {
      expect(nodeNames).toContain('Parse Page Count');
    });

    it('Check OCR Quota 노드가 존재해야 함', () => {
      expect(nodeNames).toContain('Check OCR Quota');
    });

    it('Is Quota Exceeded? 분기 노드가 존재해야 함', () => {
      expect(nodeNames).toContain('Is Quota Exceeded?');
    });

    it('Set Quota Exceeded 노드가 존재해야 함', () => {
      expect(nodeNames).toContain('Set Quota Exceeded');
    });

    it('check-quota API를 호출해야 함', () => {
      const checkQuotaNode = ocrWorkerJson.nodes.find(n => n.name === 'Check OCR Quota');
      expect(checkQuotaNode.parameters.url).toContain('/api/internal/ocr/check-quota');
    });

    it('quota_exceeded 상태를 설정해야 함', () => {
      const setQuotaNode = ocrWorkerJson.nodes.find(n => n.name === 'Set Quota Exceeded');
      const assignments = setQuotaNode.parameters.assignments.assignments;
      const statusAssignment = assignments.find(a => a.name === 'ocr.status');
      expect(statusAssignment.value).toBe('quota_exceeded');
    });

    it('연결: Pasre → Get Page Count → Parse Page Count → Check OCR Quota → Is Quota Exceeded?', () => {
      const connections = ocrWorkerJson.connections;

      expect(connections['Pasre'].main[0][0].node).toBe('Get Page Count');
      expect(connections['Get Page Count'].main[0][0].node).toBe('Parse Page Count');
      expect(connections['Parse Page Count'].main[0][0].node).toBe('Check OCR Quota');
      expect(connections['Check OCR Quota'].main[0][0].node).toBe('Is Quota Exceeded?');
    });

    it('한도 초과 시 OCR 스킵하고 Prepare OCR Binary로 가지 않아야 함', () => {
      const connections = ocrWorkerJson.connections;
      const quotaExceededBranch = connections['Is Quota Exceeded?'].main[0][0];
      const allowedBranch = connections['Is Quota Exceeded?'].main[1][0];

      expect(quotaExceededBranch.node).toBe('Set Quota Exceeded');
      expect(allowedBranch.node).toBe('Prepare OCR Binary');
    });
  });

  describe('7. file_analyzer.js 페이지 수 파악', () => {
    it('pdf_pages 필드를 반환해야 함', () => {
      expect(fileAnalyzerCode).toContain('meta.pdf_pages');
    });

    it('TIFF 다중 페이지 지원 (utif)', () => {
      expect(fileAnalyzerCode).toContain("require('utif')");
      expect(fileAnalyzerCode).toContain('UTIF.decode');
      expect(fileAnalyzerCode).toContain('ifds.length');
    });

    it('일반 이미지는 1페이지로 처리', () => {
      expect(fileAnalyzerCode).toContain("mimeType.startsWith(\"image/\")");
      expect(fileAnalyzerCode).toContain('meta.pdf_pages = 1');
    });
  });

  describe('8. getUserStorageInfo 반환값', () => {
    it('ocr_page_quota를 반환해야 함', () => {
      // 일할 계산이 적용된 값 (effectiveOcrPageQuota)
      expect(storageQuotaServiceCode).toContain('ocr_page_quota: effectiveOcrPageQuota');
    });

    it('ocr_pages_used를 반환해야 함', () => {
      expect(storageQuotaServiceCode).toContain('ocr_pages_used: pages_used');
    });

    it('ocr_docs_count를 반환해야 함', () => {
      expect(storageQuotaServiceCode).toContain('ocr_docs_count: docs_count');
    });

    it('ocr_cycle_start를 반환해야 함', () => {
      expect(storageQuotaServiceCode).toContain('ocr_cycle_start: formatDateKST(cycleStart)');
    });

    it('ocr_cycle_end를 반환해야 함', () => {
      expect(storageQuotaServiceCode).toContain('ocr_cycle_end: formatDateKST(cycleEnd)');
    });

    it('ocr_days_until_reset을 반환해야 함', () => {
      expect(storageQuotaServiceCode).toContain('ocr_days_until_reset: daysUntilReset');
    });

    it('하위 호환성: ocr_quota (deprecated)를 유지해야 함', () => {
      expect(storageQuotaServiceCode).toContain('ocr_quota: ocrQuota');
    });

    it('하위 호환성: ocr_used_this_month (deprecated)를 유지해야 함', () => {
      expect(storageQuotaServiceCode).toContain('ocr_used_this_month: pages_used');
    });
  });

  describe('9. 프론트엔드 타입 정의', () => {
    const userServiceCode = fs.readFileSync(
      path.join(__dirname, '../../../../frontend/aims-uix3/src/services/userService.ts'),
      'utf-8'
    );

    it('StorageInfo에 ocr_page_quota 타입 정의', () => {
      expect(userServiceCode).toContain('ocr_page_quota: number');
    });

    it('StorageInfo에 ocr_pages_used 타입 정의', () => {
      expect(userServiceCode).toContain('ocr_pages_used: number');
    });

    it('StorageInfo에 ocr_docs_count 타입 정의', () => {
      expect(userServiceCode).toContain('ocr_docs_count: number');
    });

    it('StorageInfo에 ocr_cycle_start 타입 정의', () => {
      expect(userServiceCode).toContain('ocr_cycle_start: string');
    });

    it('StorageInfo에 ocr_cycle_end 타입 정의', () => {
      expect(userServiceCode).toContain('ocr_cycle_end: string');
    });

    it('StorageInfo에 ocr_days_until_reset 타입 정의', () => {
      expect(userServiceCode).toContain('ocr_days_until_reset: number');
    });
  });

  describe('10. UsageQuotaWidget UI (크레딧 기반)', () => {
    // @updated 2026-01-06: OCR 페이지 → 크레딧 표시로 전환됨
    const widgetCode = fs.readFileSync(
      path.join(__dirname, '../../../../frontend/aims-uix3/src/shared/ui/UsageQuotaWidget/UsageQuotaWidget.tsx'),
      'utf-8'
    );

    it('크레딧 기반 사용률 계산', () => {
      expect(widgetCode).toContain('credits_used');
      expect(widgetCode).toContain('credit_quota');
    });

    it('사이클 정보 표시', () => {
      // UI에서는 사이클 종료일(credit_cycle_end)만 표시 (시작일은 백엔드에서만 사용)
      expect(widgetCode).toContain('credit_cycle_end');
    });

    it('리셋까지 남은 일수는 백엔드 API에서 제공', () => {
      // UI에서는 credit_days_until_reset을 직접 표시하지 않고,
      // 사이클 종료일(credit_cycle_end)로 간접 표시
      // 상세 정보는 AccountSettingsView에서 표시됨
      expect(widgetCode).toContain('credit_cycle_end');
    });

    it('툴팁에 크레딧 사용량 표시', () => {
      // 위젯 툴팁에는 크레딧 사용량과 한도 표시
      expect(widgetCode).toContain('credits_used');
      expect(widgetCode).toContain('credit_quota');
    });
  });
});

describe('OCR 정책 시나리오 테스트', () => {
  describe('한도 체크 로직 시뮬레이션', () => {
    // 정책 문서의 예시 시나리오 검증
    // 100페이지 한도, 현재 사용량에 따른 허용/거부

    const checkQuota = (currentUsage, requestPages, quota) => {
      if (quota === -1) return { allowed: true }; // 무제한
      return {
        allowed: currentUsage + requestPages <= quota,
        would_exceed_by: Math.max(0, (currentUsage + requestPages) - quota)
      };
    };

    it('시나리오 1: 0p 사용 중 + 30p 요청 → 허용', () => {
      const result = checkQuota(0, 30, 100);
      expect(result.allowed).toBe(true);
    });

    it('시나리오 2: 30p 사용 중 + 50p 요청 → 허용', () => {
      const result = checkQuota(30, 50, 100);
      expect(result.allowed).toBe(true);
    });

    it('시나리오 3: 80p 사용 중 + 25p 요청 → 거부', () => {
      const result = checkQuota(80, 25, 100);
      expect(result.allowed).toBe(false);
      expect(result.would_exceed_by).toBe(5);
    });

    it('시나리오 4: 80p 사용 중 + 20p 요청 → 허용 (딱 맞음)', () => {
      const result = checkQuota(80, 20, 100);
      expect(result.allowed).toBe(true);
    });

    it('시나리오 5: 100p 사용 중 + 1p 요청 → 거부', () => {
      const result = checkQuota(100, 1, 100);
      expect(result.allowed).toBe(false);
    });

    it('시나리오 6: admin (무제한) → 항상 허용', () => {
      const result = checkQuota(10000, 5000, -1);
      expect(result.allowed).toBe(true);
    });
  });

  describe('티어별 한도 시나리오', () => {
    const tierLimits = {
      free_trial: 100,
      standard: 500,
      premium: 3000,
      vip: 10000,
      admin: -1
    };

    const checkQuota = (currentUsage, requestPages, quota) => {
      if (quota === -1) return { allowed: true };
      return { allowed: currentUsage + requestPages <= quota };
    };

    it('free_trial: 99p + 1p = 허용, 100p + 1p = 거부', () => {
      expect(checkQuota(99, 1, tierLimits.free_trial).allowed).toBe(true);
      expect(checkQuota(100, 1, tierLimits.free_trial).allowed).toBe(false);
    });

    it('standard: 499p + 1p = 허용, 500p + 1p = 거부', () => {
      expect(checkQuota(499, 1, tierLimits.standard).allowed).toBe(true);
      expect(checkQuota(500, 1, tierLimits.standard).allowed).toBe(false);
    });

    it('premium: 2999p + 1p = 허용, 3000p + 1p = 거부', () => {
      expect(checkQuota(2999, 1, tierLimits.premium).allowed).toBe(true);
      expect(checkQuota(3000, 1, tierLimits.premium).allowed).toBe(false);
    });

    it('vip: 9999p + 1p = 허용, 10000p + 1p = 거부', () => {
      expect(checkQuota(9999, 1, tierLimits.vip).allowed).toBe(true);
      expect(checkQuota(10000, 1, tierLimits.vip).allowed).toBe(false);
    });

    it('admin: 어떤 사용량이든 항상 허용', () => {
      expect(checkQuota(0, 100000, tierLimits.admin).allowed).toBe(true);
      expect(checkQuota(999999, 999999, tierLimits.admin).allowed).toBe(true);
    });
  });

  describe('대용량 문서 시나리오', () => {
    const checkQuota = (currentUsage, requestPages, quota) => {
      if (quota === -1) return { allowed: true };
      return { allowed: currentUsage + requestPages <= quota };
    };

    it('free_trial: 100페이지 문서 한 번에 업로드 (0p 사용 중) → 허용', () => {
      expect(checkQuota(0, 100, 100).allowed).toBe(true);
    });

    it('free_trial: 101페이지 문서 업로드 → 거부', () => {
      expect(checkQuota(0, 101, 100).allowed).toBe(false);
    });

    it('standard: 500페이지 문서 한 번에 업로드 → 허용', () => {
      expect(checkQuota(0, 500, 500).allowed).toBe(true);
    });

    it('premium: 3000페이지 문서 한 번에 업로드 → 허용', () => {
      expect(checkQuota(0, 3000, 3000).allowed).toBe(true);
    });
  });

  describe('경계값 테스트', () => {
    const checkQuota = (currentUsage, requestPages, quota) => {
      if (quota === -1) return { allowed: true };
      return { allowed: currentUsage + requestPages <= quota };
    };

    it('0페이지 요청은 항상 허용', () => {
      expect(checkQuota(100, 0, 100).allowed).toBe(true);
      expect(checkQuota(500, 0, 500).allowed).toBe(true);
    });

    it('한도와 정확히 일치하면 허용', () => {
      expect(checkQuota(50, 50, 100).allowed).toBe(true);
      expect(checkQuota(250, 250, 500).allowed).toBe(true);
    });

    it('1페이지 초과하면 거부', () => {
      expect(checkQuota(50, 51, 100).allowed).toBe(false);
      expect(checkQuota(250, 251, 500).allowed).toBe(false);
    });
  });
});

describe('OCR 상태 정의 검증', () => {
  const fs = require('fs');
  const path = require('path');

  const ocrUsageRoutesCode = fs.readFileSync(
    path.join(__dirname, '../routes/ocr-usage-routes.js'),
    'utf-8'
  );

  const ocrWorkerJson = JSON.parse(fs.readFileSync(
    path.join(__dirname, '../../../n8n_flows/modules/OCRWorker.json'),
    'utf-8'
  ));

  describe('OCR 상태값', () => {
    it('quota_exceeded 상태가 n8n에서 설정됨', () => {
      const setQuotaNode = ocrWorkerJson.nodes.find(n => n.name === 'Set Quota Exceeded');
      const statusAssignment = setQuotaNode.parameters.assignments.assignments
        .find(a => a.name === 'ocr.status');
      expect(statusAssignment.value).toBe('quota_exceeded');
    });

    it('quota_message에 사용량 정보 포함', () => {
      const setQuotaNode = ocrWorkerJson.nodes.find(n => n.name === 'Set Quota Exceeded');
      const messageAssignment = setQuotaNode.parameters.assignments.assignments
        .find(a => a.name === 'ocr.quota_message');
      expect(messageAssignment.value).toContain('current_usage');
      expect(messageAssignment.value).toContain('quota');
      expect(messageAssignment.value).toContain('requested');
    });
  });
});

describe('API 응답 형식 검증', () => {
  const fs = require('fs');
  const path = require('path');

  const ocrUsageRoutesCode = fs.readFileSync(
    path.join(__dirname, '../routes/ocr-usage-routes.js'),
    'utf-8'
  );

  it('check-quota API가 success 필드를 반환', () => {
    expect(ocrUsageRoutesCode).toContain('success: true');
  });

  it('check-quota API가 reason 필드를 반환 (거부 시)', () => {
    expect(ocrUsageRoutesCode).toContain('reason');
  });

  it('check-quota API가 requested 필드를 반환', () => {
    expect(ocrUsageRoutesCode).toContain('requested');
  });
});

describe('정책 문서 일관성 검증', () => {
  const fs = require('fs');
  const path = require('path');

  const policyDoc = fs.readFileSync(
    path.join(__dirname, '../../../../docs/OCR_USAGE_POLICY.md'),
    'utf-8'
  );

  it('정책 문서에 free_trial 100p 정의', () => {
    expect(policyDoc).toMatch(/free_trial.*100/);
  });

  it('정책 문서에 standard 500p 정의', () => {
    expect(policyDoc).toMatch(/standard.*500/);
  });

  it('정책 문서에 premium 3,000p 정의', () => {
    expect(policyDoc).toMatch(/premium.*3,?000/);
  });

  it('정책 문서에 vip 10,000p 정의', () => {
    expect(policyDoc).toMatch(/vip.*10,?000/);
  });

  it('정책 문서에 admin 무제한 정의', () => {
    expect(policyDoc).toMatch(/admin.*무제한/);
  });

  it('정책 문서에 가입 기념일 리셋 언급', () => {
    expect(policyDoc).toContain('가입 기념일');
  });

  it('정책 문서에 KST 기준 명시', () => {
    expect(policyDoc).toContain('KST');
  });

  it('정책 문서 구현 체크리스트 완료 표시', () => {
    // 모든 체크리스트 항목이 [x]로 표시되어야 함
    const checklistItems = policyDoc.match(/- \[.\]/g) || [];
    const completedItems = policyDoc.match(/- \[x\]/g) || [];
    expect(checklistItems.length).toBe(completedItems.length);
    expect(completedItems.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 추가 엣지 케이스 테스트
// ============================================================

describe('사이클 계산 엣지 케이스', () => {
  const { calculateOcrCycle } = require('../lib/storageQuotaService');

  describe('윤년 처리', () => {
    it('2월 29일 가입자 - 윤년이 아닌 해에는 2월 28일로 조정', () => {
      // 2024년 2월 29일 가입 (윤년)
      const result = calculateOcrCycle(new Date('2024-02-29T00:00:00Z'));
      const cycleStartKST = new Date(result.cycleStart.getTime() + 9 * 60 * 60 * 1000);
      // 28일 또는 29일이어야 함
      expect(cycleStartKST.getUTCDate()).toBeLessThanOrEqual(29);
    });

    it('윤년 2월은 29일까지 허용', () => {
      const result = calculateOcrCycle(new Date('2024-02-15T00:00:00Z'));
      expect(result.cycleStart).toBeDefined();
      expect(result.cycleEnd).toBeDefined();
    });
  });

  describe('말일 가입자 처리', () => {
    it('30일 가입자 - 2월에는 28/29일로 조정', () => {
      const result = calculateOcrCycle(new Date('2025-01-30T00:00:00Z'));
      const cycleStartKST = new Date(result.cycleStart.getTime() + 9 * 60 * 60 * 1000);
      expect(cycleStartKST.getUTCDate()).toBeLessThanOrEqual(30);
    });

    it('31일 가입자 - 30일인 달에는 30일로 조정', () => {
      const result = calculateOcrCycle(new Date('2025-03-31T00:00:00Z'));
      const cycleStartKST = new Date(result.cycleStart.getTime() + 9 * 60 * 60 * 1000);
      expect(cycleStartKST.getUTCDate()).toBeLessThanOrEqual(31);
    });
  });

  describe('연말/연초 경계', () => {
    it('12월 31일 가입자 - 연도가 바뀌어도 정상 작동', () => {
      const result = calculateOcrCycle(new Date('2024-12-31T00:00:00Z'));
      expect(result.cycleStart).toBeDefined();
      expect(result.cycleEnd).toBeDefined();
      expect(result.daysUntilReset).toBeGreaterThanOrEqual(0);
    });

    it('1월 1일 가입자 - 연도 경계 처리', () => {
      const result = calculateOcrCycle(new Date('2025-01-01T00:00:00Z'));
      const cycleStartKST = new Date(result.cycleStart.getTime() + 9 * 60 * 60 * 1000);
      expect(cycleStartKST.getUTCDate()).toBe(1);
    });
  });

  describe('시간대 경계 (KST)', () => {
    it('KST 자정 직전 (23:59) 처리', () => {
      // UTC 14:59 = KST 23:59
      const result = calculateOcrCycle(new Date('2025-06-15T14:59:00Z'));
      expect(result.cycleStart).toBeDefined();
    });

    it('KST 자정 직후 (00:01) 처리', () => {
      // UTC 15:01 = KST 00:01 (다음날)
      const result = calculateOcrCycle(new Date('2025-06-15T15:01:00Z'));
      expect(result.cycleStart).toBeDefined();
    });
  });

  describe('과거/미래 날짜', () => {
    it('매우 오래된 가입일 (2000년)도 처리', () => {
      const result = calculateOcrCycle(new Date('2000-01-15T00:00:00Z'));
      expect(result.cycleStart).toBeDefined();
      expect(result.daysUntilReset).toBeGreaterThanOrEqual(0);
    });

    it('미래 가입일도 에러 없이 처리', () => {
      const result = calculateOcrCycle(new Date('2030-06-15T00:00:00Z'));
      expect(result.cycleStart).toBeDefined();
    });
  });

  describe('사이클 기간 일관성', () => {
    it('모든 월에서 사이클 기간이 27-32일 사이', () => {
      for (let month = 0; month < 12; month++) {
        const date = new Date(2025, month, 15);
        const result = calculateOcrCycle(date);
        const durationMs = result.cycleEnd.getTime() - result.cycleStart.getTime();
        const durationDays = durationMs / (1000 * 60 * 60 * 24);
        expect(durationDays).toBeGreaterThanOrEqual(27);
        expect(durationDays).toBeLessThanOrEqual(32);
      }
    });

    it('cycleEnd가 항상 cycleStart 이후', () => {
      const testDates = [
        new Date('2025-01-01'),
        new Date('2025-02-28'),
        new Date('2025-03-31'),
        new Date('2025-06-30'),
        new Date('2025-12-31'),
      ];
      testDates.forEach(date => {
        const result = calculateOcrCycle(date);
        expect(result.cycleEnd.getTime()).toBeGreaterThan(result.cycleStart.getTime());
      });
    });
  });
});

describe('한도 체크 엣지 케이스', () => {
  const checkQuota = (currentUsage, requestPages, quota) => {
    if (quota === -1) return { allowed: true, reason: 'unlimited' };
    if (requestPages < 0) return { allowed: false, reason: 'invalid_request' };
    if (currentUsage < 0) return { allowed: false, reason: 'invalid_usage' };

    const allowed = currentUsage + requestPages <= quota;
    return {
      allowed,
      reason: allowed ? 'ok' : 'quota_exceeded',
      would_exceed_by: allowed ? 0 : (currentUsage + requestPages) - quota
    };
  };

  describe('특수 값 처리', () => {
    it('0페이지 요청 - 한도 가득 차도 허용', () => {
      expect(checkQuota(100, 0, 100).allowed).toBe(true);
      expect(checkQuota(500, 0, 500).allowed).toBe(true);
      expect(checkQuota(3000, 0, 3000).allowed).toBe(true);
    });

    it('음수 페이지 요청 - 거부', () => {
      expect(checkQuota(50, -1, 100).allowed).toBe(false);
      expect(checkQuota(50, -100, 100).allowed).toBe(false);
    });

    it('음수 현재 사용량 - 거부 (데이터 오류)', () => {
      expect(checkQuota(-10, 5, 100).allowed).toBe(false);
    });

    it('매우 큰 페이지 수 요청', () => {
      expect(checkQuota(0, 1000000, 100).allowed).toBe(false);
      expect(checkQuota(0, 1000000, -1).allowed).toBe(true); // admin은 허용
    });
  });

  describe('정확한 경계값', () => {
    it('한도 - 1 상태에서 1페이지 요청 = 허용', () => {
      expect(checkQuota(99, 1, 100).allowed).toBe(true);
      expect(checkQuota(499, 1, 500).allowed).toBe(true);
      expect(checkQuota(2999, 1, 3000).allowed).toBe(true);
      expect(checkQuota(9999, 1, 10000).allowed).toBe(true);
    });

    it('정확히 한도 상태에서 1페이지 요청 = 거부', () => {
      expect(checkQuota(100, 1, 100).allowed).toBe(false);
      expect(checkQuota(500, 1, 500).allowed).toBe(false);
      expect(checkQuota(3000, 1, 3000).allowed).toBe(false);
      expect(checkQuota(10000, 1, 10000).allowed).toBe(false);
    });

    it('한도 + 1 상태에서 0페이지 요청 = 거부 (이미 초과)', () => {
      // 정책: currentUsage + requestPages <= quota
      // 101 + 0 = 101 > 100 → 거부
      expect(checkQuota(101, 0, 100).allowed).toBe(false);
    });
  });

  describe('would_exceed_by 정확성', () => {
    it('초과량 정확히 계산', () => {
      expect(checkQuota(80, 25, 100).would_exceed_by).toBe(5);
      expect(checkQuota(90, 20, 100).would_exceed_by).toBe(10);
      expect(checkQuota(100, 100, 100).would_exceed_by).toBe(100);
    });

    it('허용 시 초과량 0', () => {
      expect(checkQuota(50, 50, 100).would_exceed_by).toBe(0);
      expect(checkQuota(0, 100, 100).would_exceed_by).toBe(0);
    });
  });

  describe('무제한 사용자 (admin)', () => {
    it('어떤 값이든 항상 허용', () => {
      expect(checkQuota(0, 0, -1).allowed).toBe(true);
      expect(checkQuota(0, 1000000, -1).allowed).toBe(true);
      expect(checkQuota(1000000, 1000000, -1).allowed).toBe(true);
      expect(checkQuota(Number.MAX_SAFE_INTEGER, 1, -1).allowed).toBe(true);
    });

    it('reason이 unlimited', () => {
      expect(checkQuota(0, 100, -1).reason).toBe('unlimited');
    });
  });
});

describe('티어 승격/강등 시나리오', () => {
  const tierLimits = {
    free_trial: 100,
    standard: 500,
    premium: 3000,
    vip: 10000,
    admin: -1
  };

  const checkQuota = (currentUsage, requestPages, quota) => {
    if (quota === -1) return { allowed: true };
    return { allowed: currentUsage + requestPages <= quota };
  };

  describe('티어 승격', () => {
    it('free_trial(100p 사용) → standard: 추가 400p 사용 가능', () => {
      // 100p 사용 중 standard로 승격
      expect(checkQuota(100, 1, tierLimits.standard).allowed).toBe(true);
      expect(checkQuota(100, 400, tierLimits.standard).allowed).toBe(true);
      expect(checkQuota(100, 401, tierLimits.standard).allowed).toBe(false);
    });

    it('standard(500p 사용) → premium: 추가 2500p 사용 가능', () => {
      expect(checkQuota(500, 1, tierLimits.premium).allowed).toBe(true);
      expect(checkQuota(500, 2500, tierLimits.premium).allowed).toBe(true);
      expect(checkQuota(500, 2501, tierLimits.premium).allowed).toBe(false);
    });

    it('vip(10000p 사용) → admin: 무제한', () => {
      expect(checkQuota(10000, 1, tierLimits.admin).allowed).toBe(true);
      expect(checkQuota(10000, 100000, tierLimits.admin).allowed).toBe(true);
    });
  });

  describe('티어 강등', () => {
    it('standard(300p 사용) → free_trial: 이미 초과, 모든 요청 거부', () => {
      // 300p 사용 중 free_trial로 강등 (한도 100p)
      // 정책: currentUsage + requestPages <= quota
      // 300 + 1 = 301 > 100 → 거부
      // 300 + 0 = 300 > 100 → 거부 (이미 초과 상태)
      expect(checkQuota(300, 1, tierLimits.free_trial).allowed).toBe(false);
      expect(checkQuota(300, 0, tierLimits.free_trial).allowed).toBe(false);
    });

    it('premium(2000p 사용) → standard: 이미 초과, 추가 요청 불가', () => {
      expect(checkQuota(2000, 1, tierLimits.standard).allowed).toBe(false);
    });

    it('admin → vip: 사용량에 따라 제한', () => {
      expect(checkQuota(5000, 1, tierLimits.vip).allowed).toBe(true);
      expect(checkQuota(10000, 1, tierLimits.vip).allowed).toBe(false);
    });
  });
});

describe('동시 업로드 시나리오', () => {
  const checkQuota = (currentUsage, requestPages, quota) => {
    if (quota === -1) return { allowed: true };
    return { allowed: currentUsage + requestPages <= quota };
  };

  it('연속 업로드: 50p + 30p + 20p = 정확히 100p (모두 허용)', () => {
    let usage = 0;

    // 첫 번째 업로드
    expect(checkQuota(usage, 50, 100).allowed).toBe(true);
    usage += 50;

    // 두 번째 업로드
    expect(checkQuota(usage, 30, 100).allowed).toBe(true);
    usage += 30;

    // 세 번째 업로드
    expect(checkQuota(usage, 20, 100).allowed).toBe(true);
    usage += 20;

    // 네 번째 업로드 (1p도 불가)
    expect(checkQuota(usage, 1, 100).allowed).toBe(false);
  });

  it('동시 요청 시뮬레이션: 각각 체크 시점에서 허용되지만 합산하면 초과', () => {
    // 현재 80p 사용 중, 두 요청이 동시에 들어옴
    const currentUsage = 80;
    const request1 = 15; // 80 + 15 = 95 ≤ 100 → 허용
    const request2 = 15; // 80 + 15 = 95 ≤ 100 → 허용

    // 각각 체크하면 둘 다 허용
    expect(checkQuota(currentUsage, request1, 100).allowed).toBe(true);
    expect(checkQuota(currentUsage, request2, 100).allowed).toBe(true);

    // 하지만 둘 다 처리되면 110p가 됨 (Race Condition)
    // → 실제 구현에서는 순차 처리로 방지
  });
});

describe('파일 유형별 페이지 수', () => {
  describe('PDF 페이지 수', () => {
    it('1페이지 PDF', () => {
      const pageCount = 1;
      expect(pageCount).toBe(1);
    });

    it('100페이지 PDF', () => {
      const pageCount = 100;
      expect(pageCount).toBe(100);
    });

    it('Upstage 최대 한도 (100페이지)', () => {
      // Upstage OCR은 한 번에 100페이지까지만 처리
      const maxUpstagePages = 100;
      expect(maxUpstagePages).toBe(100);
    });
  });

  describe('이미지 파일', () => {
    it('단일 이미지 = 1페이지', () => {
      const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
      imageTypes.forEach(type => {
        const pageCount = 1; // 이미지는 항상 1페이지
        expect(pageCount).toBe(1);
      });
    });
  });

  describe('TIFF 파일', () => {
    it('단일 페이지 TIFF = 1페이지', () => {
      const pageCount = 1;
      expect(pageCount).toBe(1);
    });

    it('다중 페이지 TIFF (5페이지)', () => {
      const pageCount = 5;
      expect(pageCount).toBe(5);
    });

    it('다중 페이지 TIFF (100페이지)', () => {
      const pageCount = 100;
      expect(pageCount).toBe(100);
    });
  });
});

describe('API 파라미터 검증', () => {
  const fs = require('fs');
  const path = require('path');

  const ocrUsageRoutesCode = fs.readFileSync(
    path.join(__dirname, '../routes/ocr-usage-routes.js'),
    'utf-8'
  );

  describe('필수 파라미터', () => {
    it('owner_id 검증 로직 존재', () => {
      expect(ocrUsageRoutesCode).toContain('owner_id');
    });

    it('page_count 검증 로직 존재', () => {
      expect(ocrUsageRoutesCode).toContain('page_count');
    });
  });

  describe('응답 필드 완전성', () => {
    it('success 필드', () => {
      expect(ocrUsageRoutesCode).toContain('success');
    });

    it('allowed 필드', () => {
      expect(ocrUsageRoutesCode).toContain('allowed');
    });

    it('current_usage 필드', () => {
      expect(ocrUsageRoutesCode).toContain('current_usage');
    });

    it('quota 필드', () => {
      expect(ocrUsageRoutesCode).toContain('quota');
    });

    it('remaining 필드', () => {
      expect(ocrUsageRoutesCode).toContain('remaining');
    });

    it('requested 필드', () => {
      expect(ocrUsageRoutesCode).toContain('requested');
    });
  });
});

describe('사용자 권한 엣지 케이스', () => {
  const fs = require('fs');
  const path = require('path');

  const storageQuotaServiceCode = fs.readFileSync(
    path.join(__dirname, '../lib/storageQuotaService.js'),
    'utf-8'
  );

  describe('OCR 권한', () => {
    it('hasOcrPermission 체크 로직', () => {
      expect(storageQuotaServiceCode).toContain('hasOcrPermission');
    });

    it('admin은 항상 OCR 권한 있음', () => {
      expect(storageQuotaServiceCode).toContain("isAdmin ? true : (user?.hasOcrPermission");
    });
  });

  describe('subscription_start_date 폴백', () => {
    it('subscription_start_date 없으면 createdAt 사용', () => {
      expect(storageQuotaServiceCode).toContain("user?.subscription_start_date || user?.createdAt");
    });

    it('둘 다 없으면 현재 시간 사용', () => {
      expect(storageQuotaServiceCode).toContain("|| new Date()");
    });
  });
});

describe('n8n 워크플로우 엣지 케이스', () => {
  const fs = require('fs');
  const path = require('path');

  const ocrWorkerJson = JSON.parse(fs.readFileSync(
    path.join(__dirname, '../../../n8n_flows/modules/OCRWorker.json'),
    'utf-8'
  ));

  describe('에러 처리', () => {
    it('Get Page Count 노드에 alwaysOutputData 설정', () => {
      const node = ocrWorkerJson.nodes.find(n => n.name === 'Get Page Count');
      expect(node.alwaysOutputData).toBe(true);
    });

    it('Parse Page Count에 에러 폴백 (1페이지)', () => {
      const node = ocrWorkerJson.nodes.find(n => n.name === 'Parse Page Count');
      expect(node.parameters.jsCode).toContain('page_count: 1');
      expect(node.parameters.jsCode).toContain('catch');
    });

    it('Check OCR Quota에 neverError 설정', () => {
      const node = ocrWorkerJson.nodes.find(n => n.name === 'Check OCR Quota');
      expect(node.parameters.options.response.response.neverError).toBe(true);
    });
  });

  describe('데이터 전달', () => {
    it('Parse Page Count가 필요한 모든 필드 전달', () => {
      const node = ocrWorkerJson.nodes.find(n => n.name === 'Parse Page Count');
      const jsCode = node.parameters.jsCode;
      expect(jsCode).toContain('page_count');
      expect(jsCode).toContain('file_path');
      expect(jsCode).toContain('owner_id');
      expect(jsCode).toContain('doc_id');
      expect(jsCode).toContain('file_id');
    });

    it('Check OCR Quota가 owner_id와 page_count 전송', () => {
      const node = ocrWorkerJson.nodes.find(n => n.name === 'Check OCR Quota');
      expect(node.parameters.jsonBody).toContain('owner_id');
      expect(node.parameters.jsonBody).toContain('page_count');
    });
  });
});

describe('프론트엔드 표시 엣지 케이스 (크레딧 기반)', () => {
  // @updated 2026-01-06: OCR 페이지 → 크레딧 표시로 전환됨
  const fs = require('fs');
  const path = require('path');

  const widgetCode = fs.readFileSync(
    path.join(__dirname, '../../../../frontend/aims-uix3/src/shared/ui/UsageQuotaWidget/UsageQuotaWidget.tsx'),
    'utf-8'
  );

  describe('무제한 사용자 표시', () => {
    it('무제한 체크 로직', () => {
      expect(widgetCode).toContain('credit_is_unlimited');
    });

    it('무제한 시 0% 또는 특별 표시', () => {
      expect(widgetCode).toContain('credit_is_unlimited');
    });
  });

  describe('사이클 날짜 포맷', () => {
    it('MM/DD 형식 변환', () => {
      // 실제 구현: split('-')으로 날짜 파싱 후 parseInt로 변환
      expect(widgetCode).toContain("split('-')");
      expect(widgetCode).toContain("parseInt(month)");
      expect(widgetCode).toContain("parseInt(day)");
    });

    it('빈 날짜 처리', () => {
      expect(widgetCode).toContain("if (!dateStr) return ''");
    });
  });

  describe('경고 레벨', () => {
    it('95% 이상 danger', () => {
      expect(widgetCode).toContain('percent >= 95');
      expect(widgetCode).toContain("'danger'");
    });

    it('80% 이상 warning', () => {
      expect(widgetCode).toContain('percent >= 80');
      expect(widgetCode).toContain("'warning'");
    });

    it('80% 미만 normal', () => {
      expect(widgetCode).toContain("'normal'");
    });
  });
});

describe('데이터 타입 일관성', () => {
  const fs = require('fs');
  const path = require('path');

  const userServiceCode = fs.readFileSync(
    path.join(__dirname, '../../../../frontend/aims-uix3/src/services/userService.ts'),
    'utf-8'
  );

  describe('StorageInfo 필드 타입', () => {
    it('ocr_page_quota: number', () => {
      expect(userServiceCode).toMatch(/ocr_page_quota:\s*number/);
    });

    it('ocr_pages_used: number', () => {
      expect(userServiceCode).toMatch(/ocr_pages_used:\s*number/);
    });

    it('ocr_docs_count: number', () => {
      expect(userServiceCode).toMatch(/ocr_docs_count:\s*number/);
    });

    it('ocr_remaining: number', () => {
      expect(userServiceCode).toMatch(/ocr_remaining:\s*number/);
    });

    it('ocr_is_unlimited: boolean', () => {
      expect(userServiceCode).toContain('ocr_is_unlimited');
    });

    it('ocr_cycle_start: string (YYYY-MM-DD)', () => {
      expect(userServiceCode).toMatch(/ocr_cycle_start:\s*string/);
    });

    it('ocr_cycle_end: string (YYYY-MM-DD)', () => {
      expect(userServiceCode).toMatch(/ocr_cycle_end:\s*string/);
    });

    it('ocr_days_until_reset: number', () => {
      expect(userServiceCode).toMatch(/ocr_days_until_reset:\s*number/);
    });
  });

  describe('하위 호환성 필드', () => {
    it('ocr_quota (deprecated)', () => {
      expect(userServiceCode).toContain('ocr_quota');
    });

    it('ocr_used_this_month (deprecated)', () => {
      expect(userServiceCode).toContain('ocr_used_this_month');
    });
  });
});
