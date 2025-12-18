/**
 * 도움말 콘텐츠 초기 데이터 마이그레이션
 * @since 2025-12-18
 *
 * 실행 방법:
 * cd /home/rossi/aims/backend/api/aims_api
 * node migrations/seed-help-content.js
 */

const { MongoClient } = require('mongodb');

const MONGO_URI = 'mongodb://tars:27017/';
const DB_NAME = 'docupload';

// ========================================
// 공지사항 데이터
// ========================================
const NOTICES_DATA = [
  {
    title: 'AIMS 시스템 정기 점검 안내',
    content: `안녕하세요. AIMS 운영팀입니다.

시스템 안정성 향상을 위한 정기 점검이 예정되어 있습니다.

■ 점검 일시: 2025년 12월 20일 (토) 02:00 ~ 06:00
■ 점검 내용: 서버 최적화 및 보안 패치 적용
■ 영향 범위: 전체 서비스 일시 중단

점검 시간 동안 서비스 이용이 불가능하오니 양해 부탁드립니다.

감사합니다.`,
    category: 'system',
    isNew: true,
    isPublished: true,
    createdAt: new Date('2025-12-18T10:00:00'),
    updatedAt: new Date('2025-12-18T10:00:00'),
    createdBy: 'system'
  },
  {
    title: '신규 보험 상품 출시 안내',
    content: `새로운 보험 상품이 출시되었습니다.

■ 상품명: 프리미엄 건강보험 플러스
■ 주요 특징:
  - 무해지환급형 선택 가능
  - 3대 질병 진단비 강화
  - 실손의료비 보장 확대

자세한 내용은 상품 설명서를 참고해 주세요.`,
    category: 'product',
    isNew: false,
    isPublished: true,
    createdAt: new Date('2025-12-15T09:00:00'),
    updatedAt: new Date('2025-12-15T09:00:00'),
    createdBy: 'system'
  },
  {
    title: '개인정보 처리방침 변경 안내',
    content: `개인정보 처리방침이 변경되었습니다.

■ 시행일: 2025년 1월 1일
■ 주요 변경사항:
  - 개인정보 보유기간 조정
  - 제3자 제공 항목 명확화
  - 개인정보 보호책임자 연락처 변경

변경된 내용은 홈페이지에서 확인하실 수 있습니다.`,
    category: 'policy',
    isNew: false,
    isPublished: true,
    createdAt: new Date('2025-12-10T14:00:00'),
    updatedAt: new Date('2025-12-10T14:00:00'),
    createdBy: 'system'
  }
];

