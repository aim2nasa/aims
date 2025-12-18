/**
 * FAQ 일괄 삽입 스크립트 - 계약 관리 (contract 카테고리)
 * P(민수) 제작 → V(정은) 검증 완료
 */

const now = new Date();

const faqs = [
  // === 계약 관리 FAQ (10개) ===
  {
    question: "계약 정보는 어디서 확인하나요?",
    answer: "왼쪽 메뉴의 '전체 계약'에서 모든 계약을 확인할 수 있습니다.\n\n또는 고객 상세 화면의 '계약' 탭에서 해당 고객의 계약만 볼 수도 있습니다.\n\n계약 목록에서는 증권번호, 상품명, 계약일, 계약상태 등을 확인할 수 있습니다.",
    category: "contract",
    order: 1,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "새 계약을 어떻게 등록하나요?",
    answer: "두 가지 방법이 있습니다:\n\n[개별 등록]\n• 전체 계약 → '+' 버튼 또는 '계약 등록'\n• 필수 정보 입력 (고객, 증권번호, 상품명, 계약일)\n• '저장' 클릭\n\n[일괄등록]\n• 고객·계약 일괄등록 메뉴 사용\n• 엑셀 파일로 여러 계약 한 번에 등록",
    category: "contract",
    order: 2,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "증권번호는 중복되어도 되나요?",
    answer: "아니요, 증권번호는 중복될 수 없습니다.\n\n증권번호는 각 계약의 고유 식별자이므로:\n• 같은 증권번호로 다른 계약 등록 불가\n• 이미 존재하는 증권번호 입력 시 오류 발생\n\n정확한 증권번호를 확인 후 입력해 주세요.",
    category: "contract",
    order: 3,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "계약 상태의 종류는 무엇인가요?",
    answer: "계약은 다음 상태를 가질 수 있습니다:\n\n• 유지: 정상 유지 중인 계약\n• 완납: 보험료 완납된 계약\n• 실효: 보험료 미납으로 효력 상실\n• 해지: 계약 해지된 상태\n• 만기: 보험 기간이 종료된 계약\n\n상태는 계약 수정에서 변경할 수 있습니다.",
    category: "contract",
    order: 4,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "보험상품 정보는 어떻게 연결되나요?",
    answer: "계약 등록 시 상품명을 입력하면 데이터베이스에서 자동 매칭됩니다:\n\n• 녹색: 정확히 일치하는 상품 찾음\n• 노란색: 유사한 상품 있음 (확인 필요)\n• 빨간색: 매칭되는 상품 없음\n\n상품명은 보험사에서 공식적으로 사용하는 이름을 입력해야 정확히 매칭됩니다.",
    category: "contract",
    order: 5,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "계약에 피보험자와 수익자를 추가할 수 있나요?",
    answer: "네, 계약 상세 정보에서 추가할 수 있습니다:\n\n• 피보험자: 보험의 대상이 되는 사람\n• 수익자: 보험금을 받는 사람\n\n계약 등록/수정 시 해당 필드에 입력하면 됩니다. 필수 항목은 아니므로 비워둬도 됩니다.",
    category: "contract",
    order: 6,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "계약을 삭제하면 어떻게 되나요?",
    answer: "계약 삭제 시:\n• 해당 계약 정보만 삭제됩니다\n• 연결된 고객은 삭제되지 않습니다\n• 고객의 다른 계약에는 영향 없습니다\n\n단, 고객을 삭제하면 해당 고객의 모든 계약이 함께 삭제됩니다.\n\n삭제된 계약은 복구할 수 없으니 주의하세요.",
    category: "contract",
    order: 7,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "계약 목록을 필터링하려면 어떻게 하나요?",
    answer: "상단의 필터 옵션을 사용합니다:\n\n• 검색: 증권번호, 상품명, 고객명으로 검색\n• 상태 필터: 유지/완납/실효/해지/만기\n• 정렬: 계약일, 등록일 기준\n\n필터를 조합하여 원하는 계약만 표시할 수 있습니다.",
    category: "contract",
    order: 8,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "계약 정보를 수정하려면 어떻게 하나요?",
    answer: "계약 상세 화면에서 수정합니다:\n\n1. 전체 계약에서 해당 계약 클릭\n2. 상세 정보 표시\n3. '수정' 버튼 클릭\n4. 정보 수정\n5. '저장' 클릭\n\n증권번호는 고유 식별자이므로 신중하게 변경하세요.",
    category: "contract",
    order: 9,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  },
  {
    question: "한 고객에 여러 계약을 등록할 수 있나요?",
    answer: "네, 한 고객에 여러 계약을 등록할 수 있습니다.\n\n• 고객과 계약은 1:N 관계\n• 한 고객이 여러 보험 계약 보유 가능\n• 고객 상세 → 계약 탭에서 모든 계약 확인\n\n각 계약은 고유한 증권번호를 가져야 합니다.",
    category: "contract",
    order: 10,
    isPublished: true,
    createdAt: now,
    updatedAt: now
  }
];

// MongoDB 연결 및 삽입
db = db.getSiblingDB('docupload');

// 기존 contract FAQ 삭제 (재실행 대비)
const deleteResult = db.faqs.deleteMany({ category: 'contract' });
print('기존 contract FAQ 삭제: ' + deleteResult.deletedCount + '건');

// 새 FAQ 삽입
const insertResult = db.faqs.insertMany(faqs);
print('새 contract FAQ 삽입: ' + insertResult.insertedIds.length + '건');

// 결과 확인
const count = db.faqs.countDocuments({ category: 'contract' });
print('현재 contract FAQ 총 개수: ' + count);
