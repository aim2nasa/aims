/**
 * NaverMap Component
 * @since 1.0.0
 *
 * 네이버 지도 API를 사용한 지도 컴포넌트
 * 애플 디자인 철학을 따르며, 고객 위치 표시 기능 제공
 */

import React, { useEffect, useRef, useState } from 'react'
import type { Customer } from '@/entities/customer/model'
import { geocodeAddress } from '@/shared/api/geocode'
import './NaverMap.css'

declare global {
  interface Window {
    naver: any
  }
}

interface NaverMapProps {
  /** 표시할 고객 목록 */
  customers?: Customer[]
  /** 선택된 고객 ID */
  selectedCustomerId?: string | null | undefined
  /** 지도 높이 (기본값: 100%) */
  height?: string | number
}

/**
 * NaverMap Component
 *
 * 네이버 Dynamic Map API를 사용하여 고객 위치를 지도에 표시합니다.
 * - 고객 주소를 기반으로 마커 표시 (주소만 있고 좌표가 없는 경우)
 * - 선택된 고객 위치로 자동 이동
 * - 애플 디자인 스타일의 마커와 인포윈도우
 *
 * @param props - NaverMap Props
 * @returns 렌더링된 지도 컴포넌트
 */
export const NaverMap: React.FC<NaverMapProps> = ({
  customers = [],
  selectedCustomerId = null,
  height = '100%'
}) => {
  const mapElement = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const markers = useRef<Map<string, any>>(new Map()) // customerId -> marker
  const [isMapReady, setIsMapReady] = useState(false)

  // 지도 초기화
  useEffect(() => {
    if (!mapElement.current || !window.naver) {
      console.warn('[NaverMap] 지도 요소 또는 네이버 지도 API가 준비되지 않음')
      return
    }

    if (mapInstance.current) {
      return // 이미 초기화됨
    }

    // 대한민국 중심 좌표 (서울)
    const center = new window.naver.maps.LatLng(37.5665, 126.9780)

    const mapOptions = {
      center: center,
      zoom: 7, // 대한민국 전체가 보이는 줌 레벨
      minZoom: 6,
      maxZoom: 18,
      zoomControl: true,
      zoomControlOptions: {
        position: window.naver.maps.Position.TOP_RIGHT
      },
      mapTypeControl: false,
      scaleControl: true,
      logoControl: false,
      mapDataControl: false
    }

    mapInstance.current = new window.naver.maps.Map(mapElement.current, mapOptions)
    setIsMapReady(true)

    if (import.meta.env.DEV) {
      console.log('[NaverMap] 지도 초기화 완료')
    }
  }, [])

  // 고객 마커 업데이트
  useEffect(() => {
    if (!isMapReady || !mapInstance.current || !window.naver) {
      return
    }

    // 기존 마커 제거
    markers.current.forEach(marker => marker.setMap(null))
    markers.current.clear()

    // 주소가 있는 고객만 필터링
    const customersWithAddress = customers.filter(c => c.personal_info?.address?.address1)

    if (customersWithAddress.length === 0) {
      if (import.meta.env.DEV) {
        console.log('[NaverMap] 주소가 있는 고객이 없습니다')
      }
      return
    }

    // Geocoding API로 주소 → 좌표 변환 후 마커 표시
    const createMarkers = async () => {
      if (import.meta.env.DEV) {
        console.log(`[NaverMap] 마커 생성 시작: ${customersWithAddress.length}명의 고객`)
      }

      for (const customer of customersWithAddress) {
        const address = customer.personal_info?.address?.address1
        if (!address || !customer._id) {
          if (import.meta.env.DEV) {
            console.log(`[NaverMap] 주소 없음: ${customer.personal_info?.name}`)
          }
          continue
        }

        if (import.meta.env.DEV) {
          console.log(`[NaverMap] Geocoding 요청: ${customer.personal_info?.name} - ${address}`)
        }

        const result = await geocodeAddress(address)

        if (import.meta.env.DEV) {
          console.log(`[NaverMap] Geocoding 결과:`, result)
        }

        if (!result) {
          if (import.meta.env.DEV) {
            console.warn(`[NaverMap] Geocoding 실패: ${customer.personal_info?.name}`)
          }
          continue
        }

        const position = new window.naver.maps.LatLng(result.latitude, result.longitude)

        const isSelected = customer._id === selectedCustomerId

        const marker = new window.naver.maps.Marker({
          position,
          map: mapInstance.current,
          title: customer.personal_info?.name || '고객',
          icon: {
            content: `<div style="
              background-color: ${isSelected ? '#007AFF' : '#FF3B30'};
              width: ${isSelected ? '14px' : '10px'};
              height: ${isSelected ? '14px' : '10px'};
              border-radius: 50%;
              border: 2px solid white;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            "></div>`,
            anchor: new window.naver.maps.Point(7, 7)
          }
        })

        markers.current.set(customer._id, marker)

        if (import.meta.env.DEV) {
          console.log(`[NaverMap] 마커 생성 완료: ${customer.personal_info?.name} (${result.latitude}, ${result.longitude})`)
        }
      }

      if (import.meta.env.DEV) {
        console.log(`[NaverMap] 총 ${markers.current.size}개의 마커 생성됨`)
      }
    }

    createMarkers().catch(error => {
      console.error('[NaverMap] 마커 생성 중 오류:', error)
    })
  }, [customers, isMapReady, selectedCustomerId])

  // 선택된 고객으로 지도 이동
  useEffect(() => {
    if (!isMapReady || !mapInstance.current || !selectedCustomerId) {
      return
    }

    const selectedCustomer = customers.find(c => c._id === selectedCustomerId)
    if (!selectedCustomer?.personal_info?.address?.address1) {
      return
    }

    // Geocoding API로 주소 → 좌표 변환 후 지도 이동
    const moveToCustomer = async () => {
      const address = selectedCustomer.personal_info?.address?.address1
      if (!address) return

      const result = await geocodeAddress(address)
      if (!result) return

      const position = new window.naver.maps.LatLng(result.latitude, result.longitude)
      mapInstance.current.setCenter(position)
      mapInstance.current.setZoom(15) // 확대

      if (import.meta.env.DEV) {
        console.log(`[NaverMap] 선택된 고객으로 이동: ${selectedCustomer.personal_info.name}`)
      }
    }

    moveToCustomer()
  }, [selectedCustomerId, customers, isMapReady])

  return (
    <div className="naver-map-wrapper" style={{ height }}>
      <div ref={mapElement} className="naver-map-container" style={{ width: '100%', height: '100%' }} />
      {!isMapReady && (
        <div className="naver-map-loading">
          <span>지도 로딩 중...</span>
        </div>
      )}
    </div>
  )
}

export default NaverMap
