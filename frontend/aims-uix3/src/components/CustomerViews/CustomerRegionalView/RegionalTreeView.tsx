/**
 * RegionalTreeView Component
 * 애플 스타일의 지역별 고객 트리 뷰 (커스텀 구현, antd 사용 안 함)
 *
 * @since 1.0.0
 * @example
 * ```tsx
 * <RegionalTreeView
 *   customers={customers}
 *   selectedCustomerId={selectedId}
 *   onCustomerSelect={handleSelect}
 *   loading={isLoading}
 * />
 * ```
 */
import React, { useState, useMemo, useEffect, useRef } from 'react'
import type { Customer } from '../../../entities/customer/model'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../SFSymbol'
import { usePersistedState } from '@/hooks/usePersistedState'
import Tooltip from '@/shared/ui/Tooltip'
import Button from '@/shared/ui/Button'
import { Dropdown, type DropdownOption } from '@/shared/ui/Dropdown'
import './RegionalTreeView.css'
import './CustomerRegionalView.mobile.css'
import { InitialFilterBar, calculateInitialCounts, filterByInitial, type InitialType } from '@/shared/ui/InitialFilterBar'
import NaverMap from '../../NaverMap/NaverMap'
import { CustomerAddressInputModal } from './CustomerAddressInputModal'
import { CustomerService } from '@/services/customerService'
import type { FormattedAddress } from '@/features/customer'
import { errorReporter } from '@/shared/lib/errorReporter'

/**
 * 광역시/도 이름 정규화 맵
 * 주소의 첫 단어를 표준 광역시/도 이름으로 변환
 */
const PROVINCE_NORMALIZATION_MAP: { [key: string]: string } = {
  // 특별시/광역시
  '서울': '서울특별시',
  '서울특별시': '서울특별시',
  '부산': '부산광역시',
  '부산광역시': '부산광역시',
  '대구': '대구광역시',
  '대구광역시': '대구광역시',
  '인천': '인천광역시',
  '인천광역시': '인천광역시',
  '광주': '광주광역시',
  '광주광역시': '광주광역시',
  '대전': '대전광역시',
  '대전광역시': '대전광역시',
  '울산': '울산광역시',
  '울산광역시': '울산광역시',

  // 특별자치시/도
  '세종': '세종특별자치시',
  '세종특별자치시': '세종특별자치시',
  '제주': '제주특별자치도',
  '제주특별자치도': '제주특별자치도',

  // 도
  '경기': '경기도',
  '경기도': '경기도',
  '강원': '강원특별자치도',
  '강원도': '강원특별자치도',
  '강원특별자치도': '강원특별자치도',
  '충북': '충청북도',
  '충청북도': '충청북도',
  '충남': '충청남도',
  '충청남도': '충청남도',
  '전북': '전북특별자치도',
  '전라북도': '전북특별자치도',
  '전북특별자치도': '전북특별자치도',
  '전남': '전라남도',
  '전라남도': '전라남도',
  '경북': '경상북도',
  '경상북도': '경상북도',
  '경남': '경상남도',
  '경상남도': '경상남도',
}

/**
 * 광역시/도 간략 표시명
 * 내부 키는 정식 명칭 유지, UI 표시만 간략화
 */
const PROVINCE_SHORT_NAME: { [key: string]: string } = {
  '서울특별시': '서울시',
  '부산광역시': '부산시',
  '대구광역시': '대구시',
  '인천광역시': '인천시',
  '광주광역시': '광주시',
  '대전광역시': '대전시',
  '울산광역시': '울산시',
  '세종특별자치시': '세종시',
  '경기도': '경기도',
  '강원특별자치도': '강원도',
  '충청북도': '충북',
  '충청남도': '충남',
  '전북특별자치도': '전북',
  '전라남도': '전남',
  '경상북도': '경북',
  '경상남도': '경남',
  '제주특별자치도': '제주도',
}

const getProvinceShortName = (province: string): string => {
  return PROVINCE_SHORT_NAME[province] || province
}

/**
 * 전체 한국 광역시/도 목록 (17개)
 * 드롭다운에 항상 표시될 전체 지역 목록
 */
const ALL_PROVINCES = [
  '서울특별시',
  '부산광역시',
  '대구광역시',
  '인천광역시',
  '광주광역시',
  '대전광역시',
  '울산광역시',
  '세종특별자치시',
  '경기도',
  '강원특별자치도',
  '충청북도',
  '충청남도',
  '전북특별자치도',
  '전라남도',
  '경상북도',
  '경상남도',
  '제주특별자치도',
]

/**
 * 각 광역시/도의 중심 좌표 (위도, 경도)
 * 지도 이동 시 사용 - 2024년 행정구역 기준 검증된 좌표
 */
const PROVINCE_CENTER_COORDS: { [key: string]: { lat: number; lng: number } } = {
  '서울특별시': { lat: 37.5665, lng: 126.9780 },
  '부산광역시': { lat: 35.1796, lng: 129.0756 },
  '대구광역시': { lat: 35.8714, lng: 128.6014 },
  '인천광역시': { lat: 37.4563, lng: 126.7052 },
  '광주광역시': { lat: 35.1595, lng: 126.8526 },
  '대전광역시': { lat: 36.3504, lng: 127.3845 },
  '울산광역시': { lat: 35.5384, lng: 129.3114 },
  '세종특별자치시': { lat: 36.4800, lng: 127.2890 },
  '경기도': { lat: 37.2750, lng: 127.0095 }, // 수정: 수원시 인근 (기존 좌표가 너무 동쪽)
  '강원특별자치도': { lat: 37.8228, lng: 128.1555 },
  '충청북도': { lat: 36.6357, lng: 127.4913 }, // 수정: 청주시 인근
  '충청남도': { lat: 36.5184, lng: 126.8000 },
  '전북특별자치도': { lat: 35.8200, lng: 127.1088 }, // 수정: 전주시 인근
  '전라남도': { lat: 34.8161, lng: 126.4631 }, // 수정: 무안군 인근 (전라남도청 이전)
  '경상북도': { lat: 36.5760, lng: 128.5056 }, // 수정: 안동시 인근 (경북도청 이전)
  '경상남도': { lat: 35.2383, lng: 128.6923 }, // 수정: 창원시 인근 (경남도청)
  '제주특별자치도': { lat: 33.4890, lng: 126.4983 },
}

/**
 * 주요 시/군/구의 중심 좌표
 * 구/군 선택 시 지도 이동에 사용
 * 형식: "지역명-구군명": { lat, lng }
 */
