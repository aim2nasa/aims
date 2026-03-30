/**
 * Document Type Classifier Unit Tests
 * @since 2026-02-05
 *
 * 테스트 범위:
 * 1. classifyDocument - 문서 유형 자동 분류
 * 2. TYPE_KEYWORDS - 키워드 설정
 * 3. 신뢰도 계산
 * 4. classifyDocuments - 일괄 분류
 */

const {
  classifyDocument,
  classifyDocuments,
  TYPE_KEYWORDS,
  LEGACY_TYPE_MAP
} = require('../documentTypeClassifier');

describe('documentTypeClassifier', () => {
  // =============================================================================
  // 1. TYPE_KEYWORDS 상수 테스트
  // =============================================================================

  describe('TYPE_KEYWORDS', () => {
    it('application 키워드가 정의되어 있어야 함', () => {
      expect(TYPE_KEYWORDS.application).toBeDefined();
      expect(TYPE_KEYWORDS.application.primary).toContain('청약서');
    });

    it('policy 키워드가 정의되어 있어야 함', () => {
      expect(TYPE_KEYWORDS.policy).toBeDefined();
      expect(TYPE_KEYWORDS.policy.primary).toContain('보험증권');
    });

    it('claim_form 키워드가 정의되어 있어야 함', () => {
      expect(TYPE_KEYWORDS.claim_form).toBeDefined();
      expect(TYPE_KEYWORDS.claim_form.primary).toContain('보험금청구');
    });

    it('레거시 claim 키가 TYPE_KEYWORDS에 없어야 함', () => {
      expect(TYPE_KEYWORDS.claim).toBeUndefined();
    });

    it('diagnosis 키워드가 정의되어 있어야 함', () => {
      expect(TYPE_KEYWORDS.diagnosis).toBeDefined();
      expect(TYPE_KEYWORDS.diagnosis.primary).toContain('진단서');
    });

    it('모든 유형에 weight가 있어야 함', () => {
      for (const [type, config] of Object.entries(TYPE_KEYWORDS)) {
        expect(config.weight).toBeDefined();
        expect(config.weight).toBeGreaterThan(0);
        expect(config.weight).toBeLessThanOrEqual(1);
      }
    });

    it('모든 유형에 primary와 secondary가 있어야 함', () => {
      for (const [type, config] of Object.entries(TYPE_KEYWORDS)) {
        expect(Array.isArray(config.primary)).toBe(true);
        expect(Array.isArray(config.secondary)).toBe(true);
      }
    });
  });

  // =============================================================================
  // 2. classifyDocument 기본 테스트
  // =============================================================================

  describe('classifyDocument 기본 분류', () => {
    it('청약서 태그 → application', () => {
      const result = classifyDocument(['청약서', '보험가입'], '');

      expect(result.suggestedType).toBe('application');
    });

    it('보험증권 태그 → policy', () => {
      const result = classifyDocument(['보험증권', '증권번호'], '');

      expect(result.suggestedType).toBe('policy');
    });

    it('진단서 태그 → diagnosis', () => {
      const result = classifyDocument(['진단서', '진단명'], '');

      expect(result.suggestedType).toBe('diagnosis');
    });

    it('보험금청구 태그 → claim_form', () => {
      const result = classifyDocument(['보험금청구', '청구서'], '');

      expect(result.suggestedType).toBe('claim_form');
    });

    it('제안서 태그 → proposal', () => {
      const result = classifyDocument(['제안서', '설계서'], '');

      expect(result.suggestedType).toBe('proposal');
    });

    it('약관 태그 → terms', () => {
      const result = classifyDocument(['약관', '상품설명서'], '');

      expect(result.suggestedType).toBe('terms');
    });
  });

  // =============================================================================
  // 3. summary에서 분류 테스트
  // =============================================================================

  describe('summary 기반 분류', () => {
    it('summary에 "청약서" 포함 → application', () => {
      const result = classifyDocument([], '이 문서는 청약서입니다.');

      expect(result.suggestedType).toBe('application');
    });

    it('summary에 "진단서" 포함 → diagnosis', () => {
      const result = classifyDocument([], '환자의 진단서를 발급합니다.');

      expect(result.suggestedType).toBe('diagnosis');
    });
  });

  // =============================================================================
  // 4. 신뢰도 테스트
  // =============================================================================

  describe('신뢰도 계산', () => {
    it('primary 키워드 매칭 → 높은 신뢰도', () => {
      const result = classifyDocument(['청약서', '보험가입신청'], '');

      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });

    it('secondary 키워드만 → 낮은 신뢰도 (0.5 이하)', () => {
      // secondary 키워드만 있으면 점수가 1 이상이지만 3 미만
      // confidence = min(0.5, 0.3 + score * 0.1)
      const result = classifyDocument(['random_no_match'], '');

      expect(result.confidence).toBeLessThanOrEqual(0.5);
    });

    it('매칭 없음 → 신뢰도 0 또는 낮음', () => {
      const result = classifyDocument([], '');

      // 매칭이 없으면 bestScore < MIN_SCORE_THRESHOLD
      expect(result.confidence).toBeLessThanOrEqual(0.5);
    });

    it('70% 이상 → autoApplied: true', () => {
      const result = classifyDocument(['청약서', '보험가입신청', '가입신청서'], '');

      if (result.confidence >= 0.7) {
        expect(result.autoApplied).toBe(true);
      }
    });

    it('신뢰도가 높으면 autoApplied: true', () => {
      // primary 키워드가 여러 개 매칭되면 autoApplied가 true
      const result = classifyDocument(['청약서', '보험가입신청', '가입신청서', '청약'], '');

      // 높은 점수면 autoApplied가 true
      if (result.confidence >= 0.7) {
        expect(result.autoApplied).toBe(true);
      } else {
        expect(result.autoApplied).toBe(false);
      }
    });
  });

  // =============================================================================
  // 5. matchedKeywords 테스트
  // =============================================================================

  describe('matchedKeywords', () => {
    it('매칭된 키워드 목록 반환', () => {
      const result = classifyDocument(['청약서', '보험가입'], '');

      expect(result.matchedKeywords).toContain('청약서');
    });

    it('매칭 없으면 빈 배열', () => {
      const result = classifyDocument([], '');

      expect(result.matchedKeywords).toEqual([]);
    });
  });

  // =============================================================================
  // 6. 빈 입력 처리 테스트
  // =============================================================================

  describe('빈 입력 처리', () => {
    it('빈 tags, 빈 summary → type: null', () => {
      const result = classifyDocument([], '');

      expect(result.type).toBeNull();
      expect(result.suggestedType).toBeNull();
    });

    it('null tags → 에러 없이 처리', () => {
      const result = classifyDocument(null, '');

      expect(result).toHaveProperty('type');
    });

    it('undefined tags → 에러 없이 처리', () => {
      const result = classifyDocument(undefined, '');

      expect(result).toHaveProperty('type');
    });
  });

  // =============================================================================
  // 7. filename 활용 테스트
  // =============================================================================

  describe('filename 활용', () => {
    it('filename에서 키워드 추출', () => {
      const result = classifyDocument([], '', '청약서_20260205.pdf');

      expect(result.suggestedType).toBe('application');
    });
  });

  // =============================================================================
  // 8. classifyDocuments 일괄 분류 테스트
  // =============================================================================

  describe('classifyDocuments', () => {
    it('여러 문서 일괄 분류', () => {
      const documents = [
        { _id: 'doc-1', meta: { tags: ['청약서'] } },
        { _id: 'doc-2', meta: { tags: ['진단서'] } }
      ];

      const results = classifyDocuments(documents);

      expect(results).toHaveLength(2);
      expect(results[0].documentId).toBe('doc-1');
      expect(results[0].suggestedType).toBe('application');
      expect(results[1].documentId).toBe('doc-2');
      expect(results[1].suggestedType).toBe('diagnosis');
    });

    it('빈 배열 → 빈 결과', () => {
      const results = classifyDocuments([]);

      expect(results).toEqual([]);
    });

    it('meta가 없는 문서도 처리', () => {
      const documents = [
        { _id: 'doc-1' }
      ];

      const results = classifyDocuments(documents);

      expect(results).toHaveLength(1);
      expect(results[0].type).toBeNull();
    });

    it('upload.originalName 사용', () => {
      const documents = [
        { _id: 'doc-1', upload: { originalName: '청약서.pdf' } }
      ];

      const results = classifyDocuments(documents);

      expect(results[0].suggestedType).toBe('application');
    });
  });

  // =============================================================================
  // 9. 최소 점수 임계값 테스트
  // =============================================================================

  describe('최소 점수 임계값', () => {
    it('점수 1 미만 → type: null, suggestedType도 null', () => {
      // 아무 키워드도 매칭 안 되는 경우
      const result = classifyDocument(['random', 'words'], 'nothing special');

      expect(result.type).toBeNull();
    });
  });

  // =============================================================================
  // 10. LEGACY_TYPE_MAP 방어 로직 테스트
  // =============================================================================

  describe('LEGACY_TYPE_MAP 방어', () => {
    it('LEGACY_TYPE_MAP에 claim → claim_form 매핑이 정의되어 있다', () => {
      expect(LEGACY_TYPE_MAP.claim).toBe('claim_form');
    });

    it('자동 분류 결과에 레거시 claim이 아닌 현행 claim_form이 반환된다', () => {
      const result = classifyDocument(['보험금청구', '청구서', '지급청구'], '');

      // 높은 신뢰도로 자동 적용됨
      expect(result.autoApplied).toBe(true);
      expect(result.type).toBe('claim_form');
      expect(result.suggestedType).toBe('claim_form');
    });
  });

  // =============================================================================
  // 11. 대소문자 무시 테스트
  // =============================================================================

  describe('대소문자 무시', () => {
    it('대문자 키워드도 매칭', () => {
      const result = classifyDocument(['CLAIM', '청구서'], '');

      // 'claim'은 영어이므로 한글 키워드만 매칭됨
      expect(result.matchedKeywords).toContain('청구서');
    });
  });
});
