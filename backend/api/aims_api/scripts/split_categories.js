/**
 * FAQ 카테고리 세분화
 * terminology (41개) → 4개로 분리
 * import (30개) → 2개로 분리
 */

db = db.getSiblingDB('docupload');

// === terminology 분리 ===

// 1. 고객 용어 (term-customer)
const customerTerms = [
  "'개인' 고객이란",
  "'법인' 고객이란",
  "'활성' 상태란",
  "'휴면' 상태란",
  "'고객명'이란",
  "'가족대표'란",
  "'수익자'란",
  "'동명이인'이란",
  "가족 관계 유형",
  "법인 관계 유형"
];

let result = db.faqs.updateMany(
  {
    category: 'terminology',
    $or: customerTerms.map(t => ({ question: { $regex: t } }))
  },
  { $set: { category: 'term-customer' } }
);
print('term-customer로 변경: ' + result.modifiedCount + '건');

// 2. 문서 용어 (term-doc)
const docTerms = [
  "'OCR'이란",
  "'OCR 신뢰도'란",
  "OCR/TXT/BIN",
  "'메타데이터'란",
  "'임베딩'이란",
  "문서 처리 상태",
  "'전문\\(Full Text\\)'이란",
  "'MIME 타입'이란"
];

result = db.faqs.updateMany(
  {
    category: 'terminology',
    $or: docTerms.map(t => ({ question: { $regex: t } }))
  },
  { $set: { category: 'term-doc' } }
);
print('term-doc로 변경: ' + result.modifiedCount + '건');

// 3. 계약 용어 (term-contract)
const contractTerms = [
  "'증권번호'란",
  "'계약자'란",
  "'피보험자'란",
  "계약 상태 '유지'란",
  "계약 상태 '완납'란",
  "계약 상태 '실효'란",
  "계약 상태 '해지'란",
  "계약 상태 '만기'란",
  "'납입주기'란"
];

result = db.faqs.updateMany(
  {
    category: 'terminology',
    $or: contractTerms.map(t => ({ question: { $regex: t } }))
  },
  { $set: { category: 'term-contract' } }
);
print('term-contract로 변경: ' + result.modifiedCount + '건');

// 4. 나머지는 시스템 용어 (term-system)
result = db.faqs.updateMany(
  { category: 'terminology' },
  { $set: { category: 'term-system' } }
);
print('term-system으로 변경: ' + result.modifiedCount + '건');

// === import 분리 ===

// 1. 고객/계약 일괄등록 (import-data)
const importDataTerms = [
  "고객·계약 일괄등록",
  "엑셀 템플릿",
  "어떤 시트가 필요",
  "개인고객 시트",
  "법인고객 시트",
  "계약 시트",
  "상품명 매칭",
  "동명이인",
  "증권번호가 중복",
  "날짜 형식",
  "기존 고객과 이름",
  "일괄등록 중 오류",
  "한 번에 몇 건",
  "일괄등록 후 결과"
];

result = db.faqs.updateMany(
  {
    category: 'import',
    $or: importDataTerms.map(t => ({ question: { $regex: t } }))
  },
  { $set: { category: 'import-data' } }
);
print('import-data로 변경: ' + result.modifiedCount + '건');

// 2. 나머지는 문서 일괄등록 (import-file)
result = db.faqs.updateMany(
  { category: 'import' },
  { $set: { category: 'import-file' } }
);
print('import-file로 변경: ' + result.modifiedCount + '건');

// === 최종 결과 확인 ===
print('\n=== 세분화 후 카테고리별 현황 ===');
const categories = db.faqs.aggregate([
  { $group: { _id: '$category', count: { $sum: 1 } } },
  { $sort: { count: -1 } }
]).toArray();
categories.forEach(c => print(c._id + ': ' + c.count + '개'));
print('\n총 카테고리 수: ' + categories.length);
