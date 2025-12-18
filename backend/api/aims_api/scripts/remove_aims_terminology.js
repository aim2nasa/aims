/**
 * FAQ에서 AIMS 용어 제거
 * - AIMS 자체를 설명하는 FAQ 삭제
 * - AIMS를 일반화된 용어로 대체
 */

db = db.getSiblingDB('docupload');

// === Step 1: AIMS 자체를 설명하는 FAQ 삭제 (2개) ===
print('=== Step 1: AIMS 설명 FAQ 삭제 ===');
const deleteResult = db.faqs.deleteMany({
  _id: { $in: [
    ObjectId("694439c0634d9102789dc29d"),  // AIMS란 무엇인가요?
    ObjectId("694439c0634d9102789dc29e")   // AIMS에서 관리할 수 있는 것은 무엇인가요?
  ]}
});
print('삭제됨: ' + deleteResult.deletedCount + '개');

// === Step 2: AIMS를 일반화된 용어로 대체 (17개) ===
print('\n=== Step 2: AIMS 용어 대체 ===');

// 긴 패턴부터 먼저 처리 (순서 중요)
const replacements = [
  // 가장 긴 패턴 먼저
  ['AIMS에서는', '본 시스템에서는'],
  ['AIMS에서의', '시스템에서의'],
  ['AIMS 일괄등록', '일괄등록'],
  ['AIMS 시스템', '본 시스템'],
  ['AIMS 화면은', '화면은'],
  ['AIMS 내에서', '시스템 내에서'],
  ['AIMS에서', '시스템에서'],
  ['AIMS에는', '시스템에는'],
  ['AIMS는', '본 서비스는'],
  ['AIMS 처리', '시스템 처리'],
];

let totalModified = 0;
replacements.forEach(([from, to]) => {
  const result = db.faqs.updateMany(
    { answer: { $regex: from } },
    [{ $set: { answer: { $replaceAll: { input: '$answer', find: from, replacement: to } } } }]
  );
  if (result.modifiedCount > 0) {
    print('"' + from + '" → "' + to + '": ' + result.modifiedCount + '건');
    totalModified += result.modifiedCount;
  }
});
print('총 수정: ' + totalModified + '건');

// === Step 3: 검증 ===
print('\n=== Step 3: 검증 ===');
const remainingAIMS = db.faqs.countDocuments({
  $or: [
    { question: /AIMS/i },
    { answer: /AIMS/i }
  ]
});
print('AIMS 포함 FAQ: ' + remainingAIMS + '개');

if (remainingAIMS > 0) {
  print('\n⚠️ 아직 AIMS가 포함된 FAQ:');
  db.faqs.find({
    $or: [
      { question: /AIMS/i },
      { answer: /AIMS/i }
    ]
  }).forEach(f => print('- ' + f.question));
}

// 최종 FAQ 수
const totalFAQs = db.faqs.countDocuments({ isPublished: true });
print('\n최종 FAQ 수: ' + totalFAQs + '개');
