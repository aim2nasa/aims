/**
 * 사용 가이드 시드 스크립트
 * 빠른 작업 메뉴 개편에 맞춰 새로운 가이드 콘텐츠 삽입
 * @since 2026-01-16
 *
 * 실행 방법:
 * cd /home/rossi/aims/backend/api/aims_api && node scripts/seed-usage-guides-2026.js
 */

const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/docupload';

const usageGuides = [
  // 1. 시작하기
  {
    categoryId: 'getting-started',
    categoryTitle: '시작하기',
    order: 1,
    isPublished: true,
    items: [
      {
        id: 'service-intro',
        title: '이 서비스는 무엇인가요?',
        description: '보험 설계사를 위한 지능형 문서 관리 시스템입니다.',
        steps: [
          '고객 정보와 보험 계약을 체계적으로 관리합니다',
          'AR(Annual Report) 문서를 AI가 자동으로 분석하여 계약 정보를 추출합니다',
          '증권, 청약서 등 보험 문서를 고객별로 분류하여 저장합니다',
          '언제 어디서든 고객 정보와 문서에 빠르게 접근할 수 있습니다'
        ],
        order: 1
      },
      {
        id: 'first-customer',
        title: '첫 번째 고객 등록하기',
        description: '처음 사용하신다면 이 가이드를 따라 첫 고객을 등록해보세요.',
        steps: [
          '왼쪽 메뉴에서 "빠른 작업"을 클릭합니다',
          'AR(Annual Report)이 있다면 "고객·계약·문서 등록"을 선택합니다',
          'AR이 없다면 "고객 수동등록"을 선택합니다',
          '고객 정보를 입력하고 저장을 클릭합니다'
        ],
        order: 2
      }
    ],
    createdAt: new Date(),
    updatedAt: new Date()
  },

  // 2. 고객·계약·문서 등록
  {
    categoryId: 'doc-register',
    categoryTitle: '고객·계약·문서 등록',
    order: 2,
    isPublished: true,
    items: [
      {
        id: 'ar-upload',
        title: 'AR 문서로 고객과 계약 자동 등록',
        description: '연례보고서(Annual Report)를 업로드하면 AI가 자동으로 피보험자 정보와 계약 내역을 추출합니다.',
        steps: [
          '"고객·계약·문서 등록" 화면에서 AR 파일을 드래그앤드롭합니다',
          'AI가 피보험자 이름과 발행일을 자동으로 추출합니다',
          '같은 이름의 기존 고객이 있으면 선택하거나 새 고객으로 등록합니다',
          '파싱이 완료되면 계약 정보가 보험계약 탭에 자동으로 표시됩니다'
        ],
        order: 1
      },
      {
        id: 'document-upload',
        title: '증권/청약서 문서 등록하기',
        description: '보험 증권, 청약서 등 일반 문서를 특정 고객에게 연결하여 등록합니다.',
        steps: [
          '먼저 상단에서 문서를 연결할 고객을 선택합니다',
          '파일 업로드 영역에 문서를 드래그앤드롭합니다',
          'PDF, 이미지 등 다양한 형식을 지원합니다',
          '업로드된 문서는 해당 고객의 문서 탭에서 확인할 수 있습니다'
        ],
        order: 2
      },
      {
        id: 'ar-result-check',
        title: 'AR 파싱 결과 확인하기',
        description: 'AR 문서가 정상적으로 분석되었는지 확인하고, 계약 정보를 검토합니다.',
        steps: [
          '고객 상세 화면에서 "Annual Report" 탭을 선택합니다',
          'AR 목록에서 확인할 항목을 클릭합니다',
          '"상세 보기"로 추출된 계약 정보를 확인합니다',
          '필요시 우클릭 메뉴에서 "보험계약 등록"을 선택하여 수동 등록할 수 있습니다'
        ],
        order: 3
      }
    ],
    createdAt: new Date(),
    updatedAt: new Date()
  },

  // 3. 고객 수동등록
  {
    categoryId: 'customer-register',
    categoryTitle: '고객 수동등록',
    order: 3,
    isPublished: true,
    items: [
      {
        id: 'personal-customer',
        title: '개인 고객 등록하기',
        description: '개인 고객의 기본 정보를 직접 입력하여 등록합니다.',
        steps: [
          '"고객 수동등록" 화면에서 "개인" 탭을 선택합니다',
          '고객명(필수), 휴대폰, 이메일, 주소 등을 입력합니다',
          '생년월일과 성별을 입력하면 보험 상담 시 유용합니다',
          '"등록" 버튼을 클릭하여 저장합니다'
        ],
        order: 1
      },
      {
        id: 'corporate-customer',
        title: '법인 고객 등록하기',
        description: '법인 고객의 기본 정보를 직접 입력하여 등록합니다.',
        steps: [
          '"고객 수동등록" 화면에서 "법인" 탭을 선택합니다',
          '법인명(필수), 대표전화, 이메일을 입력합니다',
          '사업자번호와 대표자명을 입력합니다',
          '사업장 주소를 입력하고 "등록" 버튼을 클릭합니다'
        ],
        order: 2
      }
    ],
    createdAt: new Date(),
    updatedAt: new Date()
  },

  // 4. 고객 일괄등록
  {
    categoryId: 'excel-import',
    categoryTitle: '고객 일괄등록',
    order: 4,
    isPublished: true,
    items: [
      {
        id: 'excel-prepare',
        title: '엑셀 파일 준비하기',
        description: '일괄등록용 엑셀 파일의 형식을 안내합니다.',
        steps: [
          '엑셀 파일(.xlsx)에 최대 3개의 시트를 만들 수 있습니다: 개인고객, 법인고객, 계약',
          '개인고객 시트: 고객명(필수), 이메일, 휴대폰, 주소, 성별, 생년월일',
          '법인고객 시트: 고객명(필수), 이메일, 대표전화, 주소, 사업자번호, 대표자명',
          '날짜는 YYYY-MM-DD 형식(예: 2024-03-15)을 권장합니다'
        ],
        order: 1
      },
      {
        id: 'excel-upload',
        title: '엑셀 파일 업로드하기',
        description: '준비한 엑셀 파일을 업로드하고 검증합니다.',
        steps: [
          '"고객 일괄등록" 화면에서 엑셀 파일을 드래그앤드롭합니다',
          '시스템이 자동으로 시트별 데이터를 읽어옵니다',
          '고객명 빈값, 동명이인 등 오류가 있으면 빨간색으로 표시됩니다',
          '상품명 매칭 상태: 녹색(정확), 노란색(정규화), 빨간색(미매칭)'
        ],
        order: 2
      },
      {
        id: 'excel-register',
        title: '검증 후 등록하기',
        description: '검증된 데이터를 확인하고 일괄 등록합니다.',
        steps: [
          '모든 오류를 수정한 후 "등록" 버튼을 클릭합니다',
          '개인고객, 법인고객, 계약 순서로 등록이 진행됩니다',
          '등록 완료 후 결과 요약이 표시됩니다',
          '"전체 고객 보기"에서 등록된 고객을 확인할 수 있습니다'
        ],
        order: 3
      }
    ],
    createdAt: new Date(),
    updatedAt: new Date()
  },

  // 5. 문서 일괄등록
  {
    categoryId: 'batch-document',
    categoryTitle: '문서 일괄등록',
    order: 5,
    isPublished: true,
    items: [
      {
        id: 'folder-prepare',
        title: '폴더 구조 준비하기',
        description: '문서 일괄등록을 위한 폴더 구조를 안내합니다.',
        steps: [
          '루트 폴더 아래에 고객명과 동일한 이름의 폴더를 만듭니다',
          '각 고객 폴더 안에 해당 고객의 문서 파일들을 넣습니다',
          '예: /루트/홍길동/증권.pdf, /루트/홍길동/청약서.pdf',
          '폴더명이 시스템에 등록된 고객명과 일치해야 자동 매핑됩니다'
        ],
        order: 1
      },
      {
        id: 'folder-upload',
        title: '폴더 업로드하기',
        description: '준비한 폴더를 업로드하고 고객과 매핑합니다.',
        steps: [
          '"문서 일괄등록" 화면에서 루트 폴더를 드래그앤드롭합니다',
          '시스템이 폴더명과 기존 고객명을 자동 매핑합니다',
          '매핑 결과를 검토하고, 필요시 수동으로 고객을 선택합니다',
          '"업로드 시작" 버튼을 클릭하여 일괄 업로드합니다'
        ],
        order: 2
      }
    ],
    createdAt: new Date(),
    updatedAt: new Date()
  },

  // 6. 전체고객보기
  {
    categoryId: 'customers-all',
    categoryTitle: '전체고객보기',
    order: 6,
    isPublished: true,
    items: [
      {
        id: 'customer-list',
        title: '고객 목록 조회하기',
        description: '등록된 모든 고객을 조회하고 검색합니다.',
        steps: [
          '"고객 관리" > "전체 보기"를 클릭합니다',
          '검색창에 이름, 전화번호, 이메일로 검색할 수 있습니다',
          '초성 필터(ㄱ, ㄴ, ㄷ...)로 빠르게 찾을 수 있습니다',
          '상태 필터(활성, 휴면)로 고객을 분류하여 볼 수 있습니다'
        ],
        order: 1
      },
      {
        id: 'customer-detail',
        title: '고객 상세 정보 확인하기',
        description: '개별 고객의 상세 정보와 연결된 문서, 계약을 확인합니다.',
        steps: [
          '고객 목록에서 원하는 고객을 클릭합니다',
          '오른쪽 패널에서 기본 정보를 확인할 수 있습니다',
          '더블클릭하면 전체 화면에서 문서, 계약, AR 정보를 모두 볼 수 있습니다',
          '우클릭 메뉴로 전화, 문자, 휴면 처리 등을 할 수 있습니다'
        ],
        order: 2
      }
    ],
    createdAt: new Date(),
    updatedAt: new Date()
  },

  // 7. 전체문서보기
  {
    categoryId: 'documents-all',
    categoryTitle: '전체문서보기',
    order: 7,
    isPublished: true,
    items: [
      {
        id: 'document-list',
        title: '문서 목록 조회하기',
        description: '등록된 모든 문서를 조회하고 검색합니다.',
        steps: [
          '"문서 관리" > "전체 보기"를 클릭합니다',
          '검색창에 파일명, 고객명으로 검색할 수 있습니다',
          '초성 필터로 고객명 기준 빠른 검색이 가능합니다',
          '문서 상태(처리 중, 완료, 오류)별로 필터링할 수 있습니다'
        ],
        order: 1
      },
      {
        id: 'document-preview',
        title: '문서 미리보기',
        description: '문서를 클릭하여 미리보기하고 상세 정보를 확인합니다.',
        steps: [
          '문서 목록에서 원하는 문서를 클릭합니다',
          '오른쪽 패널에서 문서 미리보기가 표시됩니다',
          '더블클릭하면 모달 창에서 크게 볼 수 있습니다',
          '우클릭 메뉴로 다운로드, 고객 연결, 삭제 등을 할 수 있습니다'
        ],
        order: 2
      }
    ],
    createdAt: new Date(),
    updatedAt: new Date()
  },

  // 8. 문서 탐색기
  {
    categoryId: 'doc-explorer',
    categoryTitle: '문서 탐색기',
    order: 8,
    isPublished: true,
    items: [
      {
        id: 'tree-navigation',
        title: '트리 구조로 문서 탐색하기',
        description: '윈도우 탐색기 스타일로 문서를 분류별로 탐색합니다.',
        steps: [
          '"문서 탐색기" 메뉴를 클릭합니다',
          '왼쪽 툴바에서 그룹화 방식을 선택합니다: 태그, 고객, 날짜',
          '폴더를 클릭하여 펼치거나 접습니다',
          '문서를 클릭하면 오른쪽에서 미리보기됩니다'
        ],
        order: 1
      },
      {
        id: 'advanced-filter',
        title: '고급 필터와 정렬',
        description: '다양한 조건으로 문서를 필터링하고 정렬합니다.',
        steps: [
          '검색창에서 파일명으로 빠르게 검색합니다',
          '초성 필터로 고객명 기준 필터링이 가능합니다',
          '날짜 점프 기능으로 특정 날짜의 문서로 이동합니다',
          '정렬 옵션(날짜순, 이름순)으로 원하는 순서로 정렬합니다'
        ],
        order: 2
      }
    ],
    createdAt: new Date(),
    updatedAt: new Date()
  },

  // 9. 용어 설명
  {
    categoryId: 'terminology',
    categoryTitle: '용어 설명',
    order: 9,
    isPublished: true,
    items: [
      {
        id: 'term-ar',
        title: 'AR (Annual Report)',
        description: '연례보고서의 의미와 활용법을 설명합니다.',
        steps: [
          'AR은 보험사가 매년 피보험자에게 발송하는 연례보고서입니다',
          '가입된 모든 보험 계약의 요약 정보가 포함되어 있습니다',
          'AR을 업로드하면 AI가 자동으로 계약 정보를 추출합니다',
          '같은 고객의 여러 연도 AR을 업로드하면 계약 변화를 추적할 수 있습니다'
        ],
        order: 1
      },
      {
        id: 'term-insured',
        title: '피보험자와 계약자',
        description: '보험 계약의 주요 당사자를 설명합니다.',
        steps: [
          '피보험자: 보험 사고 발생 시 보험금을 받는 대상',
          '계약자: 보험 계약을 체결하고 보험료를 납입하는 사람',
          '피보험자와 계약자는 동일인일 수도, 다른 사람일 수도 있습니다',
          '이 서비스에서 "고객"은 주로 계약자를 의미합니다'
        ],
        order: 2
      },
      {
        id: 'term-status',
        title: '활성 고객과 휴면 고객',
        description: '고객 상태의 개념을 설명합니다.',
        steps: [
          '활성 고객: 현재 관리 중인 고객으로 기본 목록에 표시됩니다',
          '휴면 고객: 연락이 뜸하거나 더 이상 관리하지 않는 고객입니다',
          '휴면 처리된 고객도 삭제되지 않고 "휴면" 필터에서 확인 가능합니다',
          '휴면 고객은 언제든 다시 활성화할 수 있습니다'
        ],
        order: 3
      }
    ],
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

async function seedUsageGuides() {
  console.log('사용 가이드 시드 스크립트 시작...');

  const client = await MongoClient.connect(MONGO_URI);
  const db = client.db();
  const collection = db.collection('usage_guides');

  // 기존 데이터 백업 (선택사항)
  const existingCount = await collection.countDocuments();
  if (existingCount > 0) {
    console.log(`기존 ${existingCount}개의 가이드 발견. 삭제 후 새 데이터 삽입...`);
  }

  // 기존 데이터 삭제
  await collection.deleteMany({});

  // 새 데이터 삽입
  const result = await collection.insertMany(usageGuides);
  console.log(`${result.insertedCount}개의 사용 가이드 카테고리 삽입 완료`);

  // 총 항목 수 계산
  const totalItems = usageGuides.reduce((sum, g) => sum + g.items.length, 0);
  console.log(`총 ${totalItems}개의 가이드 항목 삽입 완료`);

  await client.close();
  console.log('사용 가이드 시드 완료!');
}

seedUsageGuides().catch(console.error);
