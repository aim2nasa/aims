/**
 * FAQ 카테고리 분포 확인
 */

db = db.getSiblingDB('docupload');

// 카테고리별 현황
print('=== 현재 카테고리별 FAQ 수 ===');
const categories = db.faqs.aggregate([
  { $group: { _id: '$category', count: { $sum: 1 } } },
  { $sort: { count: -1 } }
]).toArray();
categories.forEach(c => print(c._id + ': ' + c.count + '개'));

// 용어 FAQ 질문 목록
print('\n=== 용어(terminology) FAQ 질문들 ===');
db.faqs.find({ category: 'terminology' }, { question: 1, _id: 0 }).forEach(f => print(f.question));

// import FAQ 질문 목록
print('\n=== 일괄등록(import) FAQ 질문들 ===');
db.faqs.find({ category: 'import' }, { question: 1, _id: 0 }).forEach(f => print(f.question));

// document FAQ 질문 목록
print('\n=== 문서(document) FAQ 질문들 ===');
db.faqs.find({ category: 'document' }, { question: 1, _id: 0 }).forEach(f => print(f.question));
