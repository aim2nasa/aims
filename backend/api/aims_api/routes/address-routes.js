/**
 * address-routes.js - Address/Geocoding 라우트
 *
 * Phase 5: server.js 리팩토링
 * @since 2026-02-07
 */

const express = require('express');
const axios = require('axios');
const backendLogger = require('../lib/backendLogger');
const { utcNowISO } = require('../lib/timeUtils');

module.exports = function() {
  const router = express.Router();

  /**
   * 테스트용 간단한 주소 검색 엔드포인트
   */
  router.get('/address/test', async (req, res) => {
    console.log('\n🧪🧪🧪 === 테스트 엔드포인트 진입!!! ===');
    console.log('🧪 URL:', req.url);
    console.log('🧪 METHOD:', req.method);
    console.log('🧪 요청 파라미터:', JSON.stringify(req.query, null, 2));
    console.log('🧪🧪🧪 ========================\n');

    res.json({
      success: true,
      message: '테스트 엔드포인트가 정상적으로 작동합니다!',
      query: req.query,
      timestamp: utcNowISO()
    });
  });

  /**
   * 카카오 주소 검색 API 프록시 - 즉시 사용 가능, 고품질
   */
  router.get('/address/search', async (req, res) => {
    console.log('\n🎯🎯🎯 === 카카오 주소 검색 API 진입!!! ===');
    console.log('🎯 URL:', req.url);
    console.log('🎯 METHOD:', req.method);
    console.log('🎯 요청 파라미터:', JSON.stringify(req.query, null, 2));
    console.log('🎯🎯🎯 ========================\n');

    try {
      const { keyword, page = 1, size = 10 } = req.query;

      console.log(`📝 파싱된 값 - keyword: "${keyword}", page: ${page}, size: ${size}`);

      if (!keyword || keyword.trim() === '') {
        console.log('❌ 키워드 없음 - 400 에러 반환');
        return res.status(400).json({
          success: false,
          error: '검색어를 입력해주세요.'
        });
      }

      console.log(`🔍 카카오 API 호출 시작: "${keyword}"`);

      // 카카오 Local API (주소 검색)
      const kakaoApiKey = 'KakaoAK 0e0db455dcbf09ba1309daad71af4174';
      const apiUrl = 'https://dapi.kakao.com/v2/local/search/address.json';

      const response = await axios.get(apiUrl, {
        params: {
          query: keyword.trim(),
          page: page,
          size: size,
          analyze_type: 'similar'
        },
        headers: {
          'Authorization': kakaoApiKey,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });

      console.log(`📡 카카오 API 응답 상태: ${response.status}`);
      console.log(`📄 카카오 API 응답:`, JSON.stringify(response.data, null, 2));

      if (response.data && response.data.documents) {
        const documents = response.data.documents;
        const meta = response.data.meta || {};

        console.log(`✅ 검색 결과: ${documents.length}건`);
        console.log(`📊 전체 건수: ${meta.total_count || documents.length}건`);

        // 카카오 API 응답을 프론트엔드 형식에 맞게 변환
        const transformedResults = documents.map(item => {
          const address = item.address || {};
          const roadAddress = item.road_address || {};

          // 우편번호 다양한 필드에서 찾기
          const zipCode = roadAddress.zone_no ||
                         address.zip_code ||
                         roadAddress.postal_code ||
                         address.postal_code ||
                         roadAddress.zipcode ||
                         address.zipcode || '';

          return {
            roadAddr: roadAddress.address_name || address.address_name || '',
            roadAddrPart1: roadAddress.address_name || address.address_name || '',
            jibunAddr: address.address_name || '',
            zipNo: zipCode,
            siNm: roadAddress.region_1depth_name || address.region_1depth_name || '',
            sggNm: roadAddress.region_2depth_name || address.region_2depth_name || '',
            emdNm: roadAddress.region_3depth_name || address.region_3depth_name || '',
            rn: roadAddress.road_name || '',
            bdNm: roadAddress.building_name || '',
            building_name: roadAddress.building_name || address.building_name || '',
            main_building_no: roadAddress.main_building_no || address.main_address_no || '',
            sub_building_no: roadAddress.sub_building_no || address.sub_address_no || '',
            x: roadAddress.x || address.x || '',
            y: roadAddress.y || address.y || ''
          };
        });

        res.json({
          success: true,
          data: {
            results: transformedResults,
            total: meta.total_count || documents.length,
            page: parseInt(page),
            size: parseInt(size),
            totalPages: Math.ceil((meta.total_count || documents.length) / parseInt(size)),
            kakao_api: true,
            is_end: meta.is_end || false
          }
        });

      } else {
        console.log('❌ 카카오 API 응답에 documents가 없음');
        res.json({
          success: true,
          data: {
            results: [],
            total: 0,
            page: parseInt(page),
            size: parseInt(size),
            totalPages: 0,
            message: '검색 결과가 없습니다.',
            kakao_api: true
          }
        });
      }

    } catch (error) {
      console.error('🚨 카카오 주소 검색 API 오류:', error.message);
      console.error('🚨 오류 세부사항:', error.response?.data || error);
      backendLogger.error('Address', '카카오 주소 검색 API 오류', error);

      if (error.response?.status === 401) {
        console.error('🚨 인증 실패: API 키를 확인해주세요');
      } else if (error.response?.status === 400) {
        console.error('🚨 요청 파라미터 오류');
      }

      res.status(500).json({
        success: false,
        error: '주소 검색 중 오류가 발생했습니다.',
        details: error.message,
        api_error: true,
        kakao_error: error.response?.data || null
      });
    }
  });

  /**
   * 네이버 Geocoding API - 주소를 좌표로 변환
   */
  router.post('/geocode', async (req, res) => {
    try {
      const { address } = req.body;

      if (!address) {
        return res.status(400).json({
          success: false,
          error: '주소 정보가 필요합니다.'
        });
      }

      console.log(`🗺️ [Geocoding] 주소 → 좌표 변환 요청: "${address}"`);

      // 네이버 Geocoding API 호출
      const response = await axios.get('https://maps.apigw.ntruss.com/map-geocode/v2/geocode', {
        params: {
          query: address
        },
        headers: {
          'x-ncp-apigw-api-key-id': process.env.NAVER_MAP_ACCESS_KEY?.trim(),
          'x-ncp-apigw-api-key': process.env.NAVER_MAP_SECRET_KEY?.trim()
        },
        timeout: 5000
      });

      console.log(`📡 [Geocoding] 네이버 API 응답:`, JSON.stringify(response.data, null, 2));

      if (response.data && response.data.addresses && response.data.addresses.length > 0) {
        const firstResult = response.data.addresses[0];
        const latitude = parseFloat(firstResult.y);
        const longitude = parseFloat(firstResult.x);

        console.log(`✅ [Geocoding] 좌표 변환 성공: ${address} → (${latitude}, ${longitude})`);

        res.json({
          success: true,
          data: {
            address: address,
            latitude: latitude,
            longitude: longitude,
            roadAddress: firstResult.roadAddress || '',
            jibunAddress: firstResult.jibunAddress || '',
            addressElements: firstResult.addressElements || []
          }
        });
      } else {
        console.log(`⚠️ [Geocoding] 주소를 찾을 수 없음: ${address}`);
        res.json({
          success: false,
          error: '주소를 찾을 수 없습니다.',
          address: address
        });
      }
    } catch (error) {
      console.error('❌ [Geocoding] API 오류:', error.message);
      backendLogger.error('Geocoding', 'Geocoding API 오류', error);

      if (error.response?.status === 401) {
        console.error('🚨 [Geocoding] 인증 실패 - API 키 확인 필요');
      }

      res.status(500).json({
        success: false,
        error: '좌표 변환 중 오류가 발생했습니다.',
        details: error.message
      });
    }
  });

  return router;
};
