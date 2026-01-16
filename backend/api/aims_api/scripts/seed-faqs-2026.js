/**
 * FAQ 시드 스크립트
 * 빠른 작업 메뉴 개편에 맞춰 새로운 FAQ 콘텐츠 삽입
 * @since 2026-01-16
 *
 * 실행 방법:
 * cd /home/rossi/aims/backend/api/aims_api && node scripts/seed-faqs-2026.js
 */

const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/docupload';

const faqs = [
  // ========================================
  // 1. 일반 (general) - 2개
  // ========================================
  {
    question: '이 서비스는 무엇인가요?',
    answer: '보험 설계사를 위한 지능형 문서 관리 시스템입니다. 고객 정보, 보험 계약, 관련 문서를 체계적으로 관리하고, AI가 AR(연례보고서)을 자동으로 분석하여 계약 정보를 추출합니다.',
    category: 'general',
    order: 1,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    question: '처음 사용하는데, 어디서 시작하면 되나요?',
    answer: '왼쪽 메뉴의 "빠른 작업"에서 시작하세요. AR 문서가 있다면 "고객·계약·문서 등록"을, 없다면 "고객 수동등록"을 선택하여 첫 고객을 등록할 수 있습니다. 처음 사용하시면 "도움말 > 사용 가이드"의 "시작 가이드"를 실행해보세요.',
    category: 'general',
    order: 2,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },

  // ========================================
  // 2. 고객·계약·문서 등록 (doc-register) - 4개
  // ========================================
  {
    question: 'AR 문서를 업로드했는데 고객이 자동 생성되지 않아요.',
    answer: 'AR에서 추출한 피보험자 이름과 유사한 기존 고객이 있을 경우, 시스템이 고객 선택 팝업을 표시합니다. 기존 고객을 선택하거나 "새 고객으로 등록"을 선택하세요. 같은 이름의 고객이 없으면 자동으로 새 고객이 생성됩니다.',
    category: 'doc-register',
    order: 1,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    question: 'AR 파싱에 실패했어요. 어떻게 해야 하나요?',
    answer: 'AR 문서가 스캔본이거나 이미지 품질이 낮으면 파싱에 실패할 수 있습니다. 고객 상세 > Annual Report 탭에서 해당 AR을 우클릭하고 "재시도"를 선택하세요. 계속 실패하면 더 선명한 원본을 업로드해 주세요.',
    category: 'doc-register',
    order: 2,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    question: '증권/청약서를 특정 고객에게 연결하려면 어떻게 하나요?',
    answer: '"고객·계약·문서 등록" 화면 상단에서 먼저 고객을 선택한 후 파일을 업로드하세요. 또는 "전체 문서 보기"에서 문서를 우클릭하고 "고객 연결"을 선택하여 나중에 연결할 수도 있습니다.',
    category: 'doc-register',
    order: 3,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    question: 'AR에서 추출된 계약 정보가 보험계약 탭에 안 보여요.',
    answer: 'AR 파싱이 완료되면 계약 정보가 자동으로 보험계약 탭에 등록됩니다. 파싱 상태가 "완료"인지 확인하세요. 필요시 AR 행을 우클릭하고 "보험계약 등록"을 선택하여 수동으로 등록할 수 있습니다.',
    category: 'doc-register',
    order: 4,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },

  // ========================================
  // 3. 고객 등록 (customer-register) - 2개
  // ========================================
  {
    question: '같은 이름의 고객을 등록할 수 있나요?',
    answer: '같은 설계사 내에서 고객명은 중복될 수 없습니다. 동명이인이 있다면 "홍길동(일산)", "홍길동(분당)" 등으로 구분하여 등록하세요. 개인/법인 구분, 활성/휴면 상태와 무관하게 이름이 중복되면 등록이 거부됩니다.',
    category: 'customer-register',
    order: 1,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    question: '법인 고객의 대표전화와 개인 휴대폰 번호 형식이 다른가요?',
    answer: '개인 고객은 "휴대폰" 필드에 010-XXXX-XXXX 형식으로 입력합니다. 법인 고객은 "대표전화" 필드에 02-XXXX-XXXX 또는 031-XXX-XXXX 등 지역번호 포함 형식으로 입력합니다.',
    category: 'customer-register',
    order: 2,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },

  // ========================================
  // 4. 일괄 등록 (batch-upload) - 3개
  // ========================================
  {
    question: '엑셀 일괄등록에서 상품명이 빨간색으로 표시되어요.',
    answer: '빨간색은 시스템에 등록되지 않은 상품명을 의미합니다. 녹색은 정확히 일치, 노란색은 공백/대소문자 정규화 후 매칭된 경우입니다. 빨간색 상품은 관리자에게 상품 등록을 요청하거나, 정확한 상품명으로 수정 후 다시 업로드하세요.',
    category: 'batch-upload',
    order: 1,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    question: '엑셀에서 날짜가 이상하게 표시되어요.',
    answer: '시스템은 YYYY-MM-DD(예: 2024-03-15), M/D/YY(예: 3/15/24), M/D/YYYY(예: 3/15/2024) 형식을 자동 변환합니다. Excel에서 날짜 셀이 "숫자"로 표시되면 셀 서식을 "날짜"로 변경 후 저장하세요.',
    category: 'batch-upload',
    order: 2,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    question: '문서 일괄등록에서 폴더가 고객과 매핑되지 않아요.',
    answer: '폴더명이 시스템에 등록된 고객명과 정확히 일치해야 자동 매핑됩니다. 매핑되지 않은 폴더는 드롭다운에서 직접 고객을 선택하거나, 먼저 "고객 수동등록"에서 해당 고객을 등록하세요.',
    category: 'batch-upload',
    order: 3,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },

  // ========================================
  // 5. 고객 조회 (customer-view) - 2개
  // ========================================
  {
    question: '휴면 고객은 어디서 볼 수 있나요?',
    answer: '"전체 고객 보기"에서 상단 필터 버튼 중 "휴면"을 클릭하면 휴면 처리된 고객만 표시됩니다. 휴면 고객을 다시 활성화하려면 해당 고객을 우클릭하고 "활성화"를 선택하세요.',
    category: 'customer-view',
    order: 1,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    question: '고객 목록에서 초성 검색은 어떻게 하나요?',
    answer: '검색창 아래 초성 필터 바에서 원하는 초성(ㄱ, ㄴ, ㄷ...)을 클릭하세요. 해당 초성으로 시작하는 고객명만 필터링됩니다. "전체"를 클릭하면 필터가 해제됩니다. 영문/숫자 탭으로 전환하면 영문/숫자로 시작하는 고객을 필터링할 수 있습니다.',
    category: 'customer-view',
    order: 2,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },

  // ========================================
  // 6. 문서 조회 (document-view) - 2개
  // ========================================
  {
    question: '문서 탐색기와 전체 문서 보기의 차이점은 무엇인가요?',
    answer: '"전체 문서 보기"는 테이블 형식으로 모든 문서를 나열합니다. "문서 탐색기"는 윈도우 탐색기처럼 태그, 고객, 날짜별로 폴더 구조로 분류하여 탐색할 수 있습니다. 많은 문서를 체계적으로 찾을 때는 문서 탐색기가 편리합니다.',
    category: 'document-view',
    order: 1,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    question: '문서 탐색기에서 썸네일 미리보기를 켜고 끄려면?',
    answer: '문서 탐색기 상단 툴바에서 썸네일 아이콘을 클릭하여 켜고 끌 수 있습니다. 썸네일이 켜져 있으면 각 문서 옆에 작은 미리보기 이미지가 표시됩니다.',
    category: 'document-view',
    order: 2,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },

  // ========================================
  // 7. 용어 설명 (terminology) - 2개
  // ========================================
  {
    question: 'AR(Annual Report)이란 무엇인가요?',
    answer: 'AR은 보험사가 매년 피보험자에게 발송하는 연례보고서입니다. 가입된 모든 보험 계약의 증권번호, 상품명, 보험료, 계약상태 등 요약 정보가 포함되어 있습니다. AR을 업로드하면 AI가 자동으로 이 정보를 추출합니다.',
    category: 'terminology',
    order: 1,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    question: '활성 고객과 휴면 고객의 차이는 무엇인가요?',
    answer: '활성 고객은 현재 관리 중인 고객입니다. 휴면 고객은 연락이 뜸하거나 더 이상 관리하지 않는 고객으로, 기본 목록에서 숨겨집니다. 휴면 처리된 고객도 삭제되지 않고 "휴면" 필터에서 확인할 수 있으며, 언제든 다시 활성화할 수 있습니다.',
    category: 'terminology',
    order: 2,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

async function seedFAQs() {
  console.log('FAQ 시드 스크립트 시작...');

  const client = await MongoClient.connect(MONGO_URI);
  const db = client.db();
  const collection = db.collection('faqs');

  // 기존 데이터 백업 (선택사항)
  const existingCount = await collection.countDocuments();
  if (existingCount > 0) {
    console.log(`기존 ${existingCount}개의 FAQ 발견. 삭제 후 새 데이터 삽입...`);
  }

  // 기존 데이터 삭제
  await collection.deleteMany({});

  // 새 데이터 삽입
  const result = await collection.insertMany(faqs);
  console.log(`${result.insertedCount}개의 FAQ 삽입 완료`);

  // 카테고리별 통계 출력
  const categoryStats = faqs.reduce((acc, faq) => {
    acc[faq.category] = (acc[faq.category] || 0) + 1;
    return acc;
  }, {});
  console.log('카테고리별 FAQ 수:', categoryStats);

  await client.close();
  console.log('FAQ 시드 완료!');
}

seedFAQs().catch(console.error);
