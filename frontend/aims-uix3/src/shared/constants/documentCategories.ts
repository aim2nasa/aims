/**
 * AIMS 문서 분류 카테고리 매핑
 * DOCUMENT_TAXONOMY.md v3.2 기준 (9대분류, 45소분류)
 */

export interface DocumentCategory {
  value: string
  label: string
  icon: string
  color: string
}

/** 9개 대분류 카테고리 정의 (표시 순서) */
export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  { value: 'insurance', label: '보험계약', icon: 'shield', color: '#2563eb' },
  { value: 'claim', label: '보험금청구', icon: 'cross.case', color: '#dc2626' },
  { value: 'identity', label: '신분/증빙', icon: 'person.text.rectangle', color: '#7c3aed' },
  { value: 'financial', label: '재정/세무', icon: 'wonsign.circle', color: '#059669' },
  { value: 'medical', label: '건강/의료', icon: 'heart.text.square', color: '#e11d48' },
  { value: 'asset', label: '자산', icon: 'building.2', color: '#d97706' },
  { value: 'corporate', label: '법인', icon: 'building.columns', color: '#0891b2' },
  { value: 'legal', label: '법률', icon: 'scale.3d', color: '#4f46e5' },
  { value: 'general', label: '기타', icon: 'doc', color: '#6b7280' },
]

/** document_type → 소분류 한글 레이블 (DOCUMENT_TAXONOMY.md 기준) */
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  // 1. 보험계약 (insurance)
  application: '청약서',
  policy: '보험증권',
  terms: '약관',
  plan_design: '설계서',
  proposal: '제안서',
  coverage_analysis: '보장분석',
  change_request: '계약변경',
  surrender: '해지서류',
  annual_report: '연간보고서(AR)',
  customer_review: '고객리뷰(CRS)',

  // 2. 보험금청구 (claim)
  claim_form: '보험금청구서',
  diagnosis: '진단서/소견서',
  medical_receipt: '진료비영수증',
  accident_cert: '사고증명서',
  hospital_cert: '입퇴원확인서',

  // 3. 신분/증빙 (identity)
  id_card: '신분증',
  family_cert: '가족관계서류',
  seal_signature: '인감/서명',
  bank_account: '통장사본',
  power_of_attorney: '위임장',
  consent_form: '동의서/서약서',
  business_card: '명함',

  // 4. 재정/세무 (financial)
  income_proof: '소득증빙',
  employment_cert: '재직증명',
  financial_statement: '재무제표',
  tax_document: '세무서류',
  transaction_proof: '거래증빙',

  // 5. 건강/의료 (medical)
  health_checkup: '건강검진결과',
  medical_record: '의무기록',

  // 6. 자산 (asset)
  property_registry: '등기부등본',
  vehicle_registry: '자동차등록',
  business_registry: '사업자등록',

  // 7. 법인 (corporate)
  corp_registry: '법인등기/정관',
  shareholder: '주주/지분',
  meeting_minutes: '의사록',
  hr_document: '인사/노무',
  pension: '퇴직연금',
  business_plan: '사업계획서',
  inheritance_gift: '상속/증여',

  // 8. 법률 (legal)
  contract: '계약서',
  legal_document: '법률서류',

  // 9. 기타 (general)
  memo: '메모/상담기록',
  general: '일반문서',
  unclassifiable: '분류불가',
  unspecified: '미지정',
}

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

  // 기존 DB의 레거시 타입 매핑 (DB 정리 후 유지 — 혹시 남은 데이터 방어)
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
