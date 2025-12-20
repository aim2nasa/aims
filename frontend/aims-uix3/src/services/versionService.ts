/**
 * Version Service
 * 백엔드 및 프론트엔드 버전 정보를 수집하는 서비스
 * @since 2025-12-20
 *
 * 보안: 백엔드 API들은 외부에 노출되지 않음
 * aims_api의 /api/system/versions 엔드포인트가 서버 내부에서
 * 각 서비스의 VERSION 파일을 읽어 반환
 */

import { VERSION_INFO } from '../config/version'

export interface ServiceVersionInfo {
  name: string
  displayName: string
  version: string | null
  gitHash: string | null
  buildTime: string | null
  fullVersion: string | null
  status: 'ok' | 'error' | 'loading'
  error?: string
}

export interface SystemVersions {
  frontend: ServiceVersionInfo
  backends: ServiceVersionInfo[]
}

/**
 * 프론트엔드 버전 정보
 */
export function getFrontendVersion(): ServiceVersionInfo {
  return {
    name: 'frontend',
    displayName: 'Frontend',
    version: VERSION_INFO.version,
    gitHash: VERSION_INFO.gitHash,
    buildTime: VERSION_INFO.buildTime,
    fullVersion: VERSION_INFO.fullVersion,
    status: 'ok',
  }
}

/**
 * 모든 백엔드 서비스 버전 정보 조회
 * aims_api의 /api/system/versions 단일 엔드포인트 호출
 * (다른 API들은 외부에 노출되지 않음)
 */
export async function fetchAllBackendVersions(): Promise<ServiceVersionInfo[]> {
  try {
    const response = await fetch('/api/system/versions', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!response.ok) {
      console.error('[versionService] API 호출 실패:', response.status)
      return []
    }

    const data = await response.json()

    if (!data.success || !data.services) {
      return []
    }

    return data.services.map((service: {
      name: string
      displayName: string
      version: string | null
      gitHash: string | null
      status: string
      error?: string
    }) => ({
      name: service.name,
      displayName: service.displayName,
      version: service.version,
      gitHash: service.gitHash,
      buildTime: null,
      fullVersion: service.version ? `v${service.version}` : null,
      status: service.status as 'ok' | 'error',
      error: service.error,
    }))
  } catch (error) {
    console.error('[versionService] 버전 정보 조회 실패:', error)
    return []
  }
}

/**
 * 전체 시스템 버전 정보 조회
 */
export async function fetchSystemVersions(): Promise<SystemVersions> {
  const backends = await fetchAllBackendVersions()

  return {
    frontend: getFrontendVersion(),
    backends,
  }
}
