/**
 * FAQ 업데이트 스크립트 (2026-02)
 *
 * AutoClicker, CRS, 모바일, AI 어시스턴트, 가족/법인계약, 파일명 토글 등
 * 최근 추가/변경된 기능에 대한 FAQ를 추가합니다.
 *
 * - 기존 데이터를 삭제하지 않음
 * - question 기준 중복 체크로 안전한 실행
 *
 * 실행 방법:
 * cd /home/rossi/aims/backend/api/aims_api && node scripts/seed-faqs-update-2026-02.js
 * 또는:
 * docker exec aims-api node scripts/seed-faqs-update-2026-02.js
 */

const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/';
const DB_NAME = 'docupload';

const newFaqs = [
  // ========================================
  // AutoClicker 카테고리
  // ========================================
  {
    question: 'AutoClicker란 무엇인가요?',
    answer: 'AutoClicker는 MetLife 고객의 CRS(변액리포트), Annual Report PDF 파일들을 자동으로 다운로드하는 PC 프로그램입니다. AIMS 웹에서 "AutoClicker 실행" 버튼을 클릭하면 바로 사용할 수 있습니다. 다운로드된 PDF는 AIMS에 자동으로 업로드되어 분석됩니다.',
    category: 'autoclicker',
    order: 100,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  },
  {
    question: 'AutoClicker 실행 버튼을 눌러도 반응이 없어요.',
    answer: '처음 사용하시는 경우 설치 프로그램이 자동으로 다운로드됩니다. 다운로드된 설치 파일(AIMS_AutoClicker_Setup_x.x.x.exe)을 실행하여 설치를 완료해 주세요. 설치 후 다시 "AutoClicker 실행" 버튼을 클릭하면 바로 실행됩니다. 팝업 차단이 설정되어 있다면 브라우저 설정에서 AIMS 사이트의 팝업을 허용해 주세요.',
    category: 'autoclicker',
    order: 101,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  },
  {
    question: 'AutoClicker는 어떤 환경에서 사용할 수 있나요?',
    answer: 'AutoClicker는 Windows PC에서만 사용 가능하며, 1920×1080 해상도를 권장합니다. Mac이나 모바일 기기에서는 사용할 수 없습니다. 실행 중 브라우저 팝업이 표시될 수 있으니, AIMS 사이트의 팝업을 허용해 주세요.',
    category: 'autoclicker',
    order: 102,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  },
  {
    question: 'AutoClicker는 자동으로 업데이트되나요?',
    answer: '네. 매 실행 시 최신 버전을 자동으로 확인하고, 업데이트가 있으면 자동으로 다운로드하여 설치합니다. 업데이트는 수 초 내에 완료되며, 업데이트 후에도 로그인 상태가 유지되어 별도 재로그인이 필요 없습니다.',
    category: 'autoclicker',
    order: 103,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  },

  // ========================================
  // CRS (변액리포트) 카테고리
  // ========================================
  {
    question: '변액리포트(CRS)란 무엇인가요?',
    answer: 'CRS(Customer Review Service)는 변액보험 계약자에게 발송되는 정기 리포트입니다. 계약사항(증권번호, 보험가입금액, 적립금, 투자수익률 등), 보험료 납입현황(기본보험료, 추가납입, 중도출금 등), 펀드 구성 현황(각 펀드별 적립금, 수익률 등) 등 변액보험의 상세 정보가 포함되어 있습니다.',
    category: 'crs',
    order: 110,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  },
  {
    question: 'CRS 문서를 업로드하면 어떻게 되나요?',
    answer: 'CRS 문서를 업로드하면 AI가 자동으로 문서를 분석하여 계약사항, 보험료 납입현황, 펀드 구성 등의 정보를 추출합니다. 분석이 완료되면 해당 고객의 "변액리포트" 탭에서 확인할 수 있습니다. 분석 진행 상태는 탭에서 실시간으로 확인 가능합니다.',
    category: 'crs',
    order: 111,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  },
  {
    question: 'CRS 파싱에 실패했어요. 어떻게 해야 하나요?',
    answer: '변액리포트 탭에서 "실패" 상태의 항목 옆 재시도 버튼을 클릭하면 다시 분석을 시도합니다. 최대 3회까지 자동 재시도되며, 재시도 횟수가 표시됩니다. 계속 실패하는 경우 PDF 파일이 손상되었거나 지원하지 않는 형식일 수 있습니다. 1:1 문의를 통해 문의해 주세요.',
    category: 'crs',
    order: 112,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  },
  {
    question: 'CRS와 AR(Annual Report)은 어떻게 다른가요?',
    answer: 'AR(Annual Report)은 피보험자의 전체 보험계약을 요약한 연례보고서로, 여러 보험사의 계약이 한 문서에 포함됩니다. CRS(Customer Review Service)는 변액보험에 특화된 상세 리포트로, 하나의 변액보험 계약에 대한 펀드별 적립금, 수익률, 보험료 납입현황 등 상세 정보를 제공합니다.',
    category: 'crs',
    order: 113,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  },

  // ========================================
  // 모바일 카테고리
  // ========================================
  {
    question: '모바일에서도 AIMS를 사용할 수 있나요?',
    answer: '네. 스마트폰, 태블릿 등 모바일 기기의 웹 브라우저에서 AIMS에 접속하면 모바일에 최적화된 화면으로 자동 전환됩니다. 고객 조회, 문서 확인, AI 어시스턴트 등 주요 기능을 모바일에서도 사용할 수 있습니다. 가로/세로 모드 모두 지원됩니다.',
    category: 'mobile',
    order: 120,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  },
  {
    question: '모바일에서 AI 어시스턴트를 사용하려면 어떻게 하나요?',
    answer: '하단의 AI 어시스턴트 버튼을 탭하면 전체 화면으로 AI 채팅이 열립니다. 키보드가 올라와도 입력창이 자동으로 조정됩니다. Android 기기에서는 뒤로가기 버튼으로 AI 어시스턴트를 닫을 수 있습니다.',
    category: 'mobile',
    order: 121,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  },

  // ========================================
  // AI 어시스턴트 카테고리
  // ========================================
  {
    question: 'AI 어시스턴트로 무엇을 할 수 있나요?',
    answer: 'AI 어시스턴트에게 자연어로 다양한 작업을 요청할 수 있습니다. 고객 등록/수정/삭제, 문서 관리, 계약 정보 조회, 고객 관련 질의응답 등이 가능합니다. 예를 들어 "홍길동 고객 등록해줘", "김영희의 계약 정보 알려줘", "지난달 등록된 문서 몇 개야?" 등을 질문할 수 있습니다. AI가 데이터를 변경하면 화면이 자동으로 새로고침됩니다.',
    category: 'ai-assistant',
    order: 130,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  },

  // ========================================
  // 기존 카테고리에 신규 항목 추가
  // ========================================
  {
    question: '파일명을 별칭과 원본으로 전환할 수 있나요?',
    answer: '네. 전체 문서 보기, 상세 문서 검색, 문서 탐색기에서 파일명 옆의 토글 버튼을 클릭하면 별칭(사용자가 지정한 이름)과 원본 파일명 사이를 전환할 수 있습니다. 검색 시에도 선택한 모드에 맞춰 해당 파일명 기준으로 검색됩니다.',
    category: 'document-view',
    order: 140,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  },
  {
    question: '가족계약 탭은 어디에 있나요?',
    answer: '고객 상세 화면에서 "가족계약" 탭을 클릭하면 해당 고객과 가족 구성원(배우자, 자녀 등) 전체의 보험계약을 통합 조회할 수 있습니다. 가족관계가 설정된 고객만 이 탭이 활성화됩니다. 관계별 고객 보기에서 가족 관계를 설정할 수 있습니다.',
    category: 'customer-view',
    order: 141,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  },
  {
    question: '법인계약 탭은 무엇인가요?',
    answer: '고객 상세 화면의 "법인계약" 탭에서는 계약자 또는 피보험자가 본인이나 가족이 아닌 법인 관련 계약을 자동으로 감지하여 보여줍니다. 법인 고객의 경우 해당 법인과 관련된 개인 계약도 함께 표시됩니다.',
    category: 'customer-view',
    order: 142,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  }
];

async function updateFaqs() {
  console.log('FAQ 업데이트 스크립트 시작 (2026-02)...');

  const client = await MongoClient.connect(MONGO_URI);
  const db = client.db(DB_NAME);
  const collection = db.collection('faqs');

  let insertedCount = 0;
  let skippedCount = 0;

  for (const faq of newFaqs) {
    // question 기준 중복 체크
    const existing = await collection.findOne({ question: faq.question });
    if (existing) {
      console.log(`  [스킵] "${faq.question}" — 이미 존재합니다`);
      skippedCount++;
    } else {
      await collection.insertOne(faq);
      console.log(`  [추가] [${faq.category}] "${faq.question}"`);
      insertedCount++;
    }
  }

  // 결과 요약
  console.log('\n========================================');
  console.log(`신규 FAQ 추가: ${insertedCount}개`);
  console.log(`스킵: ${skippedCount}개`);
  console.log('========================================');

  // 최종 상태 확인
  const totalFaqs = await collection.countDocuments({ isPublished: true });
  console.log(`\n최종 상태: 총 ${totalFaqs}개 FAQ`);

  await client.close();
  console.log('FAQ 업데이트 완료!');
}

updateFaqs().catch(console.error);
