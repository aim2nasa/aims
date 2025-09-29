// ===============================================
// 🔧 백엔드 API 파일 크기 정렬 문제 수정 방안
// ===============================================
// 파일: /home/rossi/aims/backend/api/aims_api/server.js
// 위치: 라인 284-290 (문서 조회 부분 전체 수정 필요)

// ❌ 기존 문제 코드:
/*
// 정렬 조건 설정
let sortOption = {};
switch (sort) {
  // ... 기타 정렬 옵션들
  case 'size_desc':
    sortOption = { 'meta.size_bytes': -1 };
    break;
  case 'size_asc':
    sortOption = { 'meta.size_bytes': 1 };
    break;
  // ...
}

// 문서 조회
const documents = await db.collection(COLLECTION_NAME)
  .find(query)
  .sort(sortOption)
  .skip(parseInt(skip))
  .limit(parseInt(limit))
  .toArray();
*/

// ✅ 수정된 코드 - MongoDB Aggregation Pipeline 사용:

// 크기 정렬이 필요한 경우와 아닌 경우를 분기 처리
let documents;

if (sort === 'size_desc' || sort === 'size_asc') {
  console.log(`📊 크기 정렬 요청: ${sort}`);
  
  // MongoDB Aggregation Pipeline을 사용하여 문자열을 숫자로 변환 후 정렬
  const sortDirection = sort === 'size_desc' ? -1 : 1;
  
  const pipeline = [
    // 1. 검색 조건 적용
    { $match: query },
    
    // 2. 크기 필드를 숫자로 변환
    {
      $addFields: {
        'meta.size_bytes_numeric': {
          $cond: {
            if: { $type: "$meta.size_bytes" },
            then: { $toDouble: "$meta.size_bytes" },
            else: 0  // null이나 undefined인 경우 0으로 처리
          }
        }
      }
    },
    
    // 3. 숫자로 변환된 필드로 정렬
    { $sort: { 'meta.size_bytes_numeric': sortDirection } },
    
    // 4. 페이징 적용
    { $skip: parseInt(skip) },
    { $limit: parseInt(limit) },
    
    // 5. 임시 필드 제거 (선택사항)
    {
      $project: {
        'meta.size_bytes_numeric': 0  // 응답에서 임시 필드 제거
      }
    }
  ];
  
  console.log(`🔧 Aggregation Pipeline:`, JSON.stringify(pipeline, null, 2));
  
  // Aggregation 실행
  documents = await db.collection(COLLECTION_NAME)
    .aggregate(pipeline)
    .toArray();
  
  console.log(`📈 크기 정렬 결과 개수: ${documents.length}`);
  
} else {
  // 기존 방식: 크기 정렬이 아닌 경우
  console.log(`📝 일반 정렬 요청: ${sort}`);
  
  // 정렬 조건 설정 (크기 정렬 제외)
  let sortOption = {};
  switch (sort) {
    case 'uploadTime_desc':
      sortOption = { 'upload.uploaded_at': -1 };
      break;
    case 'uploadTime_asc':
      sortOption = { 'upload.uploaded_at': 1 };
      break;
    case 'filename_asc':
      sortOption = { 'upload.originalName': 1 };
      break;
    case 'filename_desc':
      sortOption = { 'upload.originalName': -1 };
      break;
    default:
      sortOption = { 'upload.uploaded_at': -1 };
  }
  
  // 일반 쿼리 실행
  documents = await db.collection(COLLECTION_NAME)
    .find(query)
    .sort(sortOption)
    .skip(parseInt(skip))
    .limit(parseInt(limit))
    .toArray();
}

// ===============================================
// 🧪 테스트 방법
// ===============================================

// 1. 서버 재시작 후 다음 API 호출로 테스트:
// curl -s "http://tars.giize.com:3010/api/documents?sort=size_desc&limit=5"
// curl -s "http://tars.giize.com:3010/api/documents?sort=size_asc&limit=5"

// 2. 기대 결과:
// size_desc: 큰 파일부터 작은 파일 순서로 정렬
// size_asc: 작은 파일부터 큰 파일 순서로 정렬

// 3. 결과 확인 방법:
// jq '.data.documents[] | {filename: .filename, fileSize: .fileSize}' 
// 으로 파일명과 크기를 확인하여 올바른 순서인지 검증

// ===============================================
// 📋 대안 방법 - 더 간단한 해결책
// ===============================================

// 만약 위 방법이 복잡하다면, 더 간단한 해결책:
// JavaScript에서 정렬 후 페이징 적용

if (sort === 'size_desc' || sort === 'size_asc') {
  // 1. 전체 문서를 가져온 후 메모리에서 정렬
  const allDocuments = await db.collection(COLLECTION_NAME)
    .find(query)
    .toArray();
  
  // 2. JavaScript에서 숫자 정렬
  allDocuments.sort((a, b) => {
    const sizeA = parseInt(a.meta?.size_bytes || 0);
    const sizeB = parseInt(b.meta?.size_bytes || 0);
    
    if (sort === 'size_desc') {
      return sizeB - sizeA;  // 내림차순
    } else {
      return sizeA - sizeB;  // 오름차순
    }
  });
  
  // 3. 페이징 적용
  const startIndex = parseInt(skip);
  const endIndex = startIndex + parseInt(limit);
  documents = allDocuments.slice(startIndex, endIndex);
  
  console.log(`📊 메모리 정렬 완료 - 전체: ${allDocuments.length}, 페이지: ${documents.length}`);
}

// 주의: 이 방법은 문서 수가 많을 때 성능 문제가 있을 수 있음
// 현재 25개 정도의 문서라면 문제없이 사용 가능