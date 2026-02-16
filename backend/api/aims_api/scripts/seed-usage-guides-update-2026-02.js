/**
 * 사용 가이드 업데이트 스크립트 (2026-02)
 *
 * AutoClicker, CRS, 가족·법인계약, AI 어시스턴트, 모바일 사용법 등
 * 최근 추가/변경된 기능에 대한 가이드를 추가합니다.
 *
 * - 기존 데이터를 삭제하지 않음
 * - categoryId 기준 upsert로 중복 실행 안전
 * - 기존 카테고리에 아이템 추가 시 id 기준 중복 체크
 *
 * 실행 방법:
 * cd /home/rossi/aims/backend/api/aims_api && node scripts/seed-usage-guides-update-2026-02.js
 * 또는:
 * docker exec aims-api node scripts/seed-usage-guides-update-2026-02.js
 */

const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/';
const DB_NAME = 'docupload';

// ========================================
// 신규 카테고리
// ========================================
const newCategories = [
  // AutoClicker (PDF 자동 다운로드)
  {
    categoryId: 'autoclicker',
    categoryTitle: 'AutoClicker',
    order: 10,
    isPublished: true,
    items: [
      {
        id: 'ac-intro',
        title: 'AutoClicker란?',
        description: 'MetLife 고객의 변액리포트(CRS), Annual Report PDF 파일들을 자동으로 다운로드하는 PC 프로그램입니다.',
        steps: [
          'AutoClicker는 MetLife 홈페이지에서 고객별 PDF 문서를 자동으로 다운로드합니다',
          '다운로드된 PDF는 AIMS에 자동으로 업로드되어 분석됩니다',
          'Windows PC에서만 사용 가능하며, 1920×1080 해상도를 권장합니다',
          'AIMS에 로그인한 상태에서 "AutoClicker 실행" 버튼을 클릭하면 바로 사용할 수 있습니다'
        ],
        order: 1
      },
      {
        id: 'ac-install',
        title: '설치 및 실행하기',
        description: 'AIMS 웹에서 버튼 한 번으로 AutoClicker를 설치하고 실행합니다.',
        steps: [
          'AIMS 왼쪽 메뉴에서 "AutoClicker" 메뉴를 클릭합니다',
          '"AutoClicker 실행" 버튼을 클릭합니다',
          '처음 사용 시 설치 프로그램이 자동으로 다운로드됩니다',
          '다운로드된 설치 파일(AIMS_AutoClicker_Setup_x.x.x.exe)을 실행하여 설치를 완료합니다',
          '설치 완료 후 다시 "AutoClicker 실행" 버튼을 클릭하면 바로 실행됩니다'
        ],
        order: 2
      },
      {
        id: 'ac-usage',
        title: '사용 방법',
        description: 'AutoClicker로 MetLife 홈페이지에서 PDF를 자동으로 다운로드하는 방법입니다.',
        steps: [
          'AutoClicker가 실행되면 MetLife 홈페이지가 자동으로 열립니다',
          'MetLife에 로그인한 상태에서 AutoClicker의 "실행" 버튼을 클릭합니다',
          '고객 목록이 자동으로 스크롤되며 PDF를 순차적으로 다운로드합니다',
          '다운로드 진행 상황은 AutoClicker 화면에서 실시간으로 확인할 수 있습니다',
          '완료되면 다운로드된 PDF가 AIMS에 자동으로 업로드됩니다'
        ],
        order: 3
      },
      {
        id: 'ac-update',
        title: '자동 업데이트',
        description: 'AutoClicker는 매 실행 시 최신 버전으로 자동 업데이트됩니다.',
        steps: [
          '실행할 때마다 최신 버전을 자동으로 확인합니다',
          '새 버전이 있으면 자동으로 다운로드하고 설치합니다',
          '업데이트 후에도 로그인 상태가 유지되어 별도 재로그인이 필요 없습니다',
          '업데이트는 수 초 내에 완료되며, 완료 후 자동으로 재실행됩니다'
        ],
        order: 4
      }
    ],
    createdAt: new Date(),
    updatedAt: new Date()
  },

  // 변액리포트 (CRS)
  {
    categoryId: 'crs',
    categoryTitle: '변액리포트 (CRS)',
    order: 11,
    isPublished: true,
    items: [
      {
        id: 'crs-intro',
        title: '변액리포트(CRS)란?',
        description: 'CRS(Customer Review Service)는 변액보험 계약자에게 발송되는 정기 리포트입니다.',
        steps: [
          'CRS는 변액보험의 계약사항, 보험료 납입현황, 펀드 구성 등 상세 정보가 담긴 문서입니다',
          'MetLife에서 정기적으로 발행하며, 계약자별로 1건씩 생성됩니다',
          'AIMS에 CRS를 업로드하면 AI가 자동으로 내용을 분석하여 데이터를 추출합니다',
          '추출된 데이터는 고객 상세 화면의 "변액리포트" 탭에서 확인할 수 있습니다'
        ],
        order: 1
      },
      {
        id: 'crs-upload',
        title: 'CRS 문서 업로드하기',
        description: 'CRS 문서를 업로드하면 AI가 자동으로 분석합니다.',
        steps: [
          '"고객·계약·문서 등록" 화면에서 CRS 파일을 드래그앤드롭합니다',
          'AI가 자동으로 CRS 문서를 감지하고 분석을 시작합니다',
          '분석 진행 상태는 "변액리포트" 탭에서 실시간으로 확인할 수 있습니다',
          '분석이 완료되면 계약사항, 보험료, 펀드 구성 정보가 자동으로 추출됩니다',
          '분석에 실패하면 재시도 버튼으로 다시 분석할 수 있습니다 (최대 3회)'
        ],
        order: 2
      },
      {
        id: 'crs-tab',
        title: '변액리포트 탭 사용법',
        description: '고객 상세 화면에서 변액리포트 탭을 조회하고 관리합니다.',
        steps: [
          '고객 상세 화면에서 "변액리포트" 탭을 클릭합니다',
          '계약자, 피보험자, 발행일, 상품명, 펀드 수, 상태 등의 정보를 확인할 수 있습니다',
          '칼럼 헤더를 클릭하면 오름차순/내림차순으로 정렬할 수 있습니다',
          '검색창에서 계약자명, 피보험자명, 상품명 등으로 검색할 수 있습니다',
          '완료된 항목을 클릭하면 상세 모달이 열립니다'
        ],
        order: 3
      },
      {
        id: 'crs-modal',
        title: '상세 보기 (모달)',
        description: 'CRS 모달에서 계약사항, 보험료 납입현황, 펀드 구성을 확인합니다.',
        steps: [
          '변액리포트 목록에서 완료 상태의 항목을 클릭합니다',
          '"계약사항" 섹션: 증권번호, 계약일자, 보험가입금액, 적립금, 투자수익률, 해지환급금 등',
          '"보험료 납입현황" 섹션: 기본보험료, 수시추가납, 정기추가납, 중도출금, 약관대출 등',
          '"펀드 구성 현황" 섹션: 각 펀드별 적립금, 구성비, 수익률, 투입원금 확인',
          '모달 우측 상단의 아이콘으로 새 창에서 크게 볼 수 있습니다'
        ],
        order: 4
      }
    ],
    createdAt: new Date(),
    updatedAt: new Date()
  },

  // 가족·법인계약
  {
    categoryId: 'family-contract',
    categoryTitle: '가족·법인계약',
    order: 12,
    isPublished: true,
    items: [
      {
        id: 'family-contract-tab',
        title: '가족계약 탭',
        description: '가족 구성원 전체의 보험계약을 한눈에 통합 조회합니다.',
        steps: [
          '고객 상세 화면에서 "가족계약" 탭을 클릭합니다',
          '해당 고객과 가족 구성원(배우자, 자녀 등) 전체의 보험계약이 통합 표시됩니다',
          '각 계약에 가족관계(배우자, 자녀 등)가 함께 표시됩니다',
          '가족관계가 설정된 고객만 이 탭이 활성화됩니다',
          '"관계만 보기" 모드로 전환하면 관계 중심으로 정리된 뷰를 볼 수 있습니다'
        ],
        order: 1
      },
      {
        id: 'corporate-contract-tab',
        title: '법인계약 탭',
        description: '법인 관련 계약을 자동으로 감지하여 표시합니다.',
        steps: [
          '고객 상세 화면에서 "법인계약" 탭을 클릭합니다',
          '계약자 또는 피보험자가 본인이나 가족이 아닌 계약을 자동으로 감지합니다',
          '법인 고객의 경우 해당 법인과 관련된 개인 계약도 함께 표시됩니다',
          '각 계약에 상대방(법인/개인)과의 관계가 함께 표시됩니다'
        ],
        order: 2
      }
    ],
    createdAt: new Date(),
    updatedAt: new Date()
  },

  // AI 어시스턴트
  {
    categoryId: 'ai-assistant',
    categoryTitle: 'AI 어시스턴트',
    order: 13,
    isPublished: true,
    items: [
      {
        id: 'ai-intro',
        title: 'AI 어시스턴트 소개',
        description: 'AI 채팅으로 고객 등록, 문서 관리, 질의응답 등 다양한 작업을 수행합니다.',
        steps: [
          'AI 어시스턴트는 자연어로 대화하며 다양한 업무를 처리하는 AI 비서입니다',
          '화면 하단의 AI 어시스턴트 버튼을 클릭하면 채팅 패널이 열립니다',
          '텍스트로 질문하거나 작업을 요청하면 AI가 즉시 처리합니다',
          'AI가 데이터를 등록/수정/삭제하면 화면이 자동으로 새로고침됩니다'
        ],
        order: 1
      },
      {
        id: 'ai-usage',
        title: 'AI 어시스턴트 사용법',
        description: '질문하기, 고객/문서 등록 요청, 데이터 조회 등의 활용법입니다.',
        steps: [
          '"홍길동 고객 등록해줘" — 고객 등록을 요청합니다',
          '"김영희의 계약 정보 알려줘" — 특정 고객의 계약을 조회합니다',
          '"지난달 등록된 문서 몇 개야?" — 통계를 질문합니다',
          '"홍길동 고객 휴면 처리해줘" — 고객 상태를 변경합니다',
          '대화 내역은 저장되어 페이지를 새로고침해도 유지됩니다'
        ],
        order: 2
      }
    ],
    createdAt: new Date(),
    updatedAt: new Date()
  },

  // 모바일 사용법
  {
    categoryId: 'mobile',
    categoryTitle: '모바일 사용법',
    order: 14,
    isPublished: true,
    items: [
      {
        id: 'mobile-access',
        title: '모바일 접속 안내',
        description: '스마트폰, 태블릿에서 AIMS에 접속하는 방법입니다.',
        steps: [
          '모바일 기기의 웹 브라우저(Chrome, Safari 등)에서 AIMS 주소로 접속합니다',
          '화면이 자동으로 모바일에 최적화된 레이아웃으로 전환됩니다',
          '가로 모드와 세로 모드 모두 지원합니다',
          'iPad, Android 태블릿 등 태블릿 기기에서도 최적화된 화면이 제공됩니다'
        ],
        order: 1
      },
      {
        id: 'mobile-features',
        title: '모바일 주요 기능',
        description: '모바일에서 사용 가능한 주요 기능과 조작법을 안내합니다.',
        steps: [
          '고객 목록 조회 및 상세 정보 확인이 가능합니다',
          '문서 미리보기와 조회가 가능합니다',
          'AI 어시스턴트를 전체 화면으로 사용할 수 있습니다',
          'Android에서는 뒤로가기 버튼으로 모달을 닫을 수 있습니다',
          '초성 필터, 검색 등 PC와 동일한 필터링 기능을 사용할 수 있습니다'
        ],
        order: 2
      }
    ],
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

// ========================================
// 기존 카테고리에 추가할 아이템
// ========================================
const itemsToAdd = [
  // 전체문서보기 (documents-all)에 파일명 토글 추가
  {
    categoryId: 'documents-all',
    item: {
      id: 'filename-toggle',
      title: '파일명 별칭/원본 전환',
      description: '문서 목록에서 별칭과 원본 파일명을 토글하여 볼 수 있습니다.',
      steps: [
        '문서 목록 상단의 파일명 토글 버튼을 클릭합니다',
        '"별칭" 모드: 사용자가 지정한 별칭이 표시됩니다',
        '"원본" 모드: 업로드 시 원본 파일명이 표시됩니다',
        '전체 문서 보기, 상세 문서 검색, 문서 탐색기 모두에서 동일하게 사용 가능합니다',
        '검색 시에도 선택한 모드에 맞춰 파일명 기준으로 검색됩니다'
      ],
      order: 3
    }
  },
  // 전체고객보기 (customers-all)에 우클릭 메뉴 추가
  {
    categoryId: 'customers-all',
    item: {
      id: 'customer-rightclick',
      title: '우클릭 메뉴 활용하기',
      description: '고객 목록에서 우클릭으로 다양한 작업을 빠르게 수행합니다.',
      steps: [
        '고객 목록에서 원하는 고객을 우클릭(마우스 오른쪽 버튼)합니다',
        '"전화하기": 등록된 전화번호로 바로 연결합니다',
        '"문자 보내기": 등록된 번호로 문자 메시지를 보냅니다',
        '"휴면 처리": 활성 고객을 휴면 상태로 변경합니다',
        '"상세 보기": 고객 전체 화면 상세 정보를 엽니다'
      ],
      order: 3
    }
  },
  // 용어 설명 (terminology)에 CRS 용어 추가
  {
    categoryId: 'terminology',
    item: {
      id: 'term-crs',
      title: 'CRS (Customer Review Service)',
      description: '변액리포트의 의미와 활용법을 설명합니다.',
      steps: [
        'CRS는 Customer Review Service의 약자로, 변액보험 리포트를 의미합니다',
        '변액보험 계약자에게 정기적으로 발송되는 보고서입니다',
        '계약사항, 보험료 납입현황, 펀드별 적립금/수익률 등이 포함됩니다',
        'AR(Annual Report)과 달리, CRS는 변액보험에 특화된 상세 리포트입니다',
        'AIMS에 업로드하면 AI가 자동으로 분석하여 "변액리포트" 탭에서 확인 가능합니다'
      ],
      order: 4
    }
  }
];

async function updateUsageGuides() {
  console.log('사용 가이드 업데이트 스크립트 시작 (2026-02)...');

  const client = await MongoClient.connect(MONGO_URI);
  const db = client.db(DB_NAME);
  const collection = db.collection('usage_guides');

  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  // 1. 신규 카테고리 추가 (upsert)
  for (const category of newCategories) {
    const existing = await collection.findOne({ categoryId: category.categoryId });
    if (existing) {
      console.log(`  [스킵] "${category.categoryTitle}" 카테고리가 이미 존재합니다`);
      skippedCount++;
    } else {
      await collection.insertOne(category);
      console.log(`  [추가] "${category.categoryTitle}" 카테고리 추가 (${category.items.length}개 아이템)`);
      insertedCount++;
    }
  }

  // 2. 기존 카테고리에 아이템 추가
  for (const { categoryId, item } of itemsToAdd) {
    const existing = await collection.findOne({ categoryId });
    if (!existing) {
      console.log(`  [경고] "${categoryId}" 카테고리가 존재하지 않습니다. 스킵합니다.`);
      skippedCount++;
      continue;
    }

    // 아이템 중복 체크
    const hasItem = existing.items.some(i => i.id === item.id);
    if (hasItem) {
      console.log(`  [스킵] "${categoryId}" > "${item.title}" 아이템이 이미 존재합니다`);
      skippedCount++;
    } else {
      await collection.updateOne(
        { categoryId },
        {
          $push: { items: item },
          $set: { updatedAt: new Date() }
        }
      );
      console.log(`  [추가] "${categoryId}" > "${item.title}" 아이템 추가`);
      updatedCount++;
    }
  }

  // 결과 요약
  console.log('\n========================================');
  console.log(`신규 카테고리 추가: ${insertedCount}개`);
  console.log(`기존 카테고리 아이템 추가: ${updatedCount}개`);
  console.log(`스킵: ${skippedCount}개`);
  console.log('========================================');

  // 최종 상태 확인
  const allGuides = await collection.find({}).sort({ order: 1 }).toArray();
  const totalItems = allGuides.reduce((sum, g) => sum + g.items.length, 0);
  console.log(`\n최종 상태: ${allGuides.length}개 카테고리, ${totalItems}개 아이템`);

  await client.close();
  console.log('사용 가이드 업데이트 완료!');
}

updateUsageGuides().catch(console.error);