const DISTRICT_CENTER_COORDS: { [key: string]: { lat: number; lng: number } } = {
  // 서울특별시 25개 구
  '서울특별시-강남구': { lat: 37.5172, lng: 127.0473 },
  '서울특별시-강동구': { lat: 37.5301, lng: 127.1238 },
  '서울특별시-강북구': { lat: 37.6397, lng: 127.0256 },
  '서울특별시-강서구': { lat: 37.5509, lng: 126.8495 },
  '서울특별시-관악구': { lat: 37.4784, lng: 126.9516 },
  '서울특별시-광진구': { lat: 37.5384, lng: 127.0822 },
  '서울특별시-구로구': { lat: 37.4954, lng: 126.8874 },
  '서울특별시-금천구': { lat: 37.4568, lng: 126.8955 },
  '서울특별시-노원구': { lat: 37.6542, lng: 127.0568 },
  '서울특별시-도봉구': { lat: 37.6688, lng: 127.0471 },
  '서울특별시-동대문구': { lat: 37.5744, lng: 127.0396 },
  '서울특별시-동작구': { lat: 37.5124, lng: 126.9393 },
  '서울특별시-마포구': { lat: 37.5663, lng: 126.9019 },
  '서울특별시-서대문구': { lat: 37.5791, lng: 126.9368 },
  '서울특별시-서초구': { lat: 37.4837, lng: 127.0324 },
  '서울특별시-성동구': { lat: 37.5634, lng: 127.0368 },
  '서울특별시-성북구': { lat: 37.5894, lng: 127.0167 },
  '서울특별시-송파구': { lat: 37.5145, lng: 127.1059 },
  '서울특별시-양천구': { lat: 37.5170, lng: 126.8664 },
  '서울특별시-영등포구': { lat: 37.5264, lng: 126.8962 },
  '서울특별시-용산구': { lat: 37.5326, lng: 126.9905 },
  '서울특별시-은평구': { lat: 37.6027, lng: 126.9291 },
  '서울특별시-종로구': { lat: 37.5735, lng: 126.9792 },
  '서울특별시-중구': { lat: 37.5641, lng: 126.9979 },
  '서울특별시-중랑구': { lat: 37.6063, lng: 127.0925 },

  // 부산광역시 16개 구/군
  '부산광역시-강서구': { lat: 35.2121, lng: 128.9802 },
  '부산광역시-금정구': { lat: 35.2430, lng: 129.0923 },
  '부산광역시-기장군': { lat: 35.2446, lng: 129.2219 },
  '부산광역시-남구': { lat: 35.1362, lng: 129.0845 },
  '부산광역시-동구': { lat: 35.1295, lng: 129.0454 },
  '부산광역시-동래구': { lat: 35.2048, lng: 129.0837 },
  '부산광역시-부산진구': { lat: 35.1628, lng: 129.0532 },
  '부산광역시-북구': { lat: 35.1975, lng: 128.9907 },
  '부산광역시-사상구': { lat: 35.1522, lng: 128.9910 },
  '부산광역시-사하구': { lat: 35.1043, lng: 128.9748 },
  '부산광역시-서구': { lat: 35.0979, lng: 129.0246 },
  '부산광역시-수영구': { lat: 35.1454, lng: 129.1134 },
  '부산광역시-연제구': { lat: 35.1761, lng: 129.0816 },
  '부산광역시-영도구': { lat: 35.0914, lng: 129.0679 },
  '부산광역시-중구': { lat: 35.1066, lng: 129.0329 },
  '부산광역시-해운대구': { lat: 35.1631, lng: 129.1635 },

  // 대구광역시 8개 구/군
  '대구광역시-남구': { lat: 35.8463, lng: 128.5974 },
  '대구광역시-달서구': { lat: 35.8297, lng: 128.5326 },
  '대구광역시-달성군': { lat: 35.7747, lng: 128.4315 },
  '대구광역시-동구': { lat: 35.8869, lng: 128.6354 },
  '대구광역시-북구': { lat: 35.8858, lng: 128.5828 },
  '대구광역시-서구': { lat: 35.8718, lng: 128.5593 },
  '대구광역시-수성구': { lat: 35.8581, lng: 128.6308 },
  '대구광역시-중구': { lat: 35.8691, lng: 128.6060 },

  // 인천광역시 10개 구/군
  '인천광역시-강화군': { lat: 37.7467, lng: 126.4878 },
  '인천광역시-계양구': { lat: 37.5376, lng: 126.7378 },
  '인천광역시-남동구': { lat: 37.4475, lng: 126.7313 },
  '인천광역시-동구': { lat: 37.4738, lng: 126.6432 },
  '인천광역시-미추홀구': { lat: 37.4636, lng: 126.6505 },
  '인천광역시-부평구': { lat: 37.5070, lng: 126.7219 },
  '인천광역시-서구': { lat: 37.5452, lng: 126.6761 },
  '인천광역시-연수구': { lat: 37.4105, lng: 126.6782 },
  '인천광역시-옹진군': { lat: 37.4464, lng: 126.6367 },
  '인천광역시-중구': { lat: 37.4738, lng: 126.6216 },

  // 광주광역시 5개 구
  '광주광역시-광산구': { lat: 35.1397, lng: 126.7934 },
  '광주광역시-남구': { lat: 35.1327, lng: 126.9026 },
  '광주광역시-동구': { lat: 35.1460, lng: 126.9228 },
  '광주광역시-북구': { lat: 35.1740, lng: 126.9118 },
  '광주광역시-서구': { lat: 35.1519, lng: 126.8896 },

  // 대전광역시 5개 구
  '대전광역시-대덕구': { lat: 36.3469, lng: 127.4155 },
  '대전광역시-동구': { lat: 36.3504, lng: 127.4545 },
  '대전광역시-서구': { lat: 36.3556, lng: 127.3835 },
  '대전광역시-유성구': { lat: 36.3623, lng: 127.3567 },
  '대전광역시-중구': { lat: 36.3255, lng: 127.4212 },

  // 울산광역시 5개 구/군
  '울산광역시-남구': { lat: 35.5439, lng: 129.3300 },
  '울산광역시-동구': { lat: 35.5050, lng: 129.4163 },
  '울산광역시-북구': { lat: 35.5819, lng: 129.3614 },
  '울산광역시-울주군': { lat: 35.5221, lng: 129.1543 },
  '울산광역시-중구': { lat: 35.5694, lng: 129.3324 },

  // 세종특별자치시
  '세종특별자치시-세종시': { lat: 36.4800, lng: 127.2890 },

  // 경기도 주요 시
  '경기도-고양시': { lat: 37.6583, lng: 126.8320 },
  '경기도-수원시': { lat: 37.2636, lng: 127.0286 },
  '경기도-성남시': { lat: 37.4201, lng: 127.1262 },
  '경기도-용인시': { lat: 37.2410, lng: 127.1776 },
  '경기도-부천시': { lat: 37.5034, lng: 126.7660 },
  '경기도-안산시': { lat: 37.3219, lng: 126.8309 },
  '경기도-안양시': { lat: 37.3943, lng: 126.9568 },
  '경기도-남양주시': { lat: 37.6361, lng: 127.2166 },
  '경기도-화성시': { lat: 37.1989, lng: 126.8310 },
  '경기도-평택시': { lat: 36.9921, lng: 127.1129 },
  '경기도-의정부시': { lat: 37.7382, lng: 127.0337 },
  '경기도-시흥시': { lat: 37.3800, lng: 126.8031 },
  '경기도-파주시': { lat: 37.7599, lng: 126.7800 },
  '경기도-김포시': { lat: 37.6152, lng: 126.7158 },
  '경기도-광명시': { lat: 37.4786, lng: 126.8644 },
  '경기도-광주시': { lat: 37.4297, lng: 127.2551 },
  '경기도-군포시': { lat: 37.3617, lng: 126.9352 },
  '경기도-이천시': { lat: 37.2722, lng: 127.4349 },
  '경기도-양주시': { lat: 37.7852, lng: 127.0458 },
  '경기도-오산시': { lat: 37.1497, lng: 127.0773 },
  '경기도-구리시': { lat: 37.5942, lng: 127.1295 },
  '경기도-안성시': { lat: 37.0079, lng: 127.2797 },
  '경기도-포천시': { lat: 37.8947, lng: 127.2003 },
  '경기도-의왕시': { lat: 37.3449, lng: 126.9684 },
  '경기도-하남시': { lat: 37.5390, lng: 127.2149 },
  '경기도-여주시': { lat: 37.2980, lng: 127.6377 },
  '경기도-양평군': { lat: 37.4913, lng: 127.4874 },
  '경기도-동두천시': { lat: 37.9036, lng: 127.0606 },
  '경기도-과천시': { lat: 37.4289, lng: 126.9875 },
  '경기도-가평군': { lat: 37.8316, lng: 127.5095 },
  '경기도-연천군': { lat: 38.0965, lng: 127.0747 },
  // 강원도 주요 시/군
  '강원특별자치도-춘천시': { lat: 37.8813, lng: 127.7298 },
  '강원특별자치도-원주시': { lat: 37.3422, lng: 127.9201 },
  '강원특별자치도-강릉시': { lat: 37.7519, lng: 128.8761 },
  '강원특별자치도-동해시': { lat: 37.5246, lng: 129.1144 },
  '강원특별자치도-태백시': { lat: 37.1640, lng: 128.9856 },
  '강원특별자치도-속초시': { lat: 38.2070, lng: 128.5918 },
  '강원특별자치도-삼척시': { lat: 37.4500, lng: 129.1656 },
  // 충청북도 주요 시
  '충청북도-청주시': { lat: 36.6424, lng: 127.4890 },
  '충청북도-충주시': { lat: 36.9910, lng: 127.9260 },
  '충청북도-제천시': { lat: 37.1326, lng: 128.1910 },
  // 충청남도 주요 시
  '충청남도-천안시': { lat: 36.8151, lng: 127.1139 },
  '충청남도-공주시': { lat: 36.4465, lng: 127.1189 },
  '충청남도-보령시': { lat: 36.3334, lng: 126.6128 },
  '충청남도-아산시': { lat: 36.7898, lng: 127.0017 },
  '충청남도-서산시': { lat: 36.7847, lng: 126.4504 },
  '충청남도-논산시': { lat: 36.1870, lng: 127.0986 },
  '충청남도-계룡시': { lat: 36.2742, lng: 127.2479 },
  '충청남도-당진시': { lat: 36.8930, lng: 126.6473 },
  // 전북 주요 시
  '전북특별자치도-전주시': { lat: 35.8242, lng: 127.1480 },
  '전북특별자치도-군산시': { lat: 35.9677, lng: 126.7369 },
  '전북특별자치도-익산시': { lat: 35.9483, lng: 126.9575 },
  '전북특별자치도-정읍시': { lat: 35.5698, lng: 126.8560 },
  '전북특별자치도-남원시': { lat: 35.4163, lng: 127.3903 },
  '전북특별자치도-김제시': { lat: 35.8034, lng: 126.8809 },
  // 전남 주요 시
  '전라남도-목포시': { lat: 34.8118, lng: 126.3922 },
  '전라남도-여수시': { lat: 34.7604, lng: 127.6622 },
  '전라남도-순천시': { lat: 34.9507, lng: 127.4872 },
  '전라남도-나주시': { lat: 35.0160, lng: 126.7107 },
  '전라남도-광양시': { lat: 34.9406, lng: 127.6958 },
  // 경북 주요 시
  '경상북도-포항시': { lat: 36.0190, lng: 129.3435 },
  '경상북도-경주시': { lat: 35.8562, lng: 129.2247 },
  '경상북도-김천시': { lat: 36.1399, lng: 128.1137 },
  '경상북도-안동시': { lat: 36.5684, lng: 128.7294 },
  '경상북도-구미시': { lat: 36.1195, lng: 128.3445 },
  '경상북도-영주시': { lat: 36.8056, lng: 128.6240 },
  '경상북도-영천시': { lat: 35.9733, lng: 128.9386 },
  '경상북도-상주시': { lat: 36.4109, lng: 128.1590 },
  '경상북도-문경시': { lat: 36.5865, lng: 128.1867 },
  '경상북도-경산시': { lat: 35.8250, lng: 128.7414 },
  // 경남 주요 시
  '경상남도-창원시': { lat: 35.2280, lng: 128.6817 },
  '경상남도-진주시': { lat: 35.1800, lng: 128.1076 },
  '경상남도-통영시': { lat: 34.8544, lng: 128.4332 },
  '경상남도-사천시': { lat: 35.0037, lng: 128.0642 },
  '경상남도-김해시': { lat: 35.2286, lng: 128.8894 },
  '경상남도-밀양시': { lat: 35.5038, lng: 128.7467 },
  '경상남도-거제시': { lat: 34.8806, lng: 128.6217 },
  '경상남도-양산시': { lat: 35.3350, lng: 129.0374 },
  // 제주도
  '제주특별자치도-제주시': { lat: 33.4996, lng: 126.5312 },
  '제주특별자치도-서귀포시': { lat: 33.2541, lng: 126.5600 },
}

