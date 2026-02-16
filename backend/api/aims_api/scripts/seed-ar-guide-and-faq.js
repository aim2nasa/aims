/**
 * AR(Annual Report) 사용 가이드 + FAQ 추가 스크립트
 *
 * CRS 카테고리와 별도로 AR 카테고리를 추가합니다.
 * - 기존 데이터를 삭제하지 않음
 * - categoryId/question 기준 중복 체크로 안전한 실행
 *
 * 실행 방법:
 * docker exec aims-api node scripts/seed-ar-guide-and-faq.js
 */

const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/';
const DB_NAME = 'docupload';

// ========================================
// AR 사용 가이드 카테고리
// ========================================
const arGuideCategory = {
  categoryId: 'ar',
  categoryTitle: 'Annual Report (AR)',
  order: 10.5, // autoclicker(10)과 crs(11) 사이
  isPublished: true,
  items: [
    {
      id: 'ar-intro',
      title: 'Annual Report(AR)란?',
      description: 'Annual Report는 피보험자의 전체 보험계약을 요약한 연례보고서입니다.',
      steps: [
        'AR은 피보험자에게 연 1회 발송되는 보험 연례보고서입니다',
        '여러 보험사의 계약이 하나의 문서에 통합 요약되어 있습니다',
        '증권번호, 보험종류, 계약상태, 보험료, 보장내용 등이 포함됩니다',
        'AIMS에 업로드하면 AI가 자동으로 계약 정보를 추출하여 등록합니다'
      ],
      order: 1
    },
    {
      id: 'ar-upload',
      title: 'AR 문서 업로드하기',
      description: 'AR 문서를 업로드하면 AI가 자동으로 계약 정보를 추출합니다.',
      steps: [
        '"고객·계약·문서 등록" 화면에서 AR 파일을 드래그앤드롭합니다',
        'AI가 자동으로 AR 문서를 감지하고 분석을 시작합니다',
        '문서 내의 모든 보험계약 정보가 자동으로 추출됩니다',
        '추출된 계약은 해당 고객의 "계약" 탭에서 확인할 수 있습니다',
        '기존에 등록된 계약과 자동으로 매칭되어 업데이트됩니다'
      ],
      order: 2
    },
    {
      id: 'ar-contracts',
      title: 'AR에서 추출된 계약 확인',
      description: 'AR에서 자동 추출된 계약 정보를 확인하고 관리합니다.',
      steps: [
        '고객 상세 화면에서 "계약" 탭을 클릭합니다',
        'AR에서 추출된 계약에는 출처가 "AR" 로 표시됩니다',
        '증권번호, 보험종류, 계약상태, 보험료 등 정보를 확인할 수 있습니다',
        '여러 보험사의 계약이 한번에 등록되므로 고객의 전체 보험 현황을 파악할 수 있습니다'
      ],
      order: 3
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
};

// ========================================
// AR FAQ 항목
// ========================================
const arFaqs = [
  {
    question: 'Annual Report(AR)란 무엇인가요?',
    answer: 'Annual Report(AR)은 피보험자의 전체 보험계약을 요약한 연례보고서입니다. 여러 보험사의 계약이 하나의 문서에 통합되어 있으며, 증권번호, 보험종류, 계약상태, 보험료 등의 정보가 포함됩니다. AIMS에 업로드하면 AI가 자동으로 계약 정보를 추출하여 등록합니다.',
    category: 'ar',
    order: 105,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  },
  {
    question: 'AR 문서를 업로드하면 어떻게 되나요?',
    answer: 'AR 문서를 업로드하면 AI가 자동으로 문서를 감지하고 분석합니다. 문서 내 모든 보험계약 정보(증권번호, 보험종류, 계약상태, 보험료 등)가 추출되어 해당 고객의 "계약" 탭에 자동 등록됩니다. 기존에 등록된 계약은 자동으로 매칭되어 정보가 업데이트됩니다.',
    category: 'ar',
    order: 106,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  },
  {
    question: 'CRS와 AR(Annual Report)은 어떻게 다른가요?',
    answer: 'AR(Annual Report)은 피보험자의 전체 보험계약을 요약한 연례보고서로, 여러 보험사의 계약이 한 문서에 포함됩니다. CRS(Customer Review Service)는 변액보험에 특화된 상세 리포트로, 하나의 변액보험 계약에 대한 펀드별 적립금, 수익률, 보험료 납입현황 등 상세 정보를 제공합니다.',
    category: 'ar',
    order: 107,
    isPublished: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  }
];

async function seedArData() {
  console.log('AR 사용 가이드 + FAQ 추가 스크립트 시작...');

  const client = await MongoClient.connect(MONGO_URI);
  const db = client.db(DB_NAME);

  // 1. 사용 가이드 추가
  const guidesCollection = db.collection('usage_guides');
  const existingGuide = await guidesCollection.findOne({ categoryId: 'ar' });
  if (existingGuide) {
    console.log('  [스킵] "Annual Report (AR)" 사용 가이드 카테고리가 이미 존재합니다');
  } else {
    await guidesCollection.insertOne(arGuideCategory);
    console.log(`  [추가] "Annual Report (AR)" 사용 가이드 카테고리 추가 (${arGuideCategory.items.length}개 아이템)`);
  }

  // 2. FAQ 추가
  const faqsCollection = db.collection('faqs');
  let faqInserted = 0;
  let faqSkipped = 0;
  for (const faq of arFaqs) {
    const existing = await faqsCollection.findOne({ question: faq.question });
    if (existing) {
      console.log(`  [스킵] "${faq.question}" — 이미 존재합니다`);
      faqSkipped++;
    } else {
      await faqsCollection.insertOne(faq);
      console.log(`  [추가] [${faq.category}] "${faq.question}"`);
      faqInserted++;
    }
  }

  // CRS에 있던 AR 관련 FAQ를 ar 카테고리로 이동 (이미 있으면 스킵)
  const crsArFaq = await faqsCollection.findOne({
    question: 'CRS와 AR(Annual Report)은 어떻게 다른가요?',
    category: 'crs'
  });
  if (crsArFaq) {
    await faqsCollection.updateOne(
      { _id: crsArFaq._id },
      { $set: { category: 'ar', order: 107, updatedAt: new Date() } }
    );
    console.log('  [이동] "CRS와 AR 차이" FAQ를 crs → ar 카테고리로 이동');
  }

  // 결과 요약
  console.log('\n========================================');
  console.log(`AR FAQ 추가: ${faqInserted}개, 스킵: ${faqSkipped}개`);

  const allGuides = await guidesCollection.find({}).sort({ order: 1 }).toArray();
  const totalItems = allGuides.reduce((sum, g) => sum + g.items.length, 0);
  const totalFaqs = await faqsCollection.countDocuments({ isPublished: true });
  console.log(`\n최종 상태: ${allGuides.length}개 가이드 카테고리, ${totalItems}개 아이템, ${totalFaqs}개 FAQ`);
  console.log('========================================');

  await client.close();
  console.log('AR 데이터 추가 완료!');
}

seedArData().catch(console.error);
