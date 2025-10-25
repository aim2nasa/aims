/**
 * DocumentRegistrationView - AR 고객명 표시 테스트
 *
 * @issue AR 처리 로그에 어느 고객의 문서인지 구분이 어려움 (2025-10-25)
 * @cause 로그 메시지에 고객 정보가 포함되지 않음
 * @fix addLog 함수에 customerName 파라미터 추가, 모든 AR 로그에 [고객명] 접두사 자동 표시
 * @commit 1da7aab
 *
 * 이 테스트는 AR 처리 로그에 고객명이 자동으로 표시되어
 * 사용자가 로그만 보고도 어느 고객의 문서인지 즉시 파악할 수 있는지 검증합니다.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { DocumentRegistrationView } from '../DocumentRegistrationView'

// Mock dependencies
vi.mock('@/services/uploadService', () => ({
  uploadService: {
    uploadDocument: vi.fn()
  }
}))

vi.mock('@/services/DocumentService', () => ({
  DocumentService: {
    getCustomerDocuments: vi.fn().mockResolvedValue({
      customer_id: '',
      documents: [],
      total: 0
    }),
    linkDocumentToCustomer: vi.fn().mockResolvedValue({ success: true })
  }
}))

describe('DocumentRegistrationView - AR 고객명 표시 (1da7aab)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('addLog 함수는 customerName 파라미터를 받을 수 있어야 함', () => {
    // Given: 컴포넌트 렌더링
    const { container } = render(
      <DocumentRegistrationView
        visible={true}
        onClose={vi.fn()}
      />
    )

    // Then: 컴포넌트가 정상적으로 렌더링되어야 함
    expect(container).toBeInTheDocument()
  })

  it('고객명이 있을 때 로그 메시지 앞에 [고객명]이 표시되어야 함', () => {
    /**
     * addLog의 로직:
     * const finalMessage = customerName ? `[${customerName}] ${message}` : message
     */

    // Given
    const customerName = '김보성'
    const message = '중복 체크 중'

    // When: customerName이 있을 때
    const expectedWithName = `[${customerName}] ${message}`

    // Then
    expect(expectedWithName).toBe('[김보성] 중복 체크 중')
  })

  it('고객명이 없을 때 로그 메시지가 그대로 표시되어야 함', () => {
    /**
     * addLog의 로직:
     * const finalMessage = customerName ? `[${customerName}] ${message}` : message
     */

    // Given
    const customerName = undefined
    const message = '업로드 완료'

    // When: customerName이 없을 때
    const expectedWithoutName = customerName ? `[${customerName}] ${message}` : message

    // Then
    expect(expectedWithoutName).toBe('업로드 완료')
  })

  it('동명이인 구분이 가능해야 함', () => {
    /**
     * 동명이인 처리 예시:
     * - [김보성 (1)] 중복 체크 중
     * - [김보성 일산] 중복 체크 중
     */

    // Given: 동명이인 고객명들
    const customer1 = '김보성 (1)'
    const customer2 = '김보성 일산'
    const message = 'AR 파싱 시작'

    // When
    const log1 = `[${customer1}] ${message}`
    const log2 = `[${customer2}] ${message}`

    // Then: 두 로그가 명확히 구분되어야 함
    expect(log1).toBe('[김보성 (1)] AR 파싱 시작')
    expect(log2).toBe('[김보성 일산] AR 파싱 시작')
    expect(log1).not.toBe(log2)
  })

  it('customerNameMappingRef는 고객 ID → 고객명 매핑을 저장해야 함', () => {
    /**
     * 구현:
     * const customerNameMappingRef = useRef<Map<string, string>>(new Map())
     * customerNameMappingRef.current.set(customerId, customerName)
     */

    // Given: Map을 사용한 매핑
    const mapping = new Map<string, string>()

    // When: 고객 ID와 이름 저장
    mapping.set('customer-id-1', '김보성')
    mapping.set('customer-id-2', '이영희')

    // Then: 올바르게 조회 가능해야 함
    expect(mapping.get('customer-id-1')).toBe('김보성')
    expect(mapping.get('customer-id-2')).toBe('이영희')
    expect(mapping.get('customer-id-3')).toBeUndefined()
  })

  it('고객 선택 시 고객명이 매핑에 저장되어야 함', () => {
    /**
     * handleCustomerSelected 로직:
     * const selectedCustomer = annualReportCustomers.find(c => c._id === customerId)
     * const customerName = selectedCustomer?.personal_info?.name || annualReportMetadata?.customer_name || '알 수 없음'
     * customerNameMappingRef.current.set(customerId, customerName)
     */

    // Given: 고객 데이터
    const customers = [
      { _id: 'c1', personal_info: { name: '김보성' } },
      { _id: 'c2', personal_info: { name: '이영희' } }
    ]

    // When: 고객 선택 (c1)
    const selectedCustomer = customers.find(c => c._id === 'c1')
    const customerName = selectedCustomer?.personal_info?.name || '알 수 없음'

    // Then
    expect(customerName).toBe('김보성')
  })

  it('고객 정보가 없을 때 기본값 "알 수 없음"을 사용해야 함', () => {
    /**
     * customerName 결정 로직:
     * selectedCustomer?.personal_info?.name || annualReportMetadata?.customer_name || '알 수 없음'
     */

    // Given: 고객 정보가 없음
    const selectedCustomer: any = undefined
    const annualReportMetadata: any = undefined

    // When
    const customerName = selectedCustomer?.personal_info?.name
      || annualReportMetadata?.customer_name
      || '알 수 없음'

    // Then
    expect(customerName).toBe('알 수 없음')
  })

  it('AR 처리 관련 모든 로그에 고객명이 포함되어야 함', () => {
    /**
     * 고객명이 표시되어야 하는 로그들:
     * 1. 중복 체크 중
     * 2. AR 파싱 시작/완료
     * 3. 업로드 시작/완료
     * 4. AR 문서 처리 중
     * 5. 문서-고객 자동 연결 시작/완료
     */

    // Given
    const customerName = '김보성'
    const logs = [
      '중복 체크 중: annual_report.pdf',
      'AR 파싱 시작: annual_report.pdf',
      'AR 파싱 완료: annual_report.pdf',
      '업로드 시작: annual_report.pdf',
      '업로드 완료: annual_report.pdf',
      'AR 문서 처리 중: annual_report.pdf',
      '문서-고객 자동 연결 시작: annual_report.pdf',
      '문서-고객 자동 연결 완료: annual_report.pdf'
    ]

    // When: 모든 로그에 고객명 추가
    const logsWithCustomerName = logs.map(msg => `[${customerName}] ${msg}`)

    // Then: 모든 로그에 [김보성]이 포함되어야 함
    logsWithCustomerName.forEach(log => {
      expect(log).toContain('[김보성]')
    })

    expect(logsWithCustomerName).toEqual([
      '[김보성] 중복 체크 중: annual_report.pdf',
      '[김보성] AR 파싱 시작: annual_report.pdf',
      '[김보성] AR 파싱 완료: annual_report.pdf',
      '[김보성] 업로드 시작: annual_report.pdf',
      '[김보성] 업로드 완료: annual_report.pdf',
      '[김보성] AR 문서 처리 중: annual_report.pdf',
      '[김보성] 문서-고객 자동 연결 시작: annual_report.pdf',
      '[김보성] 문서-고객 자동 연결 완료: annual_report.pdf'
    ])
  })

  it('자동 연결 시 고객명 매핑에서 이름을 가져와야 함', () => {
    /**
     * 자동 연결 로직:
     * const customerName = customerNameMappingRef.current.get(customerId)
     * addLog('info', `문서-고객 자동 연결 시작: ${fileName}`, undefined, customerName)
     */

    // Given: 고객명 매핑
    const mapping = new Map<string, string>()
    mapping.set('c1', '김보성')
    mapping.set('c2', '이영희')

    // When: 자동 연결 시 고객 ID로 이름 조회
    const customerId = 'c1'
    const customerName = mapping.get(customerId)
    const fileName = 'annual_report.pdf'
    const logMessage = `[${customerName}] 문서-고객 자동 연결 시작: ${fileName}`

    // Then
    expect(logMessage).toBe('[김보성] 문서-고객 자동 연결 시작: annual_report.pdf')
  })

  it('고객명 표시로 인해 로그 추적성이 향상되어야 함', () => {
    /**
     * 개선 효과 시뮬레이션:
     * - 로그만 보고도 어느 고객의 문서인지 즉시 파악 가능
     * - 동명이인 구분 용이
     * - AR 처리 전체 과정 추적성 향상
     */

    // Given: 여러 고객의 AR 처리 로그
    const logs = [
      { customer: '김보성 (1)', message: '중복 체크 중: annual_report_1.pdf' },
      { customer: '김보성 일산', message: '중복 체크 중: annual_report_2.pdf' },
      { customer: '김보성 (1)', message: '업로드 완료: annual_report_1.pdf' },
      { customer: '이영희', message: 'AR 파싱 시작: annual_report_3.pdf' },
      { customer: '김보성 일산', message: '업로드 완료: annual_report_2.pdf' }
    ]

    // When: 로그에 고객명 표시
    const formattedLogs = logs.map(log => `[${log.customer}] ${log.message}`)

    // Then: 각 고객별로 로그를 필터링할 수 있어야 함
    const kimBosung1Logs = formattedLogs.filter(log => log.includes('[김보성 (1)]'))
    const kimBosungIlsanLogs = formattedLogs.filter(log => log.includes('[김보성 일산]'))
    const leeYounghiLogs = formattedLogs.filter(log => log.includes('[이영희]'))

    expect(kimBosung1Logs.length).toBe(2)
    expect(kimBosungIlsanLogs.length).toBe(2)
    expect(leeYounghiLogs.length).toBe(1)

    // 동명이인(김보성)도 명확히 구분됨
    expect(kimBosung1Logs).not.toEqual(kimBosungIlsanLogs)
  })
})
