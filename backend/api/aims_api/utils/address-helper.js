/**
 * address-helper.js - 주소 검증/정규화 유틸리티
 *
 * customers-routes.js에서 추출된 공유 모듈
 * @since 2026-04-04
 */

const axios = require('axios');

/**
 * 카카오 API로 주소 자동 검증
 * @param {string} address1 - 도로명주소
 * @returns {Promise<'verified'|'failed'>} 검증 결과
 */
async function verifyAddressViaKakao(address1) {
  if (!address1 || !address1.trim()) return 'failed';
  try {
    const kakaoApiKey = process.env.KAKAO_REST_API_KEY
      ? `KakaoAK ${process.env.KAKAO_REST_API_KEY}`
      : 'KakaoAK 0e0db455dcbf09ba1309daad71af4174';
    const response = await axios.get('https://dapi.kakao.com/v2/local/search/address.json', {
      params: { query: address1.trim(), page: 1, size: 10, analyze_type: 'similar' },
      headers: { 'Authorization': kakaoApiKey },
      timeout: 5000
    });
    if (!response.data?.documents?.length) return 'failed';
    const normalizedInput = address1.trim().replace(/\s+/g, ' ').toLowerCase();
    return response.data.documents.some(doc => {
      const roadAddr = (doc.road_address?.address_name || '').toLowerCase();
      return roadAddr.includes(normalizedInput) ||
             normalizedInput.includes(roadAddr.split(' ').slice(0, 3).join(' '));
    }) ? 'verified' : 'failed';
  } catch (error) {
    console.error('[verifyAddressViaKakao] 검증 실패:', error.message);
    return 'failed';
  }
}

/**
 * 주소 문자열을 AIMS 주소 체계로 정규화
 * metdo 등 외부 소스에서 "06189 서울 강남구 도곡로93길 12" 형태로 들어오는 경우
 * → postal_code: "06189", address1: "서울 강남구 도곡로93길 12" 로 분리
 */
function normalizeAddress(rawAddress) {
  if (!rawAddress || typeof rawAddress !== 'string') return null;
  const trimmed = rawAddress.trim();
  if (!trimmed) return null;

  // 5~6자리 숫자 + 공백 + 나머지 → 우편번호 분리
  const match = trimmed.match(/^(\d{5,6})\s+(.+)/);
  if (match) {
    return { postal_code: match[1], address1: match[2] };
  }
  return { address1: trimmed };
}

module.exports = { verifyAddressViaKakao, normalizeAddress };