// ========================================
// 사용 가이드 데이터
// ========================================
const USAGE_GUIDES_DATA = [
  {
    categoryId: 'customer',
    categoryTitle: '고객 관리',
    categoryIcon: 'customer',
    colorClass: 'customer',
    order: 0,
    items: [
      {
        id: 'customer-register',
        title: '새 고객 등록하기',
        description: '새로운 고객 정보를 시스템에 등록하는 방법입니다.',
        steps: [
          '좌측 메뉴에서 "빠른 작업 > 새 고객 등록"을 클릭합니다.',
          '고객 유형(개인/법인)을 선택합니다.',
          '고객명(필수)과 연락처, 이메일, 주소 등을 입력합니다.',
          '"등록하기" 버튼을 클릭하여 저장합니다.',
          '💡 입력 중 페이지를 벗어나도 임시저장되어 다음에 이어서 작성할 수 있습니다.'
        ],
        order: 0
      },
      {
        id: 'customer-batch',
        title: '고객 일괄등록',
        description: '엑셀 파일로 여러 고객을 한 번에 등록합니다. 개인 고객만, 법인 고객만, 또는 둘 다 등록할 수 있습니다.',
        steps: [
          '"빠른 작업 > 고객·계약 일괄등록"을 선택합니다.',
          '엑셀 양식을 다운로드합니다 (개인고객/법인고객/계약 3개 시트 포함).',
          '등록할 고객 유형에 맞는 시트를 작성합니다:',
          '  • 개인 고객만: "개인고객" 시트만 작성',
          '  • 법인 고객만: "법인고객" 시트만 작성',
          '  • 개인+법인 모두: 두 시트 모두 작성',
          '작성된 엑셀 파일을 업로드합니다.',
          '"검증" 버튼을 클릭하여 데이터를 확인합니다.',
          '검증 완료 후 "일괄등록" 버튼을 클릭합니다.'
        ],
        order: 1
      },
      {
        id: 'customer-search',
        title: '고객 검색하기',
        description: '등록된 고객을 검색하는 방법입니다.',
        steps: [
          '"고객 > 전체 고객 보기"를 선택합니다.',
          '상단 검색창에 고객명, 전화번호, 또는 이메일을 입력합니다.',
          'Enter를 누르면 검색 결과가 표시됩니다.',
          '원하는 고객을 클릭하면 우측에 상세 정보가 표시됩니다.'
        ],
        order: 2
      },
      {
        id: 'customer-filter',
        title: '고객 필터링',
        description: '조건에 맞는 고객만 보는 방법입니다.',
        steps: [
          '"고객 > 전체 고객 보기"를 선택합니다.',
          '상단의 필터 옵션에서 조건을 선택합니다:',
          '  • 상태 필터: 전체 / 활성 / 휴면',
          '  • 정렬: 고객명, 등록일, 연락처 등',
          '  • 페이지당 표시 개수: 10 / 15 / 20 / 50 / 100개'
        ],
        order: 3
      },
      {
        id: 'customer-detail',
        title: '고객 상세보기',
        description: '고객의 상세 정보를 확인하는 방법입니다.',
        steps: [
          '"고객 > 전체 고객 보기"에서 고객을 클릭합니다.',
          '우측 패널에 고객의 상세 정보가 표시됩니다.',
          '기본 정보, 연락처, 주소, 계약, 문서 등 탭을 클릭하여 확인합니다.',
          '💡 고객을 더블클릭하면 전체 화면으로 상세 정보를 볼 수 있습니다.'
        ],
        order: 4
      },
      {
        id: 'customer-edit',
        title: '고객 정보 수정',
        description: '등록된 고객 정보를 수정하는 방법입니다.',
        steps: [
          '고객을 선택하여 상세 정보를 엽니다.',
          '수정할 정보가 있는 탭으로 이동합니다.',
          '"수정" 버튼을 클릭하여 편집 모드로 전환합니다.',
          '정보를 수정한 후 "저장" 버튼을 클릭합니다.'
        ],
        order: 5
      },
      {
        id: 'customer-map',
        title: '지역별 고객보기',
        description: '고객의 주소를 기반으로 지역별로 분류하여 보여줍니다. 주소가 등록된 고객만 해당 지역에 표시됩니다.',
        steps: [
          '"고객 > 지역별 고객 보기"를 선택합니다.',
          '왼쪽 트리에서 시/도를 클릭하면 하위 시/군/구가 펼쳐집니다.',
          '지역을 선택하면 해당 지역의 고객 목록이 표시됩니다.',
          '폴더 옆 숫자는 해당 지역의 고객 수입니다.',
          '주소가 등록되지 않은 고객은 "기타" 폴더에 표시됩니다.',
          '고객 이름을 클릭하면 상세 정보를 볼 수 있습니다.'
        ],
        order: 6
      },
      {
        id: 'customer-relation',
        title: '관계별 고객보기',
        description: '가족 관계나 법인 소속을 기준으로 고객을 그룹화하여 보여줍니다.',
        steps: [
          '"고객 > 관계별 고객 보기"를 선택합니다.',
          '가족 폴더: 가족 대표(👑)를 중심으로 배우자, 자녀 등이 함께 표시됩니다.',
          '법인 폴더: 법인명 아래에 소속 직원/임원이 표시됩니다.',
          '고객 이름을 클릭하면 우측에 상세 정보가 표시됩니다.',
          '고객 이름을 더블클릭하면 전체 고객 보기로 이동합니다.',
          '"⚠️ 미설정" 폴더: 관계가 설정되지 않은 고객입니다.',
          '미설정 고객을 클릭하면 빠른 등록 패널에서 관계를 설정할 수 있습니다.'
        ],
        order: 7
      }
    ],
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  },
  {
    categoryId: 'document',
    categoryTitle: '문서 관리',
    categoryIcon: 'document',
    colorClass: 'document',
    order: 1,
    items: [
      {
        id: 'document-upload',
        title: '문서 등록하기',
        description: '고객에게 문서를 등록하는 방법입니다.',
        steps: [
          '"빠른 작업 > 새 문서 등록"을 클릭합니다.',
          '먼저 문서를 등록할 고객을 선택합니다.',
          '파일을 드래그 앤 드롭하거나 클릭하여 파일을 선택합니다.',
          '문서 유형을 선택하고 필요시 메모를 입력합니다.',
          '업로드가 완료되면 "처리 상태 보기"를 클릭하여 결과를 확인합니다.',
          '💡 PDF, 이미지(JPG, PNG), 문서 파일(DOC, DOCX) 등을 지원합니다.'
        ],
        order: 0
      },
      {
        id: 'document-batch',
        title: '문서 일괄등록',
        description: '여러 고객의 문서를 폴더 구조로 한 번에 등록합니다. 폴더명이 고객명과 자동 매칭됩니다.',
        steps: [
          '"빠른 작업 > 문서 일괄등록"을 선택합니다.',
          '폴더 구조 준비: 각 고객명으로 폴더를 만들고, 해당 폴더 안에 문서 파일을 넣습니다.',
          '준비된 폴더를 드래그 앤 드롭하거나 클릭하여 선택합니다.',
          '폴더명과 고객명이 자동으로 매칭됩니다.',
          '매칭되지 않은 폴더는 드롭다운에서 고객을 직접 선택합니다.',
          '문서 유형을 선택한 후 "업로드 시작" 버튼을 클릭합니다.',
          '업로드 완료 후 결과 요약을 확인합니다.'
        ],
        order: 1
      },
      {
        id: 'document-search',
        title: '문서 검색하기',
        description: '등록된 문서를 검색하는 방법입니다.',
        steps: [
          '"문서 > 상세 문서검색"을 선택합니다.',
          '검색어를 입력합니다.',
          '특정 고객의 문서만 검색하려면 "고객선택" 버튼을 클릭합니다.',
          '검색 모드를 선택합니다: 키워드 검색 또는 AI 검색(실험적)',
          '"검색" 버튼을 클릭합니다.',
          '검색 결과에서 문서를 클릭하면 미리보기를 볼 수 있습니다.'
        ],
        order: 2
      },
      {
        id: 'document-library',
        title: '전체 문서 보기',
        description: '등록된 모든 문서를 한눈에 확인합니다.',
        steps: [
          '"문서 > 전체 문서 보기"를 선택합니다.',
          '등록된 모든 문서가 목록으로 표시됩니다.',
          '문서를 클릭하면 미리보기가 표시됩니다.',
          '문서 유형, 등록일 등으로 정렬할 수 있습니다.'
        ],
        order: 3
      }
    ],
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  },
  {
    categoryId: 'contract',
    categoryTitle: '계약 관리',
    categoryIcon: 'contract',
    colorClass: 'contract',
    order: 2,
    items: [
      {
        id: 'contract-import',
        title: '고객·계약 일괄등록',
        description: '엑셀의 3개 시트(개인고객/법인고객/계약)를 사용하여 고객과 계약을 유연하게 등록합니다.',
        steps: [
          '"빠른 작업 > 고객·계약 일괄등록"을 선택합니다.',
          '엑셀 양식을 다운로드합니다 (개인고객/법인고객/계약 3개 시트 포함).',
          '필요한 시트만 작성합니다:',
          '  • 고객만 등록: 개인고객 또는 법인고객 시트만 작성',
          '  • 계약만 등록: 계약 시트만 작성 (기존 고객명과 매칭)',
          '  • 고객+계약 함께 등록: 해당 시트 모두 작성',
          '작성된 엑셀 파일을 드래그 앤 드롭하거나 클릭하여 업로드합니다.',
          '"검증" 버튼을 클릭합니다 (개인→법인→계약 순서로 검증).',
          '오류가 있으면 수정 후 다시 검증합니다.',
          '검증 완료 후 "일괄등록" 버튼을 클릭합니다.'
        ],
        order: 0
      },
      {
        id: 'contract-view',
        title: '계약 조회하기',
        description: '고객의 계약 정보를 조회하는 방법입니다.',
        steps: [
          '"고객 > 전체 고객 보기"에서 고객을 선택합니다.',
          '우측 패널에서 "계약" 탭을 클릭합니다.',
          '해당 고객의 계약 목록이 표시됩니다 (상품명, 계약일, 증권번호, 보험료, 납입상태 등).',
          '💡 또는 "계약 > 전체 계약 보기"에서 모든 계약을 한눈에 볼 수 있습니다.'
        ],
        order: 1
      },
      {
        id: 'contract-all',
        title: '전체 계약 보기',
        description: '등록된 모든 계약을 한눈에 확인합니다.',
        steps: [
          '"계약 > 전체 계약 보기"를 선택합니다.',
          '모든 고객의 계약이 목록으로 표시됩니다.',
          '고객명을 클릭하면 해당 고객의 상세 정보로 이동합니다.',
          '상품명, 계약일, 보험료, 납입상태 등으로 정렬할 수 있습니다.'
        ],
        order: 2
      }
    ],
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  }
];

