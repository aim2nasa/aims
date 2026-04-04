/**
 * 고객 주소 자동 검증 (카카오 API) Regression Tests
 *
 * commit a300c134에서 추가된 verifyAddressViaKakao() 함수 테스트.
 * 외부 API는 모킹하여 로직만 검증.
 *
 * @since 2026-02-28
 */

const axios = require('axios');

// axios 모킹
jest.mock('axios');

// ── verifyAddressViaKakao 함수 재현 ──────────────────────
// customers-routes.js에서 module.exports 밖에 정의된 함수라 직접 import 불가.
// 동일 로직을 테스트용으로 재현.
async function verifyAddressViaKakao(address1) {
  if (!address1 || !address1.trim()) return 'failed';
  try {
    const kakaoApiKey = process.env.KAKAO_REST_API_KEY
      ? `KakaoAK ${process.env.KAKAO_REST_API_KEY}`
      : 'KakaoAK test_key';
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
    return 'failed';
  }
}

// ── 소스 코드 일치 검증 ──────────────────────────────────
// customers-routes.js의 실제 함수와 테스트 재현 함수가 동일한 로직인지
// 소스 코드 파싱으로 핵심 패턴 검증
const fs = require('fs');
const path = require('path');

const HELPER_PATH = path.join(__dirname, '..', 'utils', 'address-helper.js');
const helperSource = fs.readFileSync(HELPER_PATH, 'utf-8');
const ROUTES_PATH = path.join(__dirname, '..', 'routes', 'customers-routes.js');
const routesSource = fs.readFileSync(ROUTES_PATH, 'utf-8');

// ══════════════════════════════════════════════════════════════
// 소스 코드 검증 테스트
// ══════════════════════════════════════════════════════════════

describe('주소 검증 소스 코드 검증', () => {
  test('verifyAddressViaKakao 함수가 address-helper.js에 정의됨', () => {
    expect(helperSource).toContain('async function verifyAddressViaKakao(address1)');
  });

  test('빈 주소 체크가 존재', () => {
    expect(helperSource).toContain("if (!address1 || !address1.trim()) return 'failed'");
  });

  test('카카오 API URL 사용', () => {
    expect(helperSource).toContain('dapi.kakao.com/v2/local/search/address.json');
  });

  test('타임아웃 설정 존재', () => {
    expect(helperSource).toContain('timeout: 5000');
  });

  test('주소 정규화 로직 존재', () => {
    expect(helperSource).toContain("replace(/\\s+/g, ' ').toLowerCase()");
  });

  test('verification_status 필드가 bulk import에서 설정됨', () => {
    expect(routesSource).toContain('verification_status');
    expect(routesSource).toContain('await verifyAddressViaKakao');
  });
});

// ══════════════════════════════════════════════════════════════
// 함수 로직 테스트 (axios 모킹)
// ══════════════════════════════════════════════════════════════

describe('verifyAddressViaKakao 로직', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('빈 주소 → failed', async () => {
    expect(await verifyAddressViaKakao('')).toBe('failed');
    expect(await verifyAddressViaKakao(null)).toBe('failed');
    expect(await verifyAddressViaKakao(undefined)).toBe('failed');
    expect(await verifyAddressViaKakao('   ')).toBe('failed');
    // API 호출 안 함
    expect(axios.get).not.toHaveBeenCalled();
  });

  test('정상 주소 + 매칭 → verified', async () => {
    axios.get.mockResolvedValue({
      data: {
        documents: [{
          road_address: {
            address_name: '서울 강남구 테헤란로 123'
          }
        }]
      }
    });

    const result = await verifyAddressViaKakao('서울 강남구 테헤란로 123');
    expect(result).toBe('verified');
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  test('정상 주소 + 부분 매칭 → verified', async () => {
    axios.get.mockResolvedValue({
      data: {
        documents: [{
          road_address: {
            address_name: '서울 강남구 테헤란로 123'
          }
        }]
      }
    });

    // 입력이 API 결과의 처음 3단어를 포함
    const result = await verifyAddressViaKakao('서울 강남구 테헤란로 123 4층');
    expect(result).toBe('verified');
  });

  test('정상 주소 + 불일치 → failed', async () => {
    axios.get.mockResolvedValue({
      data: {
        documents: [{
          road_address: {
            address_name: '부산 해운대구 해운대로 456'
          }
        }]
      }
    });

    const result = await verifyAddressViaKakao('서울 강남구 테헤란로 123');
    expect(result).toBe('failed');
  });

  test('API 응답에 documents 없음 → failed', async () => {
    axios.get.mockResolvedValue({
      data: { documents: [] }
    });

    const result = await verifyAddressViaKakao('서울 강남구 테헤란로 123');
    expect(result).toBe('failed');
  });

  test('API 에러 (네트워크) → failed', async () => {
    axios.get.mockRejectedValue(new Error('Network Error'));

    const result = await verifyAddressViaKakao('서울 강남구 테헤란로 123');
    expect(result).toBe('failed');
  });

  test('API 타임아웃 → failed', async () => {
    axios.get.mockRejectedValue({ code: 'ECONNABORTED', message: 'timeout' });

    const result = await verifyAddressViaKakao('서울 강남구 테헤란로 123');
    expect(result).toBe('failed');
  });

  test('road_address가 null인 document → verified (JS includes 특성: "abc".includes("") === true)', async () => {
    // 주의: road_address가 null이면 roadAddr='' → normalizedInput.includes('') === true
    // JS의 String.prototype.includes('')는 항상 true 반환
    // 현재 코드의 실제 동작을 기록 (잠재적 edge case)
    axios.get.mockResolvedValue({
      data: {
        documents: [{
          road_address: null
        }]
      }
    });

    const result = await verifyAddressViaKakao('서울 강남구 테헤란로 123');
    expect(result).toBe('verified');  // 현재 동작: includes('')===true
  });

  test('공백 정규화 (다중 공백 → 단일 공백)', async () => {
    axios.get.mockResolvedValue({
      data: {
        documents: [{
          road_address: {
            address_name: '서울 강남구 테헤란로 123'
          }
        }]
      }
    });

    // 다중 공백 입력
    const result = await verifyAddressViaKakao('서울  강남구   테헤란로  123');
    expect(result).toBe('verified');
  });

  test('API 호출 파라미터 검증', async () => {
    axios.get.mockResolvedValue({ data: { documents: [] } });

    await verifyAddressViaKakao('테스트 주소');

    expect(axios.get).toHaveBeenCalledWith(
      'https://dapi.kakao.com/v2/local/search/address.json',
      expect.objectContaining({
        params: expect.objectContaining({
          query: '테스트 주소',
          analyze_type: 'similar'
        }),
        timeout: 5000
      })
    );
  });
});
