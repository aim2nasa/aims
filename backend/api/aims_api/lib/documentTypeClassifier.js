/**
 * 문서 유형 자동 분류 서비스
 * meta.tags와 meta.summary를 기반으로 문서 유형을 자동 분류
 *
 * @since 2025-12-29
 */

// 문서 유형별 매칭 키워드 (우선순위 순)
const TYPE_KEYWORDS = {
  // 계약 체결 관련
  application: {
    primary: ['청약서', '청약', '보험가입신청', '가입신청서'],
    secondary: ['청약일', '신청서'],
    weight: 1.0
  },
  policy: {
    primary: ['보험증권', '증권번호', '보험가입증명'],
    secondary: ['증권', '보험계약', '계약일', '보험기간', '만기일'],
    weight: 0.9
  },
  terms: {
    primary: ['약관', '상품설명서'],
    secondary: ['보장내용', '면책사항', '특약', '보험료납입'],
    weight: 0.8
  },
  proposal: {
    primary: ['제안서', '설계서', '견적서'],
    secondary: ['보험료 비교', '가입설계', '보장분석'],
    weight: 0.9
  },

  // 보험금 청구 관련
  claim_form: {
    primary: ['보험금청구', '청구서', '지급청구'],
    secondary: ['보험금 청구', '청구금액'],
    weight: 1.0
  },
  diagnosis: {
    primary: ['진단서', '소견서', '진료확인서'],
    secondary: ['진단명', '진단코드', '질병분류', '입원확인', '퇴원확인', '입원', '퇴원', '통원확인'],
    weight: 1.0
  },
  medical_receipt: {
    primary: ['진료비', '영수증', '세부내역서'],
    secondary: ['처방전', '약제비', '본인부담금', '비급여', '급여'],
    weight: 1.0
  },
  accident_cert: {
    primary: ['사고증명', '교통사고사실확인', '상해진단'],
    secondary: ['교통사고', '사고일', '사고경위'],
    weight: 1.0
  },

  // 신분/증빙 관련
  id_card: {
    primary: ['주민등록증', '신분증', '운전면허증', '여권'],
    secondary: ['신분확인', '본인확인'],
    weight: 1.0
  },
  family_cert: {
    primary: ['주민등록등본', '가족관계증명서', '기본증명서'],
    secondary: ['등본', '초본', '가족관계'],
    weight: 1.0
  },
  seal_signature: {
    primary: ['인감증명서', '본인서명사실확인서'],
    secondary: ['인감', '서명확인', '날인'],
    weight: 1.0
  },
  bank_account: {
    primary: ['통장사본', '계좌개설확인서'],
    secondary: ['통장', '계좌번호', '예금주'],
    weight: 1.0
  },
  income_employment: {
    primary: ['원천징수영수증', '재직증명서', '사업자등록증'],
    secondary: ['소득금액증명', '소득증빙', '재직', '급여명세'],
    weight: 1.0
  }
  // ⚠️ annual_report, customer_review는 자동분류 대상에서 제외
  // AR/CRS 문서는 각각의 파싱 과정에서만 시스템이 자동으로 분류함
};

/**
 * 레거시 document_type → 현행 document_type 매핑
 * TYPE_KEYWORDS에 레거시 키가 남아있어도 현행 값으로 변환하여 반환한다.
 * 프론트엔드 documentCategories.ts의 LEGACY_TYPE_MAP과 동기화 유지.
 */
const LEGACY_TYPE_MAP = {
  'claim': 'claim_form',
};

/**
 * 문서 유형 자동 분류
 * @param {string[]} tags - meta.tags 배열
 * @param {string} summary - meta.summary 문자열
 * @param {string} filename - 파일명 (선택)
 * @returns {{ type: string, confidence: number, matchedKeywords: string[] }}
 */
function classifyDocument(tags = [], summary = '', filename = '') {
  // 모든 텍스트를 하나로 합침
  const allText = [
    ...(tags || []),
    summary || '',
    filename || ''
  ].join(' ').toLowerCase();

  const scores = {};
  const matchedKeywordsMap = {};

  for (const [type, config] of Object.entries(TYPE_KEYWORDS)) {
    let score = 0;
    const matched = [];

    // Primary 키워드 매칭 (높은 가중치)
    for (const kw of config.primary) {
      if (allText.includes(kw.toLowerCase())) {
        score += 3 * config.weight;
        matched.push(kw);
      }
    }

    // Secondary 키워드 매칭 (낮은 가중치)
    for (const kw of config.secondary) {
      if (allText.includes(kw.toLowerCase())) {
        score += 1 * config.weight;
        matched.push(kw);
      }
    }

    scores[type] = score;
    matchedKeywordsMap[type] = matched;
  }

  // 최고 점수 유형 찾기
  const sortedTypes = Object.entries(scores)
    .sort((a, b) => b[1] - a[1]);

  const [bestType, bestScore] = sortedTypes[0];
  const [secondType, secondScore] = sortedTypes[1] || [null, 0];

  // 신뢰도 계산
  // - 최고 점수가 3 이상이면 primary 매칭이 있음
  // - 2등과의 차이가 클수록 신뢰도 높음
  let confidence = 0;
  if (bestScore >= 3) {
    confidence = Math.min(0.95, 0.6 + (bestScore - secondScore) * 0.1);
  } else if (bestScore >= 1) {
    confidence = Math.min(0.5, 0.3 + bestScore * 0.1);
  }

  // 최소 임계값
  const MIN_SCORE_THRESHOLD = 1;

  if (bestScore < MIN_SCORE_THRESHOLD) {
    return {
      type: null,
      suggestedType: bestScore > 0 ? bestType : null,
      confidence: 0,
      matchedKeywords: [],
      autoApplied: false
    };
  }

  // 신뢰도 70% 이상이면 자동 적용
  const autoApplied = confidence >= 0.7;

  // 레거시 타입 방어: TYPE_KEYWORDS에 레거시 키가 남아있어도 현행 값으로 변환
  const resolvedType = LEGACY_TYPE_MAP[bestType] || bestType;

  return {
    type: autoApplied ? resolvedType : null,
    suggestedType: resolvedType,
    confidence: Math.round(confidence * 100) / 100,
    matchedKeywords: matchedKeywordsMap[bestType],
    autoApplied
  };
}

/**
 * 여러 문서 일괄 분류
 * @param {Array} documents - 문서 배열 [{_id, meta: {tags, summary}, filename}]
 * @returns {Array} 분류 결과 배열
 */
function classifyDocuments(documents) {
  return documents.map(doc => {
    const tags = doc.meta?.tags || [];
    const summary = doc.meta?.summary || '';
    const filename = doc.upload?.originalName || doc.filename || '';

    const result = classifyDocument(tags, summary, filename);

    return {
      documentId: doc._id,
      ...result
    };
  });
}

module.exports = {
  classifyDocument,
  classifyDocuments,
  TYPE_KEYWORDS,
  LEGACY_TYPE_MAP
};