/**
 * 각 광역시/도의 전체 구/군 목록
 * "고객 없는 구/군 표시" 체크박스 활성화 시 사용
 */
const ALL_DISTRICTS: { [key: string]: string[] } = {
  '서울특별시': [
    '강남구', '강동구', '강북구', '강서구', '관악구',
    '광진구', '구로구', '금천구', '노원구', '도봉구',
    '동대문구', '동작구', '마포구', '서대문구', '서초구',
    '성동구', '성북구', '송파구', '양천구', '영등포구',
    '용산구', '은평구', '종로구', '중구', '중랑구'
  ],
  '부산광역시': [
    '강서구', '금정구', '기장군', '남구', '동구',
    '동래구', '부산진구', '북구', '사상구', '사하구',
    '서구', '수영구', '연제구', '영도구', '중구', '해운대구'
  ],
  '대구광역시': [
    '남구', '달서구', '달성군', '동구', '북구', '서구', '수성구', '중구'
  ],
  '인천광역시': [
    '강화군', '계양구', '남동구', '동구', '미추홀구',
    '부평구', '서구', '연수구', '옹진군', '중구'
  ],
  '광주광역시': [
    '광산구', '남구', '동구', '북구', '서구'
  ],
  '대전광역시': [
    '대덕구', '동구', '서구', '유성구', '중구'
  ],
  '울산광역시': [
    '남구', '동구', '북구', '울주군', '중구'
  ],
  '세종특별자치시': [
    '세종시'
  ],
  '경기도': [
    '가평군', '고양시', '과천시', '광명시', '광주시',
    '구리시', '군포시', '김포시', '남양주시', '동두천시',
    '부천시', '성남시', '수원시', '시흥시', '안산시',
    '안성시', '안양시', '양주시', '양평군', '여주시',
    '연천군', '오산시', '용인시', '의정부시', '이천시',
    '파주시', '평택시', '포천시', '하남시', '화성시', '의왕시'
  ],
  '강원특별자치도': [
    '강릉시', '고성군', '동해시', '삼척시', '속초시',
    '양구군', '양양군', '영월군', '원주시', '인제군',
    '정선군', '철원군', '춘천시', '태백시', '평창군',
    '홍천군', '화천군', '횡성군'
  ],
  '충청북도': [
    '괴산군', '단양군', '보은군', '영동군', '옥천군',
    '음성군', '제천시', '증평군', '진천군', '청주시', '충주시'
  ],
  '충청남도': [
    '계룡시', '공주시', '금산군', '논산시', '당진시',
    '보령시', '부여군', '서산시', '서천군', '아산시',
    '예산군', '천안시', '청양군', '태안군', '홍성군'
  ],
  '전북특별자치도': [
    '고창군', '군산시', '김제시', '남원시', '무주군',
    '부안군', '순창군', '완주군', '익산시', '임실군',
    '장수군', '전주시', '정읍시', '진안군'
  ],
  '전라남도': [
    '강진군', '고흥군', '곡성군', '광양시', '구례군',
    '나주시', '담양군', '목포시', '무안군', '보성군',
    '순천시', '신안군', '여수시', '영광군', '영암군',
    '완도군', '장성군', '장흥군', '진도군', '함평군',
    '해남군', '화순군'
  ],
  '경상북도': [
    '경산시', '경주시', '고령군', '구미시', '군위군',
    '김천시', '문경시', '봉화군', '상주시', '성주군',
    '안동시', '영덕군', '영양군', '영주시', '영천시',
    '예천군', '울릉군', '울진군', '의성군', '청도군',
    '청송군', '칠곡군', '포항시'
  ],
  '경상남도': [
    '거제시', '거창군', '고성군', '김해시', '남해군',
    '밀양시', '사천시', '산청군', '양산시', '의령군',
    '진주시', '창녕군', '창원시', '통영시', '하동군',
    '함안군', '함양군', '합천군'
  ],
  '제주특별자치도': [
    '서귀포시', '제주시'
  ]
}