// ========================================
// FAQ 데이터
// ========================================
const FAQS_DATA = [
  {
    question: 'AIMS는 어떤 서비스인가요?',
    answer: 'AIMS(Agent Intelligent Management System)는 보험 설계사를 위한 지능형 문서 관리 시스템입니다. 고객 관리, 문서 관리, 계약 관리를 한 곳에서 효율적으로 수행할 수 있습니다.',
    category: 'general',
    order: 0,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  },
  {
    question: '고객 정보는 어떻게 등록하나요?',
    answer: '좌측 메뉴의 "빠른 작업 > 새 고객 등록"을 클릭하여 고객 정보를 입력할 수 있습니다. 개인 고객과 법인 고객 모두 등록 가능하며, 필수 항목(이름, 연락처)을 입력한 후 저장하면 됩니다.',
    category: 'customer',
    order: 1,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  },
  {
    question: '같은 이름의 고객을 여러 명 등록할 수 있나요?',
    answer: '아니요. 같은 설계사 내에서 고객명은 중복될 수 없습니다. 개인/법인 구분이나 활성/휴면 상태와 관계없이 동일한 이름의 고객은 등록할 수 없습니다. 동명이인의 경우 이름 뒤에 구분자를 추가해 주세요 (예: 홍길동A, 홍길동B).',
    category: 'customer',
    order: 2,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  },
  {
    question: '문서를 어떻게 업로드하나요?',
    answer: '고객을 선택한 상태에서 "새 문서 등록"을 클릭하거나, 파일을 직접 드래그 앤 드롭하여 업로드할 수 있습니다. PDF, 이미지(JPG, PNG), 문서 파일(DOC, DOCX) 등 다양한 형식을 지원합니다.',
    category: 'document',
    order: 3,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  },
  {
    question: '여러 고객의 문서를 한 번에 등록할 수 있나요?',
    answer: '네, "빠른 작업 > 문서 일괄등록" 기능을 사용하면 됩니다. 고객명으로 폴더를 만들고 해당 폴더에 문서를 정리한 후, 상위 폴더를 선택하면 자동으로 각 고객에게 문서가 매칭됩니다.',
    category: 'document',
    order: 4,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  },
  {
    question: '문서 검색은 어떻게 하나요?',
    answer: '"문서 > 상세 문서검색" 메뉴에서 다양한 조건으로 문서를 검색할 수 있습니다. 문서 유형, 등록 기간, 고객명, 키워드 등으로 필터링이 가능합니다.',
    category: 'document',
    order: 5,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  },
  {
    question: '계약 정보는 어떻게 등록하나요?',
    answer: '"빠른 작업 > 고객·계약 일괄등록" 기능을 통해 엑셀 파일로 계약 정보를 일괄 등록할 수 있습니다. 양식에 맞게 작성된 엑셀 파일을 업로드하면 자동으로 고객과 계약이 등록됩니다.',
    category: 'contract',
    order: 6,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  },
  {
    question: '계약 상태는 어떤 것들이 있나요?',
    answer: '계약 상태는 "정상", "완납", "실효", "해지", "만기" 등이 있습니다. 각 상태에 따라 계약 목록에서 다른 색상으로 표시됩니다.',
    category: 'contract',
    order: 7,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  },
  {
    question: '비밀번호를 변경하고 싶습니다.',
    answer: '우측 상단의 프로필 메뉴에서 "계정 설정"을 클릭하면 비밀번호를 변경할 수 있습니다.',
    category: 'account',
    order: 8,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  },
  {
    question: '로그아웃은 어떻게 하나요?',
    answer: '우측 상단의 프로필 메뉴에서 "로그아웃"을 클릭하면 됩니다.',
    category: 'account',
    order: 9,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  }
];

