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
import Tooltip from '@/shared/ui/Tooltip'
import './NaverMap.css'

// Naver Maps API 타입 정의
interface NaverLatLng {
  lat(): number
  lng(): number
}

interface NaverPoint {
  x: number
  y: number
}

interface NaverBounds {
  hasLatLng(latlng: NaverLatLng): boolean
  extend(latlng: NaverLatLng): void
}

interface NaverProjection {
  fromCoordToOffset(latlng: NaverLatLng): NaverPoint
}

interface NaverMarker {
  setMap(map: NaverMap | null): void
  setIcon(icon: { content: string; anchor: NaverPoint }): void
}

interface NaverInfoWindow {
  open(map: NaverMap, marker: NaverMarker): void
  close(): void
}

interface NaverMap {
  getElement(): HTMLElement
  getBounds(): NaverBounds
  getCenter(): NaverLatLng
  setCenter(latlng: NaverLatLng): void
  getZoom(): number
  setZoom(zoom: number): void
  panBy(point: NaverPoint): void
  getProjection(): NaverProjection
  fitBounds(bounds: NaverBounds, options?: { top?: number; right?: number; bottom?: number; left?: number }): void
}

interface NaverMapsEvent {
  addListener(target: NaverMap | NaverMarker, eventName: string, listener: () => void): void
}

interface NaverMapsPosition {
  TOP_RIGHT: unknown
}

interface NaverMapsNamespace {
  maps: {
    LatLng: new (lat: number, lng: number) => NaverLatLng
    Point: new (x: number, y: number) => NaverPoint
    LatLngBounds: new (sw?: NaverLatLng, ne?: NaverLatLng) => NaverBounds
    Map: new (element: HTMLElement, options: unknown) => NaverMap
    Marker: new (options: {
      position: NaverLatLng
      map: NaverMap
      icon: { content: string; anchor: NaverPoint }
    }) => NaverMarker
    InfoWindow: new (options: {
      content: string
      borderWidth: number
      backgroundColor: string
      disableAnchor: boolean
      pixelOffset: NaverPoint
    }) => NaverInfoWindow
    Event: NaverMapsEvent
    Position: NaverMapsPosition
  }
}

declare global {
  interface Window {
    naver: NaverMapsNamespace
  }
}

