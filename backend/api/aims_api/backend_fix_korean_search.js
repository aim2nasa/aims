// ===============================================
// 🔧 백엔드 API 한글 검색 문제 수정 방안
// ===============================================
// 파일: /home/rossi/aims/backend/api/aims_api/server.js
// 위치: 라인 249-258 (기존 검색 로직)

// ❌ 기존 문제 코드:
/*
if (search) {
  query = {
    $or: [
      { 'upload.originalName': { $regex: search, $options: 'i' } },
      { 'meta.mime': { $regex: search, $options: 'i' } }
    ]
  };
}
*/

// ✅ 수정된 코드:
if (search) {
  console.log(`🔍 검색 요청 - 원본: "${search}"`);
  
  // 1. URL 디코딩 처리 (한글 인코딩 문제 해결)
  let decodedSearch;
  try {
    decodedSearch = decodeURIComponent(search);
    console.log(`📝 디코딩 완료: "${decodedSearch}"`);
  } catch (e) {
    console.warn(`⚠️ URL 디코딩 실패, 원본 사용: ${e.message}`);
    decodedSearch = search;
  }
  
  // 2. 유니코드 정규화 (한글 조합 문자 문제 해결)
  const normalizedSearch = decodedSearch.normalize('NFC');
  console.log(`🔄 정규화 완료: "${normalizedSearch}"`);
  
  // 3. 검색 조건 구성 (기존과 동일하지만 처리된 검색어 사용)
  query = {
    $or: [
      { 'upload.originalName': { $regex: normalizedSearch, $options: 'i' } },
      { 'meta.mime': { $regex: normalizedSearch, $options: 'i' } }
    ]
  };
  
  console.log(`🎯 MongoDB 쿼리:`, JSON.stringify(query, null, 2));
}

// ===============================================
// 🧪 테스트 방법
// ===============================================

// 1. 서버 재시작 후 다음 API 호출로 테스트:
// curl -s "http://tars.giize.com:3010/api/documents?search=캐치업&limit=5"
// curl -s "http://tars.giize.com:3010/api/documents?search=정관&limit=5"

// 2. 기대 결과:
// - "캐치업" 검색 시: 캐치업 관련 파일들이 결과에 나타나야 함
// - "정관" 검색 시: 정관_캐치업코리아.hwp 등이 결과에 나타나야 함

// 3. 로그 확인:
// - 서버 콘솔에서 "🔍 검색 요청", "📝 디코딩 완료" 등의 로그 확인
// - MongoDB 쿼리가 올바르게 구성되는지 확인

// ===============================================
// 📋 추가 개선 방안 (선택사항)
// ===============================================

// 더 강력한 한글 검색을 위한 추가 옵션:
if (search) {
  let decodedSearch;
  try {
    decodedSearch = decodeURIComponent(search);
  } catch (e) {
    decodedSearch = search;
  }
  
  const normalizedSearch = decodedSearch.normalize('NFC');
  
  // 부분 일치와 정확 일치 모두 지원
  const searchConditions = [
    { 'upload.originalName': { $regex: normalizedSearch, $options: 'i' } },
    { 'meta.mime': { $regex: normalizedSearch, $options: 'i' } }
  ];
  
  // 공백으로 구분된 여러 키워드 검색 지원
  const keywords = normalizedSearch.split(/\s+/).filter(k => k.length > 0);
  if (keywords.length > 1) {
    keywords.forEach(keyword => {
      searchConditions.push(
        { 'upload.originalName': { $regex: keyword, $options: 'i' } }
      );
    });
  }
  
  query = { $or: searchConditions };
}