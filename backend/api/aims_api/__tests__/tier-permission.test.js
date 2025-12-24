/**
 * 티어 권한 검증 테스트
 * @since 2025-12-24
 *
 * 철칙 검증:
 * 1. 일반 사용자는 자신의 tier 정보만 읽기 가능
 * 2. tier 변경은 오직 admin만 가능
 * 3. 모든 tier 관련 admin API는 requireRole('admin') 보호
 */

const fs = require('fs');
const path = require('path');

describe('티어 권한 철칙 검증', () => {
  // 라우트 코드 로드
  const storageRoutesCode = fs.readFileSync(
    path.join(__dirname, '../routes/storage-routes.js'),
    'utf-8'
  );

  const storageQuotaServiceCode = fs.readFileSync(
    path.join(__dirname, '../lib/storageQuotaService.js'),
    'utf-8'
  );

  describe('1. 일반 사용자 - 읽기 전용', () => {
    it('GET /users/me/storage는 authenticateJWT만 필요 (admin 아님)', () => {
      // 일반 사용자도 자신의 스토리지 정보 조회 가능
      expect(storageRoutesCode).toContain(
        "router.get('/users/me/storage', authenticateJWT, async"
      );
      // requireRole('admin')이 없어야 함
      const meStorageMatch = storageRoutesCode.match(
        /router\.get\('\/users\/me\/storage'[^)]+\)/
      );
      expect(meStorageMatch[0]).not.toContain("requireRole('admin')");
    });

    it('사용자 스토리지 조회 시 tier 정보가 포함되어야 함', () => {
      expect(storageQuotaServiceCode).toContain('tier,');
      expect(storageQuotaServiceCode).toContain('tierName: tierDef.name');
    });

    it('사용자 스토리지 조회 시 max_batch_upload_bytes가 포함되어야 함', () => {
      expect(storageQuotaServiceCode).toContain('max_batch_upload_bytes: maxBatchUploadBytes');
    });
  });

  describe('2. Admin 전용 - tier 변경', () => {
    it('PUT /admin/users/:id/quota는 requireRole(admin) 필수', () => {
      expect(storageRoutesCode).toContain(
        "router.put('/admin/users/:id/quota', authenticateJWT, requireRole('admin')"
      );
    });

    it('PUT /admin/tiers/:tierId는 requireRole(admin) 필수', () => {
      expect(storageRoutesCode).toContain(
        "router.put('/admin/tiers/:tierId', authenticateJWT, requireRole('admin')"
      );
    });

    it('GET /admin/tiers는 requireRole(admin) 필수', () => {
      expect(storageRoutesCode).toContain(
        "router.get('/admin/tiers', authenticateJWT, requireRole('admin')"
      );
    });

    it('GET /admin/users/:id/storage는 requireRole(admin) 필수', () => {
      expect(storageRoutesCode).toContain(
        "router.get('/admin/users/:id/storage', authenticateJWT, requireRole('admin')"
      );
    });

    it('GET /admin/storage/overview는 requireRole(admin) 필수', () => {
      expect(storageRoutesCode).toContain(
        "router.get('/admin/storage/overview', authenticateJWT, requireRole('admin')"
      );
    });
  });

  describe('3. 티어 정의 - Single Source of Truth', () => {
    it('DEFAULT_TIER가 free_trial로 정의되어야 함', () => {
      expect(storageQuotaServiceCode).toContain("const DEFAULT_TIER = 'free_trial'");
    });

    it('DEFAULT_TIER가 export 되어야 함', () => {
      expect(storageQuotaServiceCode).toContain('DEFAULT_TIER,');
      expect(storageQuotaServiceCode).toMatch(/module\.exports\s*=\s*\{[^}]*DEFAULT_TIER/);
    });

    it('티어별 max_batch_upload_bytes가 정의되어야 함', () => {
      expect(storageQuotaServiceCode).toContain('max_batch_upload_bytes: 100 * MB');  // free_trial
      expect(storageQuotaServiceCode).toContain('max_batch_upload_bytes: 500 * MB');  // standard
      expect(storageQuotaServiceCode).toContain('max_batch_upload_bytes: 1 * GB');    // premium
      expect(storageQuotaServiceCode).toContain('max_batch_upload_bytes: 2 * GB');    // vip
      expect(storageQuotaServiceCode).toContain('max_batch_upload_bytes: -1');        // admin (무제한)
    });

    it('admin 티어는 무제한(-1)이어야 함', () => {
      expect(storageQuotaServiceCode).toContain(
        "admin: { name: '관리자', quota_bytes: -1, ocr_quota: -1, ocr_page_quota: -1, max_batch_upload_bytes: -1"
      );
    });
  });

  describe('4. 새 사용자 생성 시 기본 티어 할당', () => {
    const passportCode = fs.readFileSync(
      path.join(__dirname, '../config/passport.js'),
      'utf-8'
    );

    it('passport.js에서 DEFAULT_TIER를 import해야 함', () => {
      expect(passportCode).toContain(
        "const { DEFAULT_TIER } = require('../lib/storageQuotaService')"
      );
    });

    it('카카오 신규 사용자에게 기본 티어 할당', () => {
      expect(passportCode).toContain("storage: { tier: DEFAULT_TIER, updated_at: new Date() }");
    });

    it('네이버 신규 사용자에게 기본 티어 할당', () => {
      // 네이버도 동일한 패턴 사용
      const naverMatch = passportCode.match(/authProvider: 'naver'[\s\S]*?storage: \{ tier: DEFAULT_TIER/);
      expect(naverMatch).not.toBeNull();
    });

    it('구글 신규 사용자에게 기본 티어 할당', () => {
      // 구글도 동일한 패턴 사용
      const googleMatch = passportCode.match(/authProvider: 'google'[\s\S]*?storage: \{ tier: DEFAULT_TIER/);
      expect(googleMatch).not.toBeNull();
    });
  });

  describe('5. 티어별 제한 적용', () => {
    it('getUserStorageInfo가 티어 정의에서 제한값을 가져와야 함', () => {
      // tierDef에서 값을 읽어오는지 확인
      expect(storageQuotaServiceCode).toContain('tierDef.quota_bytes');
      expect(storageQuotaServiceCode).toContain('tierDef.ocr_quota');
      expect(storageQuotaServiceCode).toContain('tierDef.max_batch_upload_bytes');
    });

    it('admin 사용자는 무제한(-1) 처리되어야 함', () => {
      expect(storageQuotaServiceCode).toContain('isAdmin ? -1 :');
    });

    it('관리자 판별 로직이 있어야 함', () => {
      expect(storageQuotaServiceCode).toContain("const isAdmin = user?.role === 'admin'");
    });
  });

  describe('6. 보안 검증', () => {
    it('일반 사용자 API에 tier 수정 기능이 없어야 함', () => {
      // /users/me 경로에는 PUT quota나 tier 변경이 없어야 함
      const userMeAPIs = storageRoutesCode.match(/router\.(put|post|patch)\('\/users\/me[^']*'/g) || [];

      for (const api of userMeAPIs) {
        expect(api).not.toContain('quota');
        expect(api).not.toContain('tier');
      }
    });

    it('admin 티어 할당량은 변경 불가해야 함', () => {
      expect(storageRoutesCode).toContain(
        "if (tierId === 'admin' && quota_bytes !== undefined && quota_bytes !== -1)"
      );
      expect(storageRoutesCode).toContain(
        "관리자 티어의 할당량은 변경할 수 없습니다"
      );
    });

    it('티어 변경 시 updateUserTier 함수 사용', () => {
      expect(storageRoutesCode).toContain('await updateUserTier(db, id, tier)');
    });
  });
});

describe('사용자 활동 API 티어 일관성', () => {
  const userActivityRoutesCode = fs.readFileSync(
    path.join(__dirname, '../routes/user-activity-routes.js'),
    'utf-8'
  );

  it('user-activity-routes.js에서 DEFAULT_TIER를 import해야 함', () => {
    expect(userActivityRoutesCode).toContain(
      "const { DEFAULT_TIER } = require('../lib/storageQuotaService')"
    );
  });

  it('사용자 tier가 없을 때 DEFAULT_TIER를 사용해야 함', () => {
    expect(userActivityRoutesCode).toContain('user.storage?.tier || DEFAULT_TIER');
  });
});
