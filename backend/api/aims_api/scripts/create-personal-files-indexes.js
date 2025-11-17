/**
 * Personal Files MongoDB Indexes Setup
 *
 * 실행 방법:
 * mongosh docupload < create-personal-files-indexes.js
 */

// personal_files 컬렉션 인덱스 생성
db.personal_files.createIndex(
  { userId: 1, parentId: 1 },
  { name: 'idx_userId_parentId' }
);

db.personal_files.createIndex(
  { userId: 1, name: 'text' },
  { name: 'idx_userId_name_text' }
);

db.personal_files.createIndex(
  { userId: 1, type: 1 },
  { name: 'idx_userId_type' }
);

db.personal_files.createIndex(
  { userId: 1, isDeleted: 1 },
  { name: 'idx_userId_isDeleted' }
);

db.personal_files.createIndex(
  { userId: 1, createdAt: -1 },
  { name: 'idx_userId_createdAt' }
);

// 인덱스 목록 출력
print('\n=== Personal Files Indexes Created ===\n');
db.personal_files.getIndexes().forEach(idx => {
  print(`- ${idx.name}: ${JSON.stringify(idx.key)}`);
});