// ========================================
// 마이그레이션 실행
// ========================================
async function migrate() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log('MongoDB 연결 성공');

    const db = client.db(DB_NAME);

    // 공지사항 마이그레이션
    const noticesCollection = db.collection('notices');
    const existingNotices = await noticesCollection.countDocuments();
    if (existingNotices === 0) {
      const result = await noticesCollection.insertMany(NOTICES_DATA);
      console.log(`공지사항 ${result.insertedCount}개 추가됨`);
    } else {
      console.log(`공지사항 컬렉션에 이미 ${existingNotices}개의 데이터가 있습니다. 스킵합니다.`);
    }

    // 사용 가이드 마이그레이션
    const usageGuidesCollection = db.collection('usage_guides');
    const existingGuides = await usageGuidesCollection.countDocuments();
    if (existingGuides === 0) {
      const result = await usageGuidesCollection.insertMany(USAGE_GUIDES_DATA);
      console.log(`사용 가이드 ${result.insertedCount}개 카테고리 추가됨`);
    } else {
      console.log(`사용 가이드 컬렉션에 이미 ${existingGuides}개의 데이터가 있습니다. 스킵합니다.`);
    }

    // FAQ 마이그레이션
    const faqsCollection = db.collection('faqs');
    const existingFaqs = await faqsCollection.countDocuments();
    if (existingFaqs === 0) {
      const result = await faqsCollection.insertMany(FAQS_DATA);
      console.log(`FAQ ${result.insertedCount}개 추가됨`);
    } else {
      console.log(`FAQ 컬렉션에 이미 ${existingFaqs}개의 데이터가 있습니다. 스킵합니다.`);
    }

    console.log('\n마이그레이션 완료!');

  } catch (error) {
    console.error('마이그레이션 오류:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('MongoDB 연결 종료');
  }
}

// 실행
migrate();
