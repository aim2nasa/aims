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
  /** 고객 선택 콜백 */
  onCustomerSelect?: ((customerId: string) => void) | undefined
  /** 지도 높이 (기본값: 100%) */
  height?: string | number
  /** 선택 타임스탬프 (같은 고객 재선택 감지용) */
  selectionTimestamp?: number
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
  onCustomerSelect,
  height = '100%',
  selectionTimestamp = 0
}) => {
  const mapElement = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const markers = useRef<Map<string, any>>(new Map()) // customerId -> marker
  const [isMapReady, setIsMapReady] = useState(false)

  // Geocoding 캐시: 주소 → 좌표 매핑 (메모리에 저장하여 재사용)
  const geocodeCache = useRef<Map<string, { latitude: number; longitude: number }>>(new Map())

  // 마커 로딩 진행률 상태
  const [loadingProgress, setLoadingProgress] = useState<{ current: number; total: number } | null>(null)

  // 초기 지도 중심 좌표 (남한 전체 보기)
  const initialCenter = { lat: 36.5, lng: 127.5 }
  const initialZoom = 7

  // 지도 초기화
  useEffect(() => {
    if (!mapElement.current || !window.naver) {
      console.warn('[NaverMap] 지도 요소 또는 네이버 지도 API가 준비되지 않음')
      return
    }

    if (mapInstance.current) {
      return // 이미 초기화됨
    }

    // 남한 중심 좌표 (대전 부근 - 남한 전체가 균형있게 보이도록)
    const center = new window.naver.maps.LatLng(initialCenter.lat, initialCenter.lng)

    const mapOptions = {
      center: center,
      zoom: initialZoom, // 남한 전체가 보이는 줌 레벨
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

  // 고객 마커 생성 (customers가 변경될 때만)
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

    // Geocoding API로 주소 → 좌표 변환 후 마커 표시 (병렬 처리로 성능 최적화)
    const createMarkers = async () => {
      const totalCount = customersWithAddress.length

      if (import.meta.env.DEV) {
        console.log(`[NaverMap] 마커 생성 시작: ${totalCount}명의 고객`)
      }

      // 진행률 초기화
      setLoadingProgress({ current: 0, total: totalCount })

      // 지도의 현재 경계 가져오기
      const bounds = mapInstance.current.getBounds()

      // 1단계: 모든 Geocoding 요청을 병렬로 실행 (캐시 우선 사용)
      let completedCount = 0

      const geocodingTasks = customersWithAddress.map(async (customer) => {
        const address = customer.personal_info?.address?.address1
        if (!address || !customer._id) {
          completedCount++
          setLoadingProgress({ current: completedCount, total: totalCount })
          return null
        }

        // 캐시에서 먼저 확인
        let result = geocodeCache.current.get(address)

        if (result) {
          // 캐시 히트 - 즉시 반환
          completedCount++
          setLoadingProgress({ current: completedCount, total: totalCount })
          return { customer, result }
        }

        // 캐시 미스 - API 호출
        if (import.meta.env.DEV) {
          console.log(`[NaverMap] Geocoding API 요청: ${customer.personal_info?.name}`)
        }

        const apiResult = await geocodeAddress(address)

        // 진행률 업데이트
        completedCount++
        setLoadingProgress({ current: completedCount, total: totalCount })

        if (!apiResult) {
          if (import.meta.env.DEV) {
            console.warn(`[NaverMap] Geocoding 실패: ${customer.personal_info?.name}`)
          }
          return null
        }

        // 성공하면 캐시에 저장
        geocodeCache.current.set(address, apiResult)
        return { customer, result: apiResult }
      })

      // 모든 Geocoding 요청을 동시에 실행하고 결과 대기
      const geocodingResults = await Promise.all(geocodingTasks)

      // 진행률 완료 후 숨김 (약간의 딜레이 후)
      setTimeout(() => setLoadingProgress(null), 500)

      // 2단계: 성공한 결과들로 마커 생성
      for (const item of geocodingResults) {
        if (!item) continue

        const { customer, result } = item
        const position = new window.naver.maps.LatLng(result.latitude, result.longitude)

        // 지도 범위 밖이면 마커 생성하지 않음
        if (!bounds.hasLatLng(position)) {
          if (import.meta.env.DEV) {
            console.log(`[NaverMap] 범위 밖: ${customer.personal_info?.name} - 마커 생성 안 함`)
          }
          continue
        }

        const isSelected = customer._id === selectedCustomerId

        const marker = new window.naver.maps.Marker({
          position,
          map: mapInstance.current,
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

        // 마우스 hover 시 고객 이름 툴팁 표시
        const infoWindow = new window.naver.maps.InfoWindow({
          content: `<div style="
            padding: 8px 12px;
            background-color: rgba(0, 0, 0, 0.8);
            color: white;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            white-space: nowrap;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          ">${customer.personal_info?.name || '고객'}</div>`,
          borderWidth: 0,
          backgroundColor: 'transparent',
          disableAnchor: true,
          pixelOffset: new window.naver.maps.Point(0, -15)
        })

        // 마우스 hover 이벤트
        window.naver.maps.Event.addListener(marker, 'mouseover', () => {
          infoWindow.open(mapInstance.current, marker)
        })

        window.naver.maps.Event.addListener(marker, 'mouseout', () => {
          infoWindow.close()
        })

        // 마커 클릭 이벤트 - 고객 선택
        window.naver.maps.Event.addListener(marker, 'click', () => {
          if (onCustomerSelect && customer._id) {
            onCustomerSelect(customer._id)
            if (import.meta.env.DEV) {
              console.log(`[NaverMap] 마커 클릭: ${customer.personal_info?.name}`)
            }
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
  }, [customers, isMapReady])

  // 선택된 고객 변경 시 마커 아이콘 업데이트
  useEffect(() => {
    if (!isMapReady || !mapInstance.current || !window.naver || markers.current.size === 0) {
      return
    }

    // 모든 마커의 아이콘 업데이트
    markers.current.forEach((marker, customerId) => {
      const isSelected = customerId === selectedCustomerId

      marker.setIcon({
        content: `<div style="
          background-color: ${isSelected ? '#007AFF' : '#FF3B30'};
          width: ${isSelected ? '14px' : '10px'};
          height: ${isSelected ? '14px' : '10px'};
          border-radius: 50%;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        "></div>`,
        anchor: new window.naver.maps.Point(7, 7)
      })
    })

    if (import.meta.env.DEV) {
      console.log(`[NaverMap] 선택 상태 업데이트: ${selectedCustomerId}`)
    }
  }, [selectedCustomerId, isMapReady])

  // 선택된 고객으로 지도 이동
  // selectionTimestamp를 의존성에 추가하여 같은 고객 재선택도 감지
  useEffect(() => {
    if (!isMapReady || !mapInstance.current || !selectedCustomerId) {
      return
    }

    const selectedCustomer = customers.find(c => c._id === selectedCustomerId)
    if (!selectedCustomer?.personal_info?.address?.address1) {
      return
    }

    // Geocoding API로 주소 → 좌표 변환 후 지도 이동 (캐시 사용)
    const moveToCustomer = async () => {
      const address = selectedCustomer.personal_info?.address?.address1
      if (!address) return

      // 캐시에서 먼저 확인
      let result = geocodeCache.current.get(address)

      if (!result) {
        // 캐시에 없으면 API 호출
        const apiResult = await geocodeAddress(address)
        if (!apiResult) return

        // 성공하면 캐시에 저장
        geocodeCache.current.set(address, apiResult)
        result = apiResult
      }

      const position = new window.naver.maps.LatLng(result.latitude, result.longitude)
      mapInstance.current.setCenter(position)
      mapInstance.current.setZoom(15) // 확대

      if (import.meta.env.DEV) {
        console.log(`[NaverMap] 선택된 고객으로 이동: ${selectedCustomer.personal_info.name}`)
      }
    }

    moveToCustomer()
  }, [selectedCustomerId, customers, isMapReady, selectionTimestamp])

  // 지도를 초기 상태로 리셋
  const handleReset = () => {
    if (!mapInstance.current || !window.naver) return

    const center = new window.naver.maps.LatLng(initialCenter.lat, initialCenter.lng)
    mapInstance.current.setCenter(center)
    mapInstance.current.setZoom(initialZoom)

    if (import.meta.env.DEV) {
      console.log('[NaverMap] 지도를 초기 상태로 리셋')
    }
  }

  return (
    <div className="naver-map-wrapper" style={{ height }}>
      <div ref={mapElement} className="naver-map-container" style={{ width: '100%', height: '100%' }} />

      {/* 지도 로딩 중 */}
      {!isMapReady && (
        <div className="naver-map-loading">
          <span>지도 로딩 중...</span>
        </div>
      )}

      {/* 마커 로딩 프로그레스바 */}
      {loadingProgress && (
        <div className="naver-map-progress">
          <div className="naver-map-progress-bar">
            <div
              className="naver-map-progress-fill"
              style={{ width: `${(loadingProgress.current / loadingProgress.total) * 100}%` }}
            />
          </div>
          <div className="naver-map-progress-text">
            마커 로딩 중... {loadingProgress.current} / {loadingProgress.total}
          </div>
        </div>
      )}

      {/* 초기 위치로 복귀 버튼 */}
      {isMapReady && (
        <button
          className="naver-map-reset-button"
          onClick={handleReset}
          title="초기 위치로 이동"
          aria-label="지도 초기 위치로 이동"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M3 21v-5h5" />
          </svg>
        </button>
      )}
    </div>
  )
}

export default NaverMap
