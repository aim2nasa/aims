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
  // 초기 지도 중심 좌표 (남한 전체 보기)
  const initialCenter = { lat: 36.5, lng: 127.5 }
  const initialZoom = 7

  const mapElement = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const markers = useRef<Map<string, any>>(new Map()) // customerId -> marker
  const [isMapReady, setIsMapReady] = useState(false)

  // Geocoding 캐시: 주소 → 좌표 매핑 (메모리에 저장하여 재사용)
  const geocodeCache = useRef<Map<string, { latitude: number; longitude: number }>>(new Map())

  // 마커 로딩 진행률 상태
  const [loadingProgress, setLoadingProgress] = useState<{ current: number; total: number } | null>(null)

  // 주소별 고객 그룹 정보 저장 (줌 변경 시 마커 업데이트용)
  const addressGroups = useRef<Map<string, Array<{ customer: Customer; result: { latitude: number; longitude: number } }>>>(new Map())

  // 현재 줌 레벨 (마커 디자인 결정용)
  const [currentZoom, setCurrentZoom] = useState<number>(initialZoom)

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

    // 줌 변경 이벤트 리스너
    window.naver.maps.Event.addListener(mapInstance.current, 'zoom_changed', () => {
      const zoom = mapInstance.current.getZoom()
      setCurrentZoom(zoom)
    })

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

      // 2단계: 주소별로 고객 그룹화 (address1 기준)
      addressGroups.current.clear()

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

        const address1 = customer.personal_info?.address?.address1 || ''
        if (!addressGroups.current.has(address1)) {
          addressGroups.current.set(address1, [])
        }
        addressGroups.current.get(address1)!.push({ customer, result })
      }

      // 3단계: 그룹별로 마커 생성
      const zoom = mapInstance.current.getZoom()
      const showNumbers = zoom >= 11 // 줌 레벨 11 이상일 때만 숫자 표시

      for (const [, group] of addressGroups.current.entries()) {
        if (!group[0]?.result) continue
        const { result } = group[0] // 첫 번째 고객의 좌표 사용
        const position = new window.naver.maps.LatLng(result.latitude, result.longitude)
        const isGrouped = group.length > 1

        // 그룹에 선택된 고객이 있는지 확인
        const hasSelectedCustomer = group.some(item => item.customer._id === selectedCustomerId)

        let markerContent: string
        let infoContent: string

        if (isGrouped) {
          // 그룹 마커: 줌 레벨에 따라 다른 디자인
          if (showNumbers) {
            // 줌 레벨 높음: 숫자 표시 (빨간색, 단일 고객과 동일 크기)
            markerContent = `<div style="
              width: 24px;
              height: 24px;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
            ">
              <div style="
                background-color: ${hasSelectedCustomer ? '#007AFF' : '#FF3B30'};
                width: 14px;
                height: 14px;
                border-radius: 50%;
                border: 2px solid white;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 8px;
                font-weight: 700;
                pointer-events: none;
              ">${group.length}</div>
            </div>`
          } else {
            // 줌 레벨 낮음: 이중 원 디자인 (빨간색, 단일 고객과 동일 크기)
            markerContent = `<div style="
              width: 24px;
              height: 24px;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
            ">
              <div style="
                background-color: ${hasSelectedCustomer ? '#007AFF' : '#FF3B30'};
                width: 10px;
                height: 10px;
                border-radius: 50%;
                border: 3px solid ${hasSelectedCustomer ? 'rgba(0, 122, 255, 0.3)' : 'rgba(255, 59, 48, 0.3)'};
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                pointer-events: none;
              "></div>
            </div>`
          }

          // 그룹 툴팁 (각 고객의 상세주소와 이름)
          const customerList = group.map(item => {
            const name = item.customer.personal_info?.name || '고객'
            const address2 = item.customer.personal_info?.address?.address2 || ''
            return `<div style="padding: 2px 0;">
              <span style="font-weight: 600;">${name}</span>
              ${address2 ? `<span style="color: #ccc; margin-left: 6px;">${address2}</span>` : ''}
            </div>`
          }).join('')

          infoContent = `<div style="
            padding: 10px 14px;
            background-color: rgba(0, 0, 0, 0.85);
            color: white;
            border-radius: 8px;
            font-size: 13px;
            max-width: 280px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.4);
          ">
            <div style="font-weight: 500; margin-bottom: 6px; color: #FF3B30;">${group.length}명의 고객</div>
            <div style="border-top: 1px solid rgba(255,255,255,0.2); padding-top: 6px;">
              ${customerList}
            </div>
          </div>`
        } else {
          // 단일 고객 마커 (기존 디자인)
          const customer = group[0]?.customer
          if (!customer) continue
          const isSelected = customer._id === selectedCustomerId

          markerContent = `<div style="
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
          ">
            <div style="
              background-color: ${isSelected ? '#007AFF' : '#FF3B30'};
              width: ${isSelected ? '14px' : '10px'};
              height: ${isSelected ? '14px' : '10px'};
              border-radius: 50%;
              border: 2px solid white;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
              pointer-events: none;
            "></div>
          </div>`

          const name = customer.personal_info?.name || '고객'
          const address2 = customer.personal_info?.address?.address2 || ''

          infoContent = `<div style="
            padding: 8px 12px;
            background-color: rgba(0, 0, 0, 0.8);
            color: white;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            white-space: nowrap;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          ">
            <span style="font-weight: 600;">${name}</span>
            ${address2 ? `<span style="color: #ccc; margin-left: 6px;">${address2}</span>` : ''}
          </div>`
        }

        const marker = new window.naver.maps.Marker({
          position,
          map: mapInstance.current,
          icon: {
            content: markerContent,
            anchor: new window.naver.maps.Point(12, 12)
          }
        })

        // 마우스 hover 시 툴팁 표시
        const infoWindow = new window.naver.maps.InfoWindow({
          content: infoContent,
          borderWidth: 0,
          backgroundColor: 'transparent',
          disableAnchor: true,
          pixelOffset: new window.naver.maps.Point(0, -15)
        })

        window.naver.maps.Event.addListener(marker, 'mouseover', () => {
          infoWindow.open(mapInstance.current, marker)
        })

        window.naver.maps.Event.addListener(marker, 'mouseout', () => {
          infoWindow.close()
        })

        // 마커 클릭 이벤트
        window.naver.maps.Event.addListener(marker, 'click', () => {
          if (onCustomerSelect) {
            if (isGrouped) {
              // 그룹 마커 클릭 시 첫 번째 고객 선택
              const firstCustomerId = group[0]?.customer?._id
              if (firstCustomerId) {
                onCustomerSelect(firstCustomerId)
                if (import.meta.env.DEV) {
                  console.log(`[NaverMap] 그룹 마커 클릭: ${group.length}명 중 첫 번째 고객 선택`)
                }
              }
            } else {
              // 단일 고객 마커 클릭
              const customerId = group[0]?.customer?._id
              if (customerId) {
                onCustomerSelect(customerId)
                if (import.meta.env.DEV) {
                  console.log(`[NaverMap] 마커 클릭: ${group[0]?.customer?.personal_info?.name}`)
                }
              }
            }
          }
        })

        // 그룹의 모든 고객 ID로 마커 저장
        for (const item of group) {
          if (item.customer._id) {
            markers.current.set(item.customer._id, marker)
          }
        }

        if (import.meta.env.DEV) {
          if (isGrouped) {
            console.log(`[NaverMap] 그룹 마커 생성 완료: ${group.length}명 (${result.latitude}, ${result.longitude})`)
          } else {
            console.log(`[NaverMap] 마커 생성 완료: ${group[0]?.customer?.personal_info?.name} (${result.latitude}, ${result.longitude})`)
          }
        }
      }

      if (import.meta.env.DEV) {
        console.log(`[NaverMap] 총 ${addressGroups.current.size}개의 마커 생성됨 (고객 ${markers.current.size}명)`)
      }
    }

    createMarkers().catch(error => {
      console.error('[NaverMap] 마커 생성 중 오류:', error)
    })
  }, [customers, isMapReady])

  // 줌 레벨 또는 선택된 고객 변경 시 마커 아이콘 업데이트
  useEffect(() => {
    if (!isMapReady || !mapInstance.current || !window.naver || addressGroups.current.size === 0) {
      return
    }

    const showNumbers = currentZoom >= 11
    const processedMarkers = new Set<any>()

    // 각 그룹별로 마커 업데이트
    for (const [, group] of addressGroups.current.entries()) {
      const isGrouped = group.length > 1
      const hasSelectedCustomer = group.some(item => item.customer._id === selectedCustomerId)

      // 그룹의 첫 번째 고객 마커 가져오기 (모든 고객이 같은 마커 공유)
      const firstCustomerId = group[0]?.customer?._id
      if (!firstCustomerId) continue

      const marker = markers.current.get(firstCustomerId)
      if (!marker || processedMarkers.has(marker)) continue

      processedMarkers.add(marker)

      let markerContent: string

      if (isGrouped) {
        // 그룹 마커: 줌 레벨에 따라 다른 디자인
        if (showNumbers) {
          // 줌 레벨 높음: 숫자 표시 (빨간색, 단일 고객과 동일 크기)
          markerContent = `<div style="
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
          ">
            <div style="
              background-color: ${hasSelectedCustomer ? '#007AFF' : '#FF3B30'};
              width: 14px;
              height: 14px;
              border-radius: 50%;
              border: 2px solid white;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-size: 8px;
              font-weight: 700;
              pointer-events: none;
            ">${group.length}</div>
          </div>`
        } else {
          // 줌 레벨 낮음: 이중 원 디자인 (빨간색, 단일 고객과 동일 크기)
          markerContent = `<div style="
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
          ">
            <div style="
              background-color: ${hasSelectedCustomer ? '#007AFF' : '#FF3B30'};
              width: 10px;
              height: 10px;
              border-radius: 50%;
              border: 3px solid ${hasSelectedCustomer ? 'rgba(0, 122, 255, 0.3)' : 'rgba(255, 59, 48, 0.3)'};
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
              pointer-events: none;
            "></div>
          </div>`
        }
      } else {
        // 단일 고객 마커
        const customer = group[0]?.customer
        if (!customer) continue
        const isSelected = customer._id === selectedCustomerId

        markerContent = `<div style="
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        ">
          <div style="
            background-color: ${isSelected ? '#007AFF' : '#FF3B30'};
            width: ${isSelected ? '14px' : '10px'};
            height: ${isSelected ? '14px' : '10px'};
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            pointer-events: none;
          "></div>
        </div>`
      }

      marker.setIcon({
        content: markerContent,
        anchor: new window.naver.maps.Point(12, 12)
      })
    }

    if (import.meta.env.DEV) {
      console.log(`[NaverMap] 마커 아이콘 업데이트: zoom=${currentZoom}, showNumbers=${showNumbers}, selected=${selectedCustomerId}`)
    }
  }, [selectedCustomerId, currentZoom, isMapReady])

  // 선택된 고객으로 지도 이동
  // selectionTimestamp를 의존성에 추가하여 같은 고객 재선택도 감지
  useEffect(() => {
    if (!isMapReady || !mapInstance.current) {
      return
    }

    // selectedCustomerId가 없으면 아무것도 안함
    if (!selectedCustomerId) {
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
      const map = mapInstance.current

      // RP가 열려있을 때만 사용자 지도 중앙으로 조정
      const tree = document.querySelector('.regional-tree-container')
      const rp = document.querySelector('.layout-rightpane-container')

      if (tree && rp) {
        const treeRect = tree.getBoundingClientRect()
        const rpRect = rp.getBoundingClientRect()

        // 사용자 지도 영역 계산 (Tree 오른쪽부터 RP 왼쪽까지)
        const userMapCenter = (treeRect.right + rpRect.left) / 2

        // 일단 기본 위치로 setCenter
        map.setCenter(position)
        map.setZoom(15)

        // setCenter 완료 후 실제 마커 위치 기반으로 조정
        setTimeout(() => {
          const mapContainer = map.getElement()
          const allDivs = mapContainer.querySelectorAll('div')
          let markerScreenX = null

          // 파란색 배경을 가진 div 찾기
          for (const div of allDivs) {
            const style = window.getComputedStyle(div)
            const bgColor = style.backgroundColor

            if (bgColor.includes('0, 122, 255') || bgColor.includes('rgb(0, 100')) {
              const rect = div.getBoundingClientRect()
              if (rect.width > 0 && rect.height > 0) {
                markerScreenX = rect.left + rect.width / 2
                break
              }
            }
          }

          if (markerScreenX) {
            const actualOffset = userMapCenter - markerScreenX

            if (Math.abs(actualOffset) > 5) {
              map.panBy(new window.naver.maps.Point(-actualOffset, 0))

              if (import.meta.env.DEV) {
                console.log(`[NaverMap] RP 열림: 마커 위치 조정`)
                console.log(`  사용자 지도 중앙: ${Math.round(userMapCenter)}px`)
                console.log(`  마커 실제 위치: ${Math.round(markerScreenX)}px`)
                console.log(`  panBy(${Math.round(-actualOffset)}, 0)`)
              }
            }
          }
        }, 300)
      } else {
        // RP 없으면 기본 동작
        map.setCenter(position)
        map.setZoom(15)
      }

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