/**
 * 광역시/도 이름 정규화 함수
 * @param rawCity - 주소에서 추출한 원본 광역시/도 이름
 * @returns 정규화된 광역시/도 이름
 */
const normalizeProvinceName = (rawCity: string): string => {
  return PROVINCE_NORMALIZATION_MAP[rawCity] || rawCity
}

/**
 * RegionalTreeView 컴포넌트 Props
 */
interface RegionalTreeViewProps {
  /** 표시할 고객 목록 */
  customers: Customer[]
  /** 현재 선택된 고객 ID */
  selectedCustomerId?: string | null
  /** 트리에서 고객 선택 시 호출되는 콜백 함수 (RightPane 열지 않음) */
  onCustomerSelect?: (customerId: string) => void
  /** 지도에서 고객 클릭 시 호출되는 콜백 함수 (RightPane 열기) */
  onCustomerClickFromMap?: (customerId: string) => void
  /** 로딩 상태 */
  loading?: boolean
  /** 새로고침 핸들러 */
  onRefresh?: () => void | Promise<void>
  /** 뷰 이동 핸들러 */
  onNavigate?: (viewKey: string) => void
  /** 고객 더블클릭 시 호출 (전체보기 이동) */
  onCustomerDoubleClick?: (customerId: string) => void
}

/**
 * 트리 노드 데이터 구조
 * @internal
 */
interface TreeNodeData {
  key: string
  label: string
  type: 'city' | 'district' | 'customer' | 'no-address'
  count?: number
  customers?: Customer[]
  children?: TreeNodeData[]
}

/**
 * RegionalTreeView Component
 *
 * 지역별 고객을 3단계 트리 구조(도시 → 구/군 → 고객)로 표시합니다.
 * 애플 디자인 철학(Progressive Disclosure)을 따르며,
 * React.memo를 통해 불필요한 리렌더링을 방지합니다.
 *
 * @param props - RegionalTreeView Props
 * @returns 렌더링된 지역별 트리 컴포넌트
 */
