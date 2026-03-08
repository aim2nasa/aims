/**
 * AIMS 문서 분류 카테고리 매핑
 * TAXONOMY_V4_MIGRATION.md 기준 (7대분류, 25소분류)
 */

export interface DocumentCategory {
  value: string
  label: string
  icon: string
  color: string
}

/** 7개 대분류 카테고리 정의 (표시 순서) */
export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  { value: 'insurance', label: '보험계약', icon: 'shield', color: '#2563eb' },
  { value: 'claim', label: '보험금청구', icon: 'cross.case', color: '#dc2626' },
  { value: 'identity', label: '신분/증명', icon: 'person.text.rectangle', color: '#7c3aed' },
  { value: 'medical', label: '건강/의료', icon: 'heart.text.square', color: '#e11d48' },
  { value: 'asset', label: '자산', icon: 'building.2', color: '#d97706' },
  { value: 'corporate', label: '법인', icon: 'building.columns', color: '#0891b2' },
  { value: 'etc', label: '기타', icon: 'doc', color: '#6b7280' },
]

/** document_type → 소분류 한글 레이블 (v4 기준) */
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  // 1. 보험계약 (insurance)
  policy: '보험증권',
  coverage_analysis: '보장분석',
  application: '청약서',
  plan_design: '가입설계서',
  annual_report: '연간보고서(AR)',
  customer_review: '변액리포트(CRS)',
  insurance_etc: '기타 보험관련',

  // 2. 보험금 청구 (claim)
  diagnosis: '진단서/소견서',
  medical_receipt: '진료비영수증',
  claim_form: '보험금청구서',
  consent_delegation: '위임장/동의서',

  // 3. 신분/증명 (identity)
  id_card: '신분증',
  family_cert: '가족관계서류',
  personal_docs: '기타 통장 및 개인서류',

  // 4. 건강/의료 (medical)
  health_checkup: '건강검진결과',

  // 5. 자산 (asset)
  asset_document: '자산관련서류',
  inheritance_gift: '상속/증여',

  // 6. 법인 (corporate)
  corp_basic: '기본서류',
  hr_document: '인사/노무',
  corp_tax: '세무',
  corp_asset: '법인자산',
  legal_document: '기타 법률서류',

  // 7. 기타 (etc)
  general: '일반문서',
  unclassifiable: '분류불가',
  unspecified: '미지정',
}

/** document_type → category 매핑 */
const TYPE_TO_CATEGORY: Record<string, string> = {
  // 1. 보험계약 (insurance)
  policy: 'insurance',
  coverage_analysis: 'insurance',
  application: 'insurance',
  plan_design: 'insurance',
  annual_report: 'insurance',
  customer_review: 'insurance',
  insurance_etc: 'insurance',

  // 2. 보험금 청구 (claim)
  diagnosis: 'claim',
  medical_receipt: 'claim',
  claim_form: 'claim',
  consent_delegation: 'claim',

  // 3. 신분/증명 (identity)
  id_card: 'identity',
  family_cert: 'identity',
  personal_docs: 'identity',

  // 4. 건강/의료 (medical)
  health_checkup: 'medical',

  // 5. 자산 (asset)
  asset_document: 'asset',
  inheritance_gift: 'asset',

  // 6. 법인 (corporate)
  corp_basic: 'corporate',
  hr_document: 'corporate',
  corp_tax: 'corporate',
  corp_asset: 'corporate',
  legal_document: 'corporate',

  // 7. 기타 (etc)
  general: 'etc',
  unclassifiable: 'etc',
  unspecified: 'etc',

  // === 레거시 매핑 (DB 마이그레이션 전 방어) ===
  proposal: 'insurance',          // → plan_design
  terms: 'insurance',             // → insurance_etc
  change_request: 'insurance',    // → insurance_etc
  surrender: 'insurance',         // → insurance_etc
  hospital_cert: 'claim',         // → diagnosis
  medical_record: 'claim',        // → diagnosis (현행: medical)
  accident_cert: 'claim',         // → claim_form
  consent_form: 'claim',          // → consent_delegation (현행: identity)
  power_of_attorney: 'claim',     // → consent_delegation (현행: identity)
  bank_account: 'identity',       // → personal_docs
  seal_signature: 'identity',     // → personal_docs
  business_card: 'identity',      // → personal_docs
  income_proof: 'asset',          // → asset_document (현행: financial)
  employment_cert: 'asset',       // → asset_document (현행: financial)
  financial_statement: 'asset',   // → asset_document (현행: financial)
  tax_document: 'corporate',      // → corp_tax (현행: financial)
  transaction_proof: 'asset',     // → asset_document (현행: financial)
  property_registry: 'asset',     // → asset_document
  vehicle_registry: 'asset',      // → asset_document
  business_registry: 'asset',     // → asset_document
  corp_registry: 'corporate',     // → corp_basic
  shareholder: 'corporate',       // → corp_basic
  meeting_minutes: 'corporate',   // → corp_basic
  pension: 'corporate',           // → hr_document
  business_plan: 'corporate',     // → legal_document
  contract: 'corporate',          // → legal_document (현행: legal)
  memo: 'etc',                    // → general
  claim: 'claim',                 // 기존 레거시
}

/**
 * document_type 값으로 카테고리 value를 반환
 * 매핑이 없으면 'etc' 반환
 */
export function getCategoryForType(documentType: string | undefined | null): string {
  if (!documentType) return 'etc'
  return TYPE_TO_CATEGORY[documentType] ?? 'etc'
}

/**
 * document_type 값으로 한글 소분류 레이블을 반환
 */
export function getDocumentTypeLabel(documentType: string | undefined | null): string {
  if (!documentType) return '미지정'
  return DOCUMENT_TYPE_LABELS[documentType] ?? '기타'
}

/**
 * 카테고리 value로 카테고리 정보를 반환
 */
export function getCategoryInfo(categoryValue: string): DocumentCategory | undefined {
  return DOCUMENT_CATEGORIES.find(c => c.value === categoryValue)
}

/** 대분류별 소분류 그룹 목록 (시스템 유형 annual_report, customer_review 제외) */
export interface DocumentTypeGroup {
  category: DocumentCategory
  types: Array<{ value: string; label: string }>
}

const SYSTEM_TYPES = new Set(['annual_report', 'customer_review'])

export function getGroupedDocumentTypes(): DocumentTypeGroup[] {
  return DOCUMENT_CATEGORIES.map(cat => ({
    category: cat,
    types: Object.entries(TYPE_TO_CATEGORY)
      .filter(([typeValue, catValue]) =>
        catValue === cat.value &&
        !SYSTEM_TYPES.has(typeValue) &&
        typeValue in DOCUMENT_TYPE_LABELS
      )
      .map(([typeValue]) => ({ value: typeValue, label: DOCUMENT_TYPE_LABELS[typeValue] ?? typeValue }))
  })).filter(group => group.types.length > 0)
}
