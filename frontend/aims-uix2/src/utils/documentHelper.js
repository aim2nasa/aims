/**
 * 문서 관련 유틸리티 함수들
 */

/**
 * 문서 객체에서 ID 추출
 * @param {Object} doc - 문서 객체
 * @returns {string|null} 문서 ID
 */
export const extractDocumentId = (doc) => {
  if (!doc) return null;
  return doc._id || doc.id || doc.payload?.doc_id || null;
};

/**
 * 파일 데이터에서 URL 생성
 * @param {Object} fileData - 파일 데이터 객체
 * @returns {string} 파일 URL
 */
export const processFileUrl = (fileData) => {
  if (!fileData?.upload?.destPath) return '';
  
  // destPath에서 /data를 제거하고, 올바른 도메인과 경로를 조합
  const correctPath = fileData.upload.destPath.replace('/data', '');
  return `https://tars.giize.com${correctPath}`;
};

/**
 * API 응답 데이터를 문서 객체로 변환
 * @param {Object} fileData - API 응답 데이터
 * @returns {Object} 변환된 문서 객체
 */
export const createDocumentObject = (fileData) => {
  return {
    ...fileData,
    fileUrl: processFileUrl(fileData),
  };
};