export const RegionalTreeView = React.memo<RegionalTreeViewProps>(({
  customers,
  selectedCustomerId,
  onCustomerSelect,
  onCustomerClickFromMap,
  loading = false,
  onRefresh,
  onNavigate,
  onCustomerDoubleClick
}) => {
  // F5 이후에도 트리 확장 상태 유지
  const [expandedKeys, setExpandedKeys] = usePersistedState<string[]>('customer-regional-expanded', ['no-address'])
  const expandedKeysSet = useMemo(() => new Set(expandedKeys), [expandedKeys])

  // 같은 고객 재선택을 감지하기 위한 타임스탬프
  const [selectionTimestamp, setSelectionTimestamp] = useState(0)

  // 로컬 선택된 고객 ID (지도 표시용, RightPane 열지 않음)
  const [localSelectedCustomerId, setLocalSelectedCustomerId] = useState<string | null>(null)

  // 고객 유형 필터 (F5 이후에도 유지)
  const [customerTypeFilter, setCustomerTypeFilter] = usePersistedState<'all' | 'personal' | 'corporate'>('customer-regional-type-filter', 'all')

  // 지역/구군 필터 (F5 이후에도 유지)
  const [selectedRegion, setSelectedRegion] = usePersistedState<string>('customer-regional-selected-region', '')
  const [selectedDistrict, setSelectedDistrict] = usePersistedState<string>('customer-regional-selected-district', '')

  // 고객 없는 지역/구군 표시 여부 (F5 이후에도 유지)
  const [showAllRegions, setShowAllRegions] = usePersistedState<boolean>('customer-regional-show-all-regions', false)
  const [showAllDistricts, setShowAllDistricts] = usePersistedState<boolean>('customer-regional-show-all-districts', false)

  // 초성 필터 상태 (F5 이후에도 유지)
  const [initialType, setInitialType] = usePersistedState<InitialType>('customer-regional-initial-type', 'korean')
  const [selectedInitial, setSelectedInitial] = usePersistedState<string | null>('customer-regional-selected-initial', null)

  // 지역 선택 시 지도 중심 좌표 (새로고침 시 초기화)
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null)

  // 주소 입력 모달 상태
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false)
  const [selectedCustomerForAddress, setSelectedCustomerForAddress] = useState<Customer | null>(null)
  const [isAddressModalForGeocodingFailure, setIsAddressModalForGeocodingFailure] = useState(false)

  // Geocoding 실패 고객 ID 목록 (지도에 표시 불가)
  const [geocodingFailedCustomers, setGeocodingFailedCustomers] = useState<Set<string>>(new Set())

  // 싱글클릭/더블클릭 구분을 위한 타이머
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current)
      }
    }
  }, [])

  // 1단계: 타입 필터만 적용된 고객 목록 (드롭다운 옵션 계산용)
  const typeFilteredCustomers = useMemo(() => {
    if (customerTypeFilter === 'personal') {
      return customers.filter(c => c.insurance_info?.customer_type !== '법인')
    } else if (customerTypeFilter === 'corporate') {
      return customers.filter(c => c.insurance_info?.customer_type === '법인')
    }
    return customers
  }, [customers, customerTypeFilter])

  // 2단계: 타입 + 지역/구군 필터 모두 적용된 최종 고객 목록
  const filteredCustomers = useMemo(() => {
    let result = typeFilteredCustomers

    // 지역/구군 필터 적용
    if (selectedRegion || selectedDistrict) {
      result = result.filter(c => {
        const address = c.personal_info?.address?.address1
        if (!address) return false

        const parts = address.split(' ')
        const rawCity = parts[0] || ''
        const district = parts[1] || ''
        const city = normalizeProvinceName(rawCity)

        // 지역 필터
        if (selectedRegion && city !== selectedRegion) return false

        // 구군 필터
        if (selectedDistrict && district !== selectedDistrict) return false

        return true
      })
    }

    return result
  }, [typeFilteredCustomers, selectedRegion, selectedDistrict])

  // 3단계: 초성 필터가 적용된 최종 고객 목록
  const initialFilteredCustomers = useMemo(() => {
    return filterByInitial(filteredCustomers, selectedInitial, (c) => c.personal_info?.name || '')
  }, [filteredCustomers, selectedInitial])

  // 초성 카운트 계산
  const initialCounts = useMemo(() => {
    return calculateInitialCounts(filteredCustomers, (c) => c.personal_info?.name || '')
  }, [filteredCustomers])

  // 드롭다운 옵션 계산 (체크박스에 따라 전체 또는 고객 있는 지역만)
  const availableRegions = useMemo<DropdownOption[]>(() => {
    // 고객이 실제로 등록된 지역 파악
    const registeredRegions = new Set<string>()
    typeFilteredCustomers.forEach(customer => {
      const address = customer.personal_info?.address?.address1
      if (address) {
        const parts = address.split(' ')
        const rawCity = parts[0] || ''
        const city = normalizeProvinceName(rawCity)
        if (city) {
          registeredRegions.add(city)
        }
      }
    })

    // showAllRegions에 따라 필터링
    const provinces = showAllRegions
      ? ALL_PROVINCES // 전체 지역 표시
      : ALL_PROVINCES.filter(province => registeredRegions.has(province)) // 고객 있는 지역만

    return [
      { value: '', label: '전체' },
      ...provinces.map(province => ({
        value: province,
        label: getProvinceShortName(province),
        // 체크박스 ON이면 모든 지역 선택 가능, OFF이면 고객 있는 지역만 표시되므로 항상 선택 가능
        disabled: false
      }))
    ]
  }, [typeFilteredCustomers, showAllRegions])

  const availableDistricts = useMemo<DropdownOption[]>(() => {
    if (!selectedRegion) {
      return [{ value: '', label: '전체 구/군' }]
    }

    // 선택된 지역의 구군 중 현재 필터에서 고객이 있는 곳 파악
    const activeDistricts = new Set<string>()
    typeFilteredCustomers.forEach(customer => {
      const address = customer.personal_info?.address?.address1
      if (address) {
        const parts = address.split(' ')
        const rawCity = parts[0] || ''
        const district = parts[1] || ''
        const city = normalizeProvinceName(rawCity)

        if (city === selectedRegion && district) {
          activeDistricts.add(district)
        }
      }
    })

    // showAllDistricts에 따라 표시할 구군 결정
    let districts: string[]
    if (showAllDistricts) {
      // 체크박스 ON: 해당 지역의 모든 행정구역 표시 (서울시 25개 구, 경기도 31개 시/군 등)
      districts = ALL_DISTRICTS[selectedRegion] || []
    } else {
      // 체크박스 OFF: 현재 필터에서 고객 있는 구군만
      districts = Array.from(activeDistricts).sort()
    }

    return [
      { value: '', label: '전체 구/군' },
      ...districts.map(district => ({
        value: district,
        label: district,
        // 체크박스 ON이면 모든 구/군 선택 가능, OFF이면 고객 있는 구/군만 표시되므로 항상 선택 가능
        disabled: false
      }))
    ]
  }, [typeFilteredCustomers, selectedRegion, showAllDistricts])

  // 지역별 그룹핑 - 정규화된 광역시/도 이름 사용
  const regionalGroups = useMemo(() => {
    const groups: { [city: string]: { [district: string]: Customer[] } } = {}
    const noAddressCustomers: Customer[] = []

    initialFilteredCustomers.forEach((customer) => {
      const address = customer.personal_info?.address?.address1
      if (!address) {
        noAddressCustomers.push(customer)
        return
      }
      // 선행 우편번호(5~6자리) 제거 후 파싱 (metdo 등 외부 소스 호환)
      const cleaned = address.replace(/^\d{5,6}\s+/, '')
      const parts = cleaned.split(' ')
      const rawCity = parts[0] || '기타'
      const district = parts[1] || '기타구'

      // 광역시/도 이름 정규화 (예: "경기" → "경기도")
      const city = normalizeProvinceName(rawCity)

      if (!groups[city]) groups[city] = {}
      if (!groups[city][district]) groups[city][district] = []
      groups[city][district].push(customer)
    })

    return { groups, noAddressCustomers }
  }, [initialFilteredCustomers])

  // 통계 계산
  const stats = useMemo(() => {
    const { groups, noAddressCustomers } = regionalGroups
    const citiesCount = Object.keys(groups).length
    const districtsCount = Object.values(groups).reduce(
      (sum, districts) => sum + Object.keys(districts).length, 0
    )

    // 개인/법인 고객 수 계산 (항상 전체 customers 기준 - AllCustomersView와 동일)
    const personalCount = customers.filter(c => c.insurance_info?.customer_type !== '법인').length
    const corporateCount = customers.filter(c => c.insurance_info?.customer_type === '법인').length
    const totalCustomers = customers.length

    return {
      totalCustomers,
      personalCount,
      corporateCount,
      citiesCount,
      districtsCount,
      noAddressCount: noAddressCustomers.length
    }
  }, [regionalGroups, customers])

  // selectedCustomerId가 변경될 때 해당 고객의 폴더 자동으로 펼치기
  useEffect(() => {
    if (!selectedCustomerId) return

    // 선택된 고객 찾기
    const selectedCustomer = customers.find(c => c._id === selectedCustomerId)
    if (!selectedCustomer) return

    const address = selectedCustomer.personal_info?.address?.address1
    if (address) {
      const parts = address.split(' ')
      const rawCity = parts[0] || ''
      const district = parts[1] || ''

      if (rawCity && district) {
        const city = normalizeProvinceName(rawCity)
        const districtKey = `${city}-${district}`

        // 시/도와 시/군/구 노드를 expandedKeys에 추가
        setExpandedKeys(prev => {
          const newSet = new Set(prev)
          newSet.add(city) // 시/도 펼치기
          newSet.add(districtKey) // 시/군/구 펼치기
          return Array.from(newSet)
        })
      }
      else {
        // 주소 없는 고객인 경우 - 주소 입력 모달 표시
        setSelectedCustomerForAddress(selectedCustomer)
        setIsAddressModalOpen(true)
        setExpandedKeys(prev => {
          const newSet = new Set(prev)
          newSet.add('no-address')
          return Array.from(newSet)
        })
        return // 모달에서 주소 입력 후 다시 처리
      }
    }
  }, [selectedCustomerId, customers])

  // 외부에서 selectedCustomerId가 변경되면 localSelectedCustomerId도 동기화
  useEffect(() => {
    if (selectedCustomerId) {
      setLocalSelectedCustomerId(selectedCustomerId)
    }
  }, [selectedCustomerId])

  // 필터 변경 핸들러
  /**
   * 선택된 지역/구군의 고객 분포를 분석하여 최적의 지도 뷰 계산
   * @param region 선택된 광역시/도
   * @param district 선택된 구/군 (빈 문자열이면 지역 전체)
   * @returns 최적의 지도 중심 좌표, 없으면 null
   */
  const calculateOptimalMapView = (region: string, district: string): { lat: number; lng: number } | null => {
    // 현재 필터에 맞는 고객들 중 선택된 지역/구군에 속하는 고객들만 필터링
    const relevantCustomers = typeFilteredCustomers.filter(customer => {
      const address = customer.personal_info?.address?.address1
      if (!address) return false

      const parts = address.split(' ')
      const rawCity = parts[0] || ''
      const customerDistrict = parts[1] || ''
      const city = normalizeProvinceName(rawCity)

      // 지역 필터
      if (region && city !== region) return false

      // 구/군 필터 (district가 빈 문자열이면 전체 구/군)
      if (district && customerDistrict !== district) return false

      return true
    })

    if (relevantCustomers.length === 0) {
      return null // 고객이 없으면 null 반환
    }

    // 고객들이 속한 구/군의 좌표 수집 (중복 제거)
    const uniqueDistricts = new Set<string>()
    relevantCustomers.forEach(customer => {
      const address = customer.personal_info?.address?.address1
      if (!address) return

      const parts = address.split(' ')
      const rawCity = parts[0] || ''
      const customerDistrict = parts[1] || ''
      const city = normalizeProvinceName(rawCity)

      const key = `${city}-${customerDistrict}`
      if (DISTRICT_CENTER_COORDS[key]) {
        uniqueDistricts.add(key)
      }
    })

    // 각 구/군의 좌표 수집
    const coordinates: Array<{ lat: number; lng: number }> = []
    uniqueDistricts.forEach(key => {
      if (DISTRICT_CENTER_COORDS[key]) {
        coordinates.push(DISTRICT_CENTER_COORDS[key])
      }
    })

    if (coordinates.length === 0) {
      return null // 좌표를 찾을 수 없으면 null 반환
    }

    // 모든 좌표의 평균 중심 계산
    const avgLat = coordinates.reduce((sum, coord) => sum + coord.lat, 0) / coordinates.length
    const avgLng = coordinates.reduce((sum, coord) => sum + coord.lng, 0) / coordinates.length

    return { lat: avgLat, lng: avgLng }
  }

  const handleTypeFilterChange = (filter: 'all' | 'personal' | 'corporate') => {
    setCustomerTypeFilter(filter)
  }

  const handleRegionChange = (region: string) => {
    setSelectedRegion(region)
    // 지역 변경 시 구군 선택 초기화
    setSelectedDistrict('')

    // 지역 선택 시 고객 분포 기반 최적 지도 뷰 계산
    if (region) {
      const optimalView = calculateOptimalMapView(region, '')
      if (optimalView) {
        setMapCenter(optimalView)
      } else if (PROVINCE_CENTER_COORDS[region]) {
        setMapCenter(PROVINCE_CENTER_COORDS[region])
      }
    } else {
      // 전체 지역 선택 시 중심 좌표 초기화
      setMapCenter(null)
    }
  }

  const handleDistrictChange = (district: string) => {
    setSelectedDistrict(district)

    // 구/군 선택 시 고객 분포 기반 최적 지도 뷰 계산
    if (district && selectedRegion) {
      const optimalView = calculateOptimalMapView(selectedRegion, district)
      if (optimalView) {
        setMapCenter(optimalView)
      } else {
        // 고객이 없으면 기본 좌표 사용
        const districtKey = `${selectedRegion}-${district}`
        if (DISTRICT_CENTER_COORDS[districtKey]) {
          setMapCenter(DISTRICT_CENTER_COORDS[districtKey])
        } else if (PROVINCE_CENTER_COORDS[selectedRegion]) {
          setMapCenter(PROVINCE_CENTER_COORDS[selectedRegion])
        }
      }
    } else {
      // 전체 구/군 선택 시 지역 전체 뷰
      if (selectedRegion) {
        const optimalView = calculateOptimalMapView(selectedRegion, '')
        if (optimalView) {
          setMapCenter(optimalView)
        } else if (PROVINCE_CENTER_COORDS[selectedRegion]) {
          setMapCenter(PROVINCE_CENTER_COORDS[selectedRegion])
        }
      }
    }
  }

  // 트리 데이터 생성
  const treeData = useMemo((): TreeNodeData[] => {
    const { groups, noAddressCustomers } = regionalGroups
    const nodes: TreeNodeData[] = []

    // 도시별 노드
    Object.keys(groups).sort().forEach(city => {
      const districts = groups[city] ?? {}
      const districtEntries = Object.entries(districts)

      const cityCustomers = districtEntries.reduce<Customer[]>((acc, [, list]) => {
        if (Array.isArray(list)) {
          acc.push(...list)
        }
        return acc
      }, [])

      const districtNodes: TreeNodeData[] = districtEntries
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([district, list]) => ({
          key: `${city}-${district}`,
          label: district,
          type: 'district' as const,
          count: Array.isArray(list) ? list.length : 0,
          customers: Array.isArray(list) ? list : []
        }))

      nodes.push({
        key: city,
        label: getProvinceShortName(city),
        type: 'city',
        count: cityCustomers.length,
        children: districtNodes
      })
    })

    // 주소 없는 고객 (최하단에 배치)
    if (noAddressCustomers.length > 0) {
      nodes.push({
        key: 'no-address',
        label: '주소 미입력',
        type: 'no-address',
        count: noAddressCustomers.length,
        customers: noAddressCustomers
      })
    }

    return nodes
  }, [regionalGroups])

  // 노드 확장/축소 토글
  const toggleNode = (key: string) => {
    setExpandedKeys(prev => {
      const newSet = new Set(prev)
      if (newSet.has(key)) {
        newSet.delete(key)
      } else {
        newSet.add(key)
      }
      return Array.from(newSet)
    })
  }

  // 싱글클릭 핸들러 (더블클릭과 구분하기 위해 딜레이)
  const handleCustomerClick = (customer: Customer) => {
    if (onCustomerSelect && customer._id) {
      // Geocoding 실패한 고객인 경우: 즉시 주소 수정 모달 열기
      if (geocodingFailedCustomers.has(customer._id)) {
        setSelectedCustomerForAddress(customer)
        setIsAddressModalForGeocodingFailure(true)
        setIsAddressModalOpen(true)
        return
      }

      // 주소 없는 고객인 경우: 즉시 주소 입력 모달 열기
      const address = customer.personal_info?.address?.address1
      if (!address) {
        setSelectedCustomerForAddress(customer)
        setIsAddressModalForGeocodingFailure(false)
        setIsAddressModalOpen(true)
        setExpandedKeys(prev => {
          const newSet = new Set(prev)
          newSet.add('no-address')
          return Array.from(newSet)
        })
        return
      }

      // 정상 고객: 300ms 딜레이 (더블클릭 구분)
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
      clickTimerRef.current = setTimeout(() => {
        // 해당 고객이 속한 폴더들을 자동으로 펼치기
        const parts = address.split(' ')
        const rawCity = parts[0] || ''
        const district = parts[1] || ''

        if (rawCity && district) {
          const city = normalizeProvinceName(rawCity)
          const districtKey = `${city}-${district}`

          setExpandedKeys(prev => {
            const newSet = new Set(prev)
            newSet.add(city)
            newSet.add(districtKey)
            return Array.from(newSet)
          })
        }

        // 로컬 선택 상태 업데이트 (지도 표시용)
        setLocalSelectedCustomerId(customer._id!)

        onCustomerSelect(customer._id!)
        setSelectionTimestamp(Date.now())
        clickTimerRef.current = null
      }, 300)
    }
  }

  // 더블클릭 핸들러 (싱글클릭 타이머 취소 후 전체보기)
  const handleCustomerDoubleClick = (customer: Customer) => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
    if (customer._id) {
      onCustomerDoubleClick?.(customer._id)
    }
  }

  // 주소 저장 핸들러
  const handleAddressSave = async (customerId: string, address: FormattedAddress) => {
    try {
      // 기존 고객 정보 찾기
      const customer = customers.find(c => c._id === customerId)
      if (!customer) {
        throw new Error('고객 정보를 찾을 수 없습니다')
      }

      // personal_info 병합 (기존 정보 유지하면서 주소만 업데이트)
      await CustomerService.updateCustomer(customerId, {
        personal_info: {
          ...customer.personal_info,
          address: {
            postal_code: address.postal_code,
            address1: address.address1,
            address2: address.address2
          }
        }
      })

      // 모달 닫기
      setIsAddressModalOpen(false)
      setSelectedCustomerForAddress(null)

      // 고객 목록 새로고침
      if (onRefresh) {
        await onRefresh()
      }
    } catch (error) {
      console.error('[RegionalTreeView] 주소 저장 실패:', error)
      errorReporter.reportApiError(error as Error, { component: 'RegionalTreeView.handleAddressSave' })
      throw error
    }
  }


  // 고객 타입 아이콘 (전체 보기와 동일한 SVG)
  const getCustomerTypeIcon = (customer: Customer) => {
    const customerType = customer.insurance_info?.customer_type
    if (customerType === '법인') {
      // 법인: 건물 아이콘
      return (
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="customer-icon--corporate">
          <circle cx="10" cy="10" r="10" opacity="0.2" />
          <path d="M6 5h2v2H6V5zm0 3h2v2H6V8zm0 3h2v2H6v-2zm3-6h2v2H9V5zm0 3h2v2H9V8zm0 3h2v2H9v-2zm3-6h2v2h-2V5zm0 3h2v2h-2V8zm0 3h2v2h-2v-2zM5 14h10v2H5v-2z" />
        </svg>
      )
    }
    // 개인: 사람 아이콘
    return (
      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="customer-icon--personal">
        <circle cx="10" cy="10" r="10" opacity="0.2" />
        <circle cx="10" cy="7" r="3" />
        <path d="M10 11c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
      </svg>
    )
  }

  // 재귀적 트리 렌더링
  const renderTreeNode = (node: TreeNodeData, level: number = 0): React.ReactNode => {
    const isExpanded = expandedKeysSet.has(node.key)
    const hasChildren = node.children && node.children.length > 0
    const hasCustomers = node.customers && node.customers.length > 0
    const isExpandable = hasChildren || hasCustomers

    return (
      <div key={node.key} className="tree-node-wrapper">
        <div
          className={`tree-node tree-node-${node.type} tree-node-level-${level}`}
          onClick={() => isExpandable && toggleNode(node.key)}
        >
          {/* 윈도우 탐색기 스타일: 확장/축소 표시 */}
          {isExpandable && (
            <SFSymbol
              name={isExpanded ? 'chevron-down' : 'chevron-right'}
              size={SFSymbolSize.CAPTION_1}
              weight={SFSymbolWeight.MEDIUM}
              className="tree-node-chevron"
            />
          )}
          {!isExpandable && <div className="tree-node-spacer" />}

          {/* 폴더 아이콘 (텍스트) */}
          <span className="tree-node-folder-icon">
            {node.type === 'city' || node.type === 'district'
              ? (isExpanded ? '📂' : '📁')
              : node.type === 'no-address'
              ? (
                <Tooltip content="주소가 입력되지 않은 고객 목록">
                  <span>⚠️</span>
                </Tooltip>
              )
              : ''}
          </span>

          <span className="tree-node-label">{node.label}</span>

          {node.count !== undefined && (
            <span className={`tree-node-badge badge-${node.type}`}>
              {node.count}
            </span>
          )}
        </div>

        {/* 자식 노드 (구/군) */}
        {hasChildren && isExpanded && (
          <div className="tree-node-children">
            {node.children!.map(child => renderTreeNode(child, level + 1))}
          </div>
        )}

        {/* 고객 목록 */}
        {hasCustomers && isExpanded && (
          <div className="tree-node-customers">
            {node.customers!.map(customer => {
              const isGeocodingFailed = customer._id ? geocodingFailedCustomers.has(customer._id) : false
              const hasNoAddress = !customer.personal_info?.address?.address1

              // 상황별 툴팁 내용 결정
              const tooltipContent = isGeocodingFailed
                ? '주소 형식 오류로 지도에 표시되지 않습니다. 클릭하여 수정하세요.'
                : hasNoAddress
                ? '주소를 입력하려면 클릭하세요'
                : '' // 정상 고객은 툴팁 없음

              const customerElement = (
                <div
                  className={`tree-customer-item tree-customer-item-level-${level + 1} ${(localSelectedCustomerId || selectedCustomerId) === customer._id ? 'selected' : ''} ${isGeocodingFailed ? 'geocoding-failed' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCustomerClick(customer)
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    handleCustomerDoubleClick(customer)
                  }}
                >
                  {getCustomerTypeIcon(customer)}
                  <span className="tree-customer-name">
                    {customer?.personal_info?.name ?? '이름 없음'}
                  </span>
                  {isGeocodingFailed && (
                    <span className="geocoding-failed-badge">⚠️</span>
                  )}
                </div>
              )

              // 툴팁이 필요한 경우에만 Tooltip으로 감싸기
              return tooltipContent ? (
                <Tooltip key={customer._id} content={tooltipContent}>
                  {customerElement}
                </Tooltip>
              ) : (
                <div key={customer._id}>
                  {customerElement}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // 로딩 상태
  if (loading) {
    return (
      <div className="regional-tree-view">
        <div className="regional-tree-loading">
          <SFSymbol name="arrow-clockwise" size={SFSymbolSize.TITLE_1} weight={SFSymbolWeight.MEDIUM} />
          <span>로딩 중...</span>
        </div>
      </div>
    )
  }

  // Empty State - 고객 데이터가 없을 때
  if (customers.length === 0) {
    return (
      <div className="regional-tree-view">
        <div className="regional-tree-empty">
          <SFSymbol name="person-3" size={SFSymbolSize.LARGE_TITLE} weight={SFSymbolWeight.LIGHT} />
          <h3 className="empty-title">등록된 고객이 없습니다</h3>
          <p className="empty-message">고객을 추가하면 지역별로 자동 분류됩니다.</p>
          {onNavigate && (
            <Button
              variant="primary"
              onClick={() => onNavigate('customers-register')}
              style={{ marginTop: '16px' }}
            >
              새 고객 등록
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="regional-tree-view">

      {/* 통계 - 클릭 가능한 필터 */}
      <div className="regional-tree-stats">
        <div className="stat-item">
          <span className="stat-icon">👥</span>
          <span className="stat-label">전체 고객</span>
          <div className="stat-filter-group">
            <button
              className={`type-filter-button ${customerTypeFilter === 'all' ? 'active' : ''}`}
              onClick={() => handleTypeFilterChange('all')}
            >
              {stats.totalCustomers}명
            </button>
            <span className="type-filter-separator">(</span>
            <button
              className={`type-filter-button ${customerTypeFilter === 'personal' ? 'active' : ''}`}
              onClick={() => handleTypeFilterChange('personal')}
            >
              개인 {stats.personalCount}
            </button>
            <span className="type-filter-separator">,</span>
            <button
              className={`type-filter-button ${customerTypeFilter === 'corporate' ? 'active' : ''}`}
              onClick={() => handleTypeFilterChange('corporate')}
            >
              법인 {stats.corporateCount}
            </button>
            <span className="type-filter-separator">)</span>
          </div>
        </div>
        <span className="stat-divider">·</span>
        <div className="stat-item">
          <span className="stat-icon">🗺️</span>
          <span className="stat-label">지역</span>
          <div className="stat-dropdown-group">
            <Dropdown
              value={selectedRegion}
              options={availableRegions}
              onChange={handleRegionChange}
              aria-label="지역 선택"
            />
            <Tooltip content="고객 없는 지역도 표시">
              <label className="stat-checkbox">
                <input
                  type="checkbox"
                  checked={showAllRegions}
                  onChange={(e) => setShowAllRegions(e.target.checked)}
                />
                <span className="stat-checkbox-label">빈 지역</span>
              </label>
            </Tooltip>
          </div>
        </div>
        <span className="stat-divider">·</span>
        <div className="stat-item">
          <span className="stat-icon">📍</span>
          <span className="stat-label">구/군</span>
          <div className="stat-dropdown-group">
            <Dropdown
              value={selectedDistrict}
              options={availableDistricts}
              onChange={handleDistrictChange}
              aria-label="구/군 선택"
            />
            <Tooltip content="고객 없는 구/군도 표시">
              <label className="stat-checkbox">
                <input
                  type="checkbox"
                  checked={showAllDistricts}
                  onChange={(e) => setShowAllDistricts(e.target.checked)}
                />
                <span className="stat-checkbox-label">빈 구/군</span>
              </label>
            </Tooltip>
          </div>
        </div>

        {/* 전체 보기 버튼 */}
        <div className="tree-actions">
          <Tooltip content="전체 보기">
            <button
              type="button"
              className="tree-action-btn tree-action-btn--icon-only"
              onClick={() => onRefresh?.()}
              disabled={loading}
              aria-label="전체 보기"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M1 6V1h5M15 6V1h-5M1 10v5h5M15 10v5h-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </Tooltip>
        </div>
      </div>

      {/* 왼쪽: 트리, 오른쪽: 지도 */}
      {/* 초성 필터 바 */}
      <InitialFilterBar
        initialType={initialType}
        onInitialTypeChange={setInitialType}
        selectedInitial={selectedInitial}
        onSelectedInitialChange={setSelectedInitial}
        initialCounts={initialCounts}
        countLabel="명"
        targetLabel="고객"
        className="regional-initial-filter"
      />

      <div className="regional-tree-content">
        {/* 지도 (모바일: DOM 순서대로 위에 표시, 데스크톱: CSS order로 오른쪽 배치) */}
        <div className="regional-map-container">
          <NaverMap
            customers={initialFilteredCustomers}
            selectedCustomerId={localSelectedCustomerId || selectedCustomerId}
            onCustomerSelect={(customerId: string) => {
              // 고객 ID로 고객 객체 찾기
              const customer = initialFilteredCustomers.find(c => c._id === customerId)
              if (customer) {
                // 로컬 상태 업데이트 및 폴더 자동 펼치기
                handleCustomerClick(customer)
                // 지도에서 클릭 시 RightPane 열기
                onCustomerClickFromMap?.(customerId)
              }
            }}
            selectionTimestamp={selectionTimestamp}
            center={mapCenter}
            selectedRegion={selectedRegion}
            selectedDistrict={selectedDistrict}
            height="100%"
            onGeocodingFailedCustomersChange={setGeocodingFailedCustomers}
          />
        </div>

        {/* 트리 (데스크톱: CSS order로 왼쪽 배치) */}
        <div className="regional-tree-container">
          {treeData.map(node => renderTreeNode(node))}
        </div>
      </div>
      {/* 주소 입력 모달 */}
      <CustomerAddressInputModal
        isOpen={isAddressModalOpen}
        customer={selectedCustomerForAddress}
        onClose={() => {
          setIsAddressModalOpen(false);
          setSelectedCustomerForAddress(null);
          setIsAddressModalForGeocodingFailure(false);
        }}
        onSave={handleAddressSave}
        isGeocodingFailure={isAddressModalForGeocodingFailure}
      />
    </div>
  )
}, (prevProps, nextProps) => {
  // 커스텀 비교 함수: 고객 목록 길이, 선택된 ID, 콜백 함수 비교
  return (
    prevProps.customers.length === nextProps.customers.length &&
    prevProps.selectedCustomerId === nextProps.selectedCustomerId &&
    prevProps.loading === nextProps.loading &&
    prevProps.onCustomerDoubleClick === nextProps.onCustomerDoubleClick
  )
})

RegionalTreeView.displayName = 'RegionalTreeView'

export default RegionalTreeView
