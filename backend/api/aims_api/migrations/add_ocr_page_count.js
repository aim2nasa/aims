/**
 * OCR 페이지 수 필드 추가 마이그레이션
 * 기존 OCR 완료 문서에 page_count=1 설정 및 인덱스 생성
 *
 * @since 2025-12-15
 *
 * 실행 방법:
 * ssh tars.giize.com
 * mongosh docupload --file /home/rossi/aims/backend/api/aims_api/migrations/add_ocr_page_count.js
 */

print('=== OCR 페이지 수 마이그레이션 시작 ===');
print('시작 시간:', new Date().toISOString());

// 1. 기존 OCR 완료 문서에 page_count=1 설정
print('\n[Step 1] 기존 OCR 완료 문서에 page_count=1 설정...');

const updateResult = db.files.updateMany(
  {
    'ocr.status': 'done',
    'ocr.page_count': { $exists: false }
  },
  {
    $set: { 'ocr.page_count': 1 }
  }
);

print('  - 매칭된 문서 수:', updateResult.matchedCount);
print('  - 수정된 문서 수:', updateResult.modifiedCount);

// 2. 사용자별 + 기간별 집계 쿼리 최적화 인덱스 생성
print('\n[Step 2] 인덱스 생성: idx_ocr_user_period...');

try {
  db.files.createIndex(
    { 'ownerId': 1, 'ocr.done_at': -1, 'ocr.status': 1 },
    { name: 'idx_ocr_user_period', background: true }
  );
  print('  - 인덱스 생성 완료');
} catch (e) {
  if (e.codeName === 'IndexOptionsConflict' || e.code === 85) {
    print('  - 인덱스가 이미 존재합니다');
  } else {
    print('  - 인덱스 생성 오류:', e.message);
  }
}

// 3. 검증
print('\n[Step 3] 검증...');

const totalDone = db.files.countDocuments({ 'ocr.status': 'done' });
const withPageCount = db.files.countDocuments({
  'ocr.status': 'done',
  'ocr.page_count': { $exists: true }
});
const totalPages = db.files.aggregate([
  { $match: { 'ocr.status': 'done' } },
  { $group: { _id: null, total: { $sum: { $ifNull: ['$ocr.page_count', 1] } } } }
]).toArray();

print('  - 전체 OCR 완료 문서:', totalDone);
print('  - page_count 필드 있는 문서:', withPageCount);
print('  - 전체 페이지 수:', totalPages[0]?.total || 0);

print('\n=== 마이그레이션 완료 ===');
print('완료 시간:', new Date().toISOString());