// 컴포넌트 외부에 캐시 저장 (unmount되어도 유지)
const globalGeocodeCache = new Map<string, { latitude: number; longitude: number }>()
const globalCustomerDataCache = new Map<string, string>() // customerId -> address1

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
  /** 지도 중심 좌표 (지역 선택 시 이동) */
  center?: { lat: number; lng: number } | null
  /** 선택된 지역 (줌 레벨 결정용) */
  selectedRegion?: string | null
  /** 선택된 구/군 (줌 레벨 결정용) */
  selectedDistrict?: string | null
  /** Geocoding 실패 고객 ID 목록 변경 콜백 */
  onGeocodingFailedCustomersChange?: (customerIds: Set<string>) => void
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
  selectionTimestamp = 0,
  center = null,
  selectedRegion = null,
  selectedDistrict = null,
  onGeocodingFailedCustomersChange
}) => {
  // 초기 지도 중심 좌표 (제주도 포함 남한 전체 보기)
  const initialCenter = { lat: 36.0, lng: 127.5 }
  const initialZoom = 7

  const mapElement = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<NaverMap | null>(null)
  const markers = useRef<Map<string, NaverMarker>>(new Map()) // customerId -> marker
  const [isMapReady, setIsMapReady] = useState(false)

  // 마커 로딩 진행률 상태
  const [loadingProgress, setLoadingProgress] = useState<{ current: number; total: number } | null>(null)

  // 주소별 고객 그룹 정보 저장 (줌 변경 시 마커 업데이트용)
  const addressGroups = useRef<Map<string, Array<{ customer: Customer; result: { latitude: number; longitude: number } }>>>(new Map())

  // 현재 줌 레벨 (마커 디자인 결정용)
  const [currentZoom, setCurrentZoom] = useState<number>(initialZoom)

  // 선택된 고객 위치 저장 (지도 크기 변경 시 중앙 유지용)
  const selectedCustomerPosition = useRef<{ lat: number; lng: number } | null>(null)

  // RightPane 열림 감지 플래그 (한 번만 실행)
  const hasAdjustedForRightPane = useRef<boolean>(false)

  // RightPane 애니메이션 타이머 ID
  const rightPaneAnimationTimeoutId = useRef<NodeJS.Timeout | null>(null)

  // RightPane 열림 시점의 지도 상태 저장 (닫힘 시 복원)
  const mapStateBeforeRightPane = useRef<{
    center: { lat: number; lng: number } | null
    zoom: number | null
  }>({ center: null, zoom: null })

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

    // ⭐⭐⭐ 하얀 공백 제거: 지도 생성 직후 다중 시도로 viewport 강제 재계산
    const forceMapResize = () => {
      if (!mapInstance.current) return
      window.dispatchEvent(new Event('resize'))
      mapInstance.current.setCenter(center)
      mapInstance.current.setZoom(initialZoom)
    }

    // 즉시 실행
    setTimeout(forceMapResize, 0)
    // 50ms 후 재시도
    setTimeout(forceMapResize, 50)
    // 100ms 후 최종 확인
    setTimeout(() => {
      forceMapResize()
      if (import.meta.env.DEV) {
        console.log('[NaverMap] ⭐ viewport 재설정 완료 - 하얀 공백 제거')
      }
    }, 100)

    setIsMapReady(true)

    // 줌 변경 이벤트 리스너
    window.naver.maps.Event.addListener(mapInstance.current, 'zoom_changed', () => {
      if (!mapInstance.current) return
      const zoom = mapInstance.current.getZoom()
      setCurrentZoom(zoom)
    })

    if (import.meta.env.DEV) {
      console.log('[NaverMap] 지도 초기화 완료')
    }
  }, [])

  // ⭐⭐⭐ 지도 컨테이너 크기 변경 감지 및 중앙 유지 (ResizeObserver)
  useEffect(() => {
    if (!mapElement.current || !mapInstance.current || !window.naver) {
      return
    }

    let resizeTimeout: NodeJS.Timeout

    const resizeObserver = new ResizeObserver(() => {
      // 디바운싱: 리사이즈 이벤트가 멈춘 후 100ms 뒤에 실행
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        if (!mapInstance.current || !window.naver) {
          return
        }

        // 선택된 고객 위치가 있으면 그 위치로, 없으면 현재 중심으로
        let centerToUse
        if (selectedCustomerPosition.current) {
          centerToUse = new window.naver.maps.LatLng(
            selectedCustomerPosition.current.lat,
            selectedCustomerPosition.current.lng
          )
        } else {
          centerToUse = mapInstance.current.getCenter()
        }

        // 현재 줌 레벨 저장
        const currentZoom = mapInstance.current.getZoom()

        // 지도 중심 위치 재설정 (viewport 재계산 트리거)
        mapInstance.current.setCenter(centerToUse)
        mapInstance.current.setZoom(currentZoom)

        // 네이버 지도 API에 명시적으로 resize 이벤트 전달 (렌더링 강제)
        setTimeout(() => {
          if (mapInstance.current) {
            window.dispatchEvent(new Event('resize'))
          }
        }, 50)

        if (import.meta.env.DEV) {
          console.log('[NaverMap] ⭐ 지도 컨테이너 크기 변경 감지 - 중앙 유지 및 재렌더링')
          if (selectedCustomerPosition.current) {
            console.log(`[NaverMap] 선택된 고객 위치로 중앙 유지: (${selectedCustomerPosition.current.lat}, ${selectedCustomerPosition.current.lng})`)
          }
        }
      }, 100)
    })

    resizeObserver.observe(mapElement.current)

    return () => {
      resizeObserver.disconnect()
      clearTimeout(resizeTimeout)
    }
  }, [isMapReady])

  // ⭐⭐⭐ RightPane 열림/닫힘 감지 및 지도 조정
  useEffect(() => {
    if (!mapElement.current || !mapInstance.current) {
      return
    }

    // RightPane DOM 요소 관찰 (absolute positioning이므로 직접 관찰)
    const rp = document.querySelector('.layout-rightpane-container')
    if (!rp) {
      return
    }

    const resizeObserver = new ResizeObserver(() => {
      if (!mapInstance.current || !window.naver) {
        return
      }

      const rpRect = rp.getBoundingClientRect()
      const currentRPWidth = rpRect.width

      if (import.meta.env.DEV) {
        console.log(`[NaverMap] ResizeObserver 실행: RightPane width=${Math.round(currentRPWidth)}px, hasAdjusted=${hasAdjustedForRightPane.current}`)
      }

      // RightPane이 열렸으면 (width가 200px 이상) 그리고 아직 조정하지 않았으면
      if (currentRPWidth > 200 && !hasAdjustedForRightPane.current) {
        hasAdjustedForRightPane.current = true

        if (import.meta.env.DEV) {
          console.log(`[NaverMap] RightPane 열림 감지! width=${Math.round(currentRPWidth)}px`)
        }

        // 현재 지도 상태 저장 (RightPane 닫을 때 복원용)
        const map = mapInstance.current
        if (map) {
          const center = map.getCenter()
          const zoom = map.getZoom()

          mapStateBeforeRightPane.current = {
            center: { lat: center.lat(), lng: center.lng() },
            zoom
          }

          if (import.meta.env.DEV) {
            console.log(`[NaverMap] 지도 상태 저장: center=(${center.lat()}, ${center.lng()}), zoom=${zoom}`)
          }
        }

        // 500ms 후 마커 위치 조정 (RightPane 애니메이션 완료 대기)
        setTimeout(() => {
          if (!mapInstance.current || !window.naver) {
            return
          }

          // selectedCustomerId로부터 위치 재계산
          const currentCenter = mapInstance.current.getCenter()
          if (!currentCenter) {
            return
          }

          const tree = document.querySelector('.regional-tree-container')
          const rpNow = document.querySelector('.layout-rightpane-container')

          if (!tree || !rpNow) {
            return
          }

          const treeRect = tree.getBoundingClientRect()
          const rpRectNow = rpNow.getBoundingClientRect()

          // RightPane이 실제로 열려있는지 확인
          if (rpRectNow.width < 200) {
            return
          }

          // 사용자 지도 영역 중앙 계산 (Tree 오른쪽 ~ RP 왼쪽)
          const userMapCenter = (treeRect.right + rpRectNow.left) / 2

          // Naver Maps API Projection을 사용하여 마커의 화면상 위치 계산
          const map = mapInstance.current
          const projection = map.getProjection()
          const markerLatLng = currentCenter // 현재 지도 중심 사용
          const markerPoint = projection.fromCoordToOffset(markerLatLng)

          // 지도 컨테이너의 화면상 위치
          const mapContainer = map.getElement()
          const mapRect = mapContainer.getBoundingClientRect()

          // 마커의 절대 화면 좌표 (viewport 기준)
          const markerScreenX = mapRect.left + markerPoint.x

          // offset 계산 및 조정
          const offset = userMapCenter - markerScreenX

          if (Math.abs(offset) > 5) {
            map.panBy(new window.naver.maps.Point(-offset, 0))

            // 플래그 설정: RightPane 열림으로 지도 조정했음
            hasAdjustedForRightPane.current = true

            if (import.meta.env.DEV) {
              console.log(`[NaverMap] RightPane 열림 감지 - 마커 위치 조정`)
              console.log(`  RightPane width: ${Math.round(currentRPWidth)}px`)
              console.log(`  사용자 지도 중앙: ${Math.round(userMapCenter)}px`)
              console.log(`  마커 화면 위치: ${Math.round(markerScreenX)}px`)
              console.log(`  panBy(${Math.round(-offset)}, 0)`)
            }
          }
        }, 500)
      }

      // RightPane이 닫혔으면 플래그 리셋 + 저장된 지도 상태로 복원
      if (currentRPWidth < 50 && hasAdjustedForRightPane.current) {
        hasAdjustedForRightPane.current = false

        if (import.meta.env.DEV) {
          console.log(`[NaverMap] RightPane 닫힘 감지! width=${Math.round(currentRPWidth)}px`)
        }

        // 기존 애니메이션 타이머 취소 (있다면)
        if (rightPaneAnimationTimeoutId.current) {
          clearTimeout(rightPaneAnimationTimeoutId.current)
          rightPaneAnimationTimeoutId.current = null
        }

        // 저장된 지도 상태
        const savedState = mapStateBeforeRightPane.current

        if (import.meta.env.DEV) {
          console.log(`[NaverMap] 저장된 지도 상태: center=${JSON.stringify(savedState.center)}, zoom=${savedState.zoom}`)
        }

        // 300ms 후 저장된 지도 상태로 복원 (RightPane 애니메이션 중반부터 시작하여 부드러운 동기화)
        rightPaneAnimationTimeoutId.current = setTimeout(() => {
          try {
            const map = mapInstance.current

            if (!map || !window.naver) {
              return
            }

            if (!savedState.center || savedState.zoom === null) {
              if (import.meta.env.DEV) {
                console.log('[NaverMap] 저장된 지도 상태가 없어서 복원 생략')
              }
              return
            }

            // 저장된 중심과 줌으로 복원
            const savedCenter = new window.naver.maps.LatLng(savedState.center.lat, savedState.center.lng)
            map.setCenter(savedCenter)
            map.setZoom(savedState.zoom)

            if (import.meta.env.DEV) {
              console.log(`[NaverMap] 지도 상태 복원 완료: center=(${savedState.center.lat}, ${savedState.center.lng}), zoom=${savedState.zoom}`)
            }

            rightPaneAnimationTimeoutId.current = null
          } catch (error) {
            if (import.meta.env.DEV) {
              console.error('[NaverMap] ❌ 지도 상태 복원 중 예외 발생:', error)
            }
          }
        }, 300)
      }
    })

    resizeObserver.observe(rp)

    return () => {
      resizeObserver.disconnect()
    }
  }, [isMapReady])

  // 고객 마커 생성 (customers가 변경될 때만)
  useEffect(() => {
    if (!isMapReady || !mapInstance.current || !window.naver) {
      return
    }

    // 고객 목록이 실제로 변경되었는지 확인 (최적화)
    // ID와 주소를 함께 비교하여 주소 변경, 고객 추가/삭제 모두 감지
    const currentCustomerData = new Map<string, string>()
    customers.forEach(c => {
      if (c._id) {
        currentCustomerData.set(c._id, c.personal_info?.address?.address1 || '')
      }
    })

    let hasChanged = currentCustomerData.size !== globalCustomerDataCache.size

    if (!hasChanged) {
      // 크기가 같으면 각 고객의 주소가 변경되었는지 확인
      for (const [id, address] of currentCustomerData.entries()) {
        if (globalCustomerDataCache.get(id) !== address) {
          hasChanged = true
          if (import.meta.env.DEV) {
            console.log(`[NaverMap] 주소 변경 감지: ${id} (${globalCustomerDataCache.get(id)} → ${address})`)
          }
          break
        }
      }
    }

    // 고객 목록 캐시 업데이트
    globalCustomerDataCache.clear()
    currentCustomerData.forEach((address, id) => {
      globalCustomerDataCache.set(id, address)
    })

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

      // 진행률 초기화 (캐싱 사용 시에는 표시하지 않음)
      if (hasChanged) {
        setLoadingProgress({ current: 0, total: totalCount })
      } else {
        if (import.meta.env.DEV) {
          console.log('[NaverMap] ⚡ 캐싱된 Geocoding 데이터 사용 - 로딩 메시지 없이 빠른 마커 생성')
        }
      }

      // 1단계: 모든 Geocoding 요청을 병렬로 실행 (캐시 우선 사용)
      if (!mapInstance.current) return
      let completedCount = 0

      const geocodingTasks = customersWithAddress.map(async (customer) => {
        const address = customer.personal_info?.address?.address1
        if (!address || !customer._id) {
          completedCount++
          if (hasChanged) {
            setLoadingProgress({ current: completedCount, total: totalCount })
          }
          return null
        }

        // 캐시에서 먼저 확인
        let result = globalGeocodeCache.get(address)

        if (result) {
          // 캐시 히트 - 즉시 반환
          completedCount++
          if (hasChanged) {
            setLoadingProgress({ current: completedCount, total: totalCount })
          }
          return { customer, result }
        }

        // 캐시 미스 - API 호출
        if (import.meta.env.DEV) {
          console.log(`[NaverMap] Geocoding API 요청: ${customer.personal_info?.name}`)
        }

        const apiResult = await geocodeAddress(address)

        // 진행률 업데이트
        completedCount++
        if (hasChanged) {
          setLoadingProgress({ current: completedCount, total: totalCount })
        }

        if (!apiResult) {
          if (import.meta.env.DEV) {
            console.warn(`[NaverMap] Geocoding 실패: ${customer.personal_info?.name}`)
          }
          // Geocoding 실패 고객 ID 반환 (나중에 수집)
          return { customer, result: null, failed: true }
        }

        // 성공하면 캐시에 저장
        globalGeocodeCache.set(address, apiResult)
        return { customer, result: apiResult }
      })

      // 모든 Geocoding 요청을 동시에 실행하고 결과 대기
      const geocodingResults = await Promise.all(geocodingTasks)

      // 진행률 완료 후 숨김 (약간의 딜레이 후)
      setTimeout(() => setLoadingProgress(null), 500)

      // 2단계: 주소별로 고객 그룹화 (address1 기준)
      addressGroups.current.clear()

      // 실제 고객 위치로 bounds 계산 (지역/구군 선택 시)
      const allPositions: Array<{ lat: number; lng: number }> = []

      // Geocoding 실패 고객 ID 수집
      const failedCustomerIds = new Set<string>()

      for (const item of geocodingResults) {
        if (!item) continue

        // Geocoding 실패한 경우
        if ('failed' in item && item.failed) {
          if (item.customer._id) {
            failedCustomerIds.add(item.customer._id)
          }
          continue
        }

        const { customer, result } = item
        if (!result) continue

        // 모든 고객 위치를 수집 (bounds 계산용)
        allPositions.push({ lat: result.latitude, lng: result.longitude })

        const address1 = customer.personal_info?.address?.address1 || ''
        if (!addressGroups.current.has(address1)) {
          addressGroups.current.set(address1, [])
        }
        addressGroups.current.get(address1)!.push({ customer, result })
      }

      // 지역/구군 선택 시: 실제 고객 위치로 지도 bounds 자동 조정
      if (allPositions.length > 0 && (selectedRegion || selectedDistrict) && mapInstance.current) {
        // 첫 번째 고객 위치로 초기 bounds 생성 (length > 0이므로 안전)
        const firstPos = allPositions[0]!
        const bounds = new window.naver.maps.LatLngBounds(
          new window.naver.maps.LatLng(firstPos.lat, firstPos.lng),
          new window.naver.maps.LatLng(firstPos.lat, firstPos.lng)
        )

        // 모든 고객 위치를 포함하도록 bounds 확장
        allPositions.forEach(pos => {
          bounds.extend(new window.naver.maps.LatLng(pos.lat, pos.lng))
        })

        // bounds에 약간의 여백 추가 (padding)
        mapInstance.current.fitBounds(bounds, {
          top: 50,
          right: 50,
          bottom: 50,
          left: 50
        })

        if (import.meta.env.DEV) {
          console.log(`[NaverMap] 실제 고객 위치로 bounds 조정: ${allPositions.length}명`)
        }
      }

      // 3단계: 그룹별로 마커 생성
      if (!mapInstance.current) return
      const map = mapInstance.current // null 체크 후 변수에 할당
      const zoom = map.getZoom()
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
            markerContent = `<div class="${hasSelectedCustomer ? 'marker-blink' : ''}" style="
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
                border: 2px solid ${hasSelectedCustomer ? '#FF3B30' : 'white'};
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
            markerContent = `<div class="${hasSelectedCustomer ? 'marker-blink' : ''}" style="
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
                border: 3px solid rgba(255, 59, 48, 0.3);
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

          markerContent = `<div class="${isSelected ? 'marker-blink' : ''}" style="
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
              border: 2px solid ${isSelected ? '#FF3B30' : 'white'};
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
          map: map,
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
          infoWindow.open(map, marker)
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
        if (failedCustomerIds.size > 0) {
          console.log(`[NaverMap] Geocoding 실패 고객: ${failedCustomerIds.size}명`)
        }
      }

      // Geocoding 실패 고객 ID 콜백 호출
      if (onGeocodingFailedCustomersChange) {
        onGeocodingFailedCustomersChange(failedCustomerIds)
      }
    }

    createMarkers().catch(error => {
      console.error('[NaverMap] 마커 생성 중 오류:', error)
    })
  }, [customers, isMapReady, selectedRegion, selectedDistrict, onGeocodingFailedCustomersChange])

  // RightPane 열림/닫힘 시 bounds 재조정 (고객 선택 시)
  useEffect(() => {
    if (!isMapReady || !mapInstance.current || !window.naver || markers.current.size === 0) {
      return
    }

    // selectedCustomerId가 있을 때만 (RightPane 열릴 때) bounds 재조정
    if (selectedCustomerId) {
      const allPositions: Array<{ lat: number; lng: number }> = []

      // 현재 화면에 표시된 모든 마커의 위치 수집
      for (const [, group] of addressGroups.current.entries()) {
        for (const item of group) {
          if (item.result) {
            allPositions.push({ lat: item.result.latitude, lng: item.result.longitude })
          }
        }
      }

      if (allPositions.length > 0) {
        // 첫 번째 위치로 초기 bounds 생성
        const firstPos = allPositions[0]!
        const bounds = new window.naver.maps.LatLngBounds(
          new window.naver.maps.LatLng(firstPos.lat, firstPos.lng),
          new window.naver.maps.LatLng(firstPos.lat, firstPos.lng)
        )

        // 모든 위치를 포함하도록 bounds 확장
        allPositions.forEach(pos => {
          bounds.extend(new window.naver.maps.LatLng(pos.lat, pos.lng))
        })

        // RightPane이 열린 상태를 고려하여 오른쪽 padding 증가
        mapInstance.current.fitBounds(bounds, {
          top: 50,
          right: 400, // RightPane 폭 (약 350px) + 여백
          bottom: 50,
          left: 50
        })

        if (import.meta.env.DEV) {
          console.log(`[NaverMap] RightPane 열림 - bounds 재조정 (고객 ${allPositions.length}명)`)
        }
      }
    }
  }, [selectedCustomerId, isMapReady])

  // 줌 레벨 또는 선택된 고객 변경 시 마커 아이콘 업데이트
  useEffect(() => {
    if (!isMapReady || !mapInstance.current || !window.naver || addressGroups.current.size === 0) {
      return
    }

    const showNumbers = currentZoom >= 11
    const processedMarkers = new Set<NaverMarker>()

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
          markerContent = `<div class="${hasSelectedCustomer ? 'marker-blink' : ''}" style="
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
              border: 2px solid ${hasSelectedCustomer ? '#FF3B30' : 'white'};
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
          markerContent = `<div class="${hasSelectedCustomer ? 'marker-blink' : ''}" style="
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
              border: 3px solid rgba(255, 59, 48, 0.3);
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

        markerContent = `<div class="${isSelected ? 'marker-blink' : ''}" style="
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
            border: 2px solid ${isSelected ? '#FF3B30' : 'white'};
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

    // RightPane이 이미 열려있는 상태에서는 지도 이동 안 함
    // (이미 마커가 사용자 지도 중앙에 올바르게 위치해 있음)
    if (hasAdjustedForRightPane.current) {
      if (import.meta.env.DEV) {
        console.log('[NaverMap] RightPane 열림 상태 - 지도 이동 생략 (이미 올바른 위치)')
      }
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
      let result = globalGeocodeCache.get(address)

      if (!result) {
        // 캐시에 없으면 API 호출
        const apiResult = await geocodeAddress(address)
        if (!apiResult) return

        // 성공하면 캐시에 저장
        globalGeocodeCache.set(address, apiResult)
        result = apiResult
      }

      const position = new window.naver.maps.LatLng(result.latitude, result.longitude)
      const map = mapInstance.current
      if (!map) return

      // 선택된 고객 위치 저장 (지도 크기 변경 시 사용)
      selectedCustomerPosition.current = { lat: result.latitude, lng: result.longitude }

      // 기본 지도 이동 (전체 지도 영역 기준)
      map.setCenter(position)
      map.setZoom(15)

      if (import.meta.env.DEV) {
        console.log(`[NaverMap] 선택된 고객으로 이동: ${selectedCustomer.personal_info.name}`)
      }
    }

    moveToCustomer()
  }, [selectedCustomerId, customers, isMapReady, selectionTimestamp])

  // 지역 선택 시 지도 중심 이동 (center prop)
  useEffect(() => {
    if (!isMapReady || !mapInstance.current || !window.naver || !center) {
      return
    }

    const position = new window.naver.maps.LatLng(center.lat, center.lng)
    mapInstance.current.setCenter(position)

    // 줌 레벨 결정: 구/군 선택 시 더 크게, 지역만 선택 시 전체 보기
    let zoomLevel = 10 // 기본값
    if (selectedDistrict) {
      // 구/군이 선택된 경우: 해당 구/군이 중앙에 크게 보이도록
      zoomLevel = 14
    } else if (selectedRegion) {
      // 지역 유형에 따라 줌 레벨 차등 적용
      const isMetropolitanCity = selectedRegion.includes('특별시') ||
                                 selectedRegion.includes('광역시') ||
                                 selectedRegion.includes('특별자치시')

      if (isMetropolitanCity) {
        // 특별시/광역시: 면적이 작으므로 더 확대하여 화면에 꽉 차게
        zoomLevel = 11
      } else {
        // 도 지역: 면적이 넓으므로 적절히 확대하여 전체 지역이 보이게
        zoomLevel = 9
      }
    }

    mapInstance.current.setZoom(zoomLevel)

    if (import.meta.env.DEV) {
      console.log(`[NaverMap] 지도 이동: lat=${center.lat}, lng=${center.lng}, zoom=${zoomLevel}, region=${selectedRegion}, district=${selectedDistrict}`)
    }
  }, [center, isMapReady, selectedRegion, selectedDistrict])

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
            마커 로딩 중... {Math.round((loadingProgress.current / loadingProgress.total) * 100)}% ({loadingProgress.current}/{loadingProgress.total})
          </div>
        </div>
      )}

      {/* 초기 위치로 복귀 버튼 */}
      {isMapReady && (
        <Tooltip content="지도 리셋">
          <button
            className="naver-map-reset-button"
            onClick={handleReset}
            aria-label="지도 리셋"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
          </button>
        </Tooltip>
      )}
    </div>
  )
}

export default NaverMap
