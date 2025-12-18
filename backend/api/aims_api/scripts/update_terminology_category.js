/**
 * 용어 FAQ 카테고리를 terminology로 변경
 */

db = db.getSiblingDB('docupload');

// 용어 FAQ를 terminology 카테고리로 변경
const result = db.faqs.updateMany(
  { question: /\[용어\]/ },
  { $set: { category: 'terminology' } }
);

print('변경된 FAQ: ' + result.modifiedCount + '건');

// 확인
print('terminology 카테고리 FAQ 수: ' + db.faqs.countDocuments({ category: 'terminology' }));

// 전체 카테고리 현황
print('\n=== 카테고리별 현황 ===');
const categories = db.faqs.aggregate([
  { $group: { _id: '$category', count: { $sum: 1 } } },
  { $sort: { count: -1 } }
]).toArray();
categories.forEach(c => print(c._id + ': ' + c.count + '개'));
