/**
 * AIMS 문서 분류 카테고리 매핑
 * DOCUMENT_TAXONOMY.md v3.2 기준 (9대분류, 45소분류)
 */

export interface DocumentCategory {
  value: string
  label: string
  icon: string
}

/** 9개 대분류 카테고리 정의 (표시 순서) */
export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  { value: 'insurance', label: '보험계약', icon: 'shield' },
  { value: 'claim', label: '보험금청구', icon: 'cross.case' },
  { value: 'identity', label: '신분/증빙', icon: 'person.text.rectangle' },
  { value: 'financial', label: '재정/세무', icon: 'wonsign.circle' },
  { value: 'medical', label: '건강/의료', icon: 'heart.text.square' },
  { value: 'asset', label: '자산', icon: 'building.2' },
  { value: 'corporate', label: '법인', icon: 'building.columns' },
  { value: 'legal', label: '법률', icon: 'scale.3d' },
  { value: 'general', label: '기타', icon: 'doc' },
]

/** document_type → category 매핑 */
const TYPE_TO_CATEGORY: Record<string, string> = {
  // 1. 보험계약 (insurance)
  application: 'insurance',
  policy: 'insurance',
  terms: 'insurance',
  plan_design: 'insurance',
  proposal: 'insurance',
  coverage_analysis: 'insurance',
  change_request: 'insurance',
  surrender: 'insurance',
  annual_report: 'insurance',
  customer_review: 'insurance',

  // 2. 보험금청구 (claim)
  claim_form: 'claim',
  diagnosis: 'claim',
  medical_receipt: 'claim',
  accident_cert: 'claim',
  hospital_cert: 'claim',

  // 3. 신분/증빙 (identity)
  id_card: 'identity',
  family_cert: 'identity',
  seal_signature: 'identity',
  bank_account: 'identity',
  power_of_attorney: 'identity',
  consent_form: 'identity',
  business_card: 'identity',

  // 4. 재정/세무 (financial)
  income_proof: 'financial',
  employment_cert: 'financial',
  financial_statement: 'financial',
  tax_document: 'financial',
  transaction_proof: 'financial',

  // 5. 건강/의료 (medical)
  health_checkup: 'medical',
  medical_record: 'medical',

  // 6. 자산 (asset)
  property_registry: 'asset',
  vehicle_registry: 'asset',
  business_registry: 'asset',

  // 7. 법인 (corporate)
  corp_registry: 'corporate',
  shareholder: 'corporate',
  meeting_minutes: 'corporate',
  hr_document: 'corporate',
  pension: 'corporate',
  business_plan: 'corporate',
  inheritance_gift: 'corporate',

  // 8. 법률 (legal)
  contract: 'legal',
  legal_document: 'legal',

  // 9. 기타 (general)
  memo: 'general',
  general: 'general',
  unclassifiable: 'general',
  unspecified: 'general',

  // 기존 DB의 레거시 타입 매핑
  income_employment: 'financial',
  claim: 'claim',
}

/**
 * document_type 값으로 카테고리 value를 반환
 * 매핑이 없으면 'general' 반환
 */
export function getCategoryForType(documentType: string | undefined | null): string {
  if (!documentType) return 'general'
  return TYPE_TO_CATEGORY[documentType] ?? 'general'
}

/**
 * 카테고리 value로 카테고리 정보를 반환
 */
export function getCategoryInfo(categoryValue: string): DocumentCategory | undefined {
  return DOCUMENT_CATEGORIES.find(c => c.value === categoryValue)
}
