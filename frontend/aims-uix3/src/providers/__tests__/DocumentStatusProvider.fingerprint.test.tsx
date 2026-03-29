/**
 * DocumentStatusProvider Fingerprint 비교 로직 테스트
 *
 * 프로덕션 createDocFingerprint와 동일한 필드를 포함:
 * id, overallStatus, progress, customer_relation, conversionStatus,
 * document_type/docType, virusScan.status, displayName, originalName
 */

describe('DocumentStatusProvider - Fingerprint 비교 로직', () => {
  // 테스트용 fingerprint 생성 함수 (프로덕션 코드와 동일)
  const createDocFingerprint = (doc: {
    _id?: string
    id?: string
    overallStatus?: string
    progress?: number
    customer_relation?: { customer_id?: string }
    conversionStatus?: string
    upload?: { conversion_status?: string }
    document_type?: string
    docType?: string
    virusScan?: { status?: string }
    displayName?: string
    originalName?: string
  }) => {
    const id = doc._id || doc.id || ''
    const status = doc.overallStatus || ''
    const progress = doc.progress ?? 0
    const customerRelation = doc.customer_relation?.customer_id || ''
    // PDF 변환 상태도 fingerprint에 포함
    const convStatus = doc.conversionStatus || (typeof doc.upload === 'object' ? doc.upload?.conversion_status : null) || ''
    // 문서 유형도 fingerprint에 포함
    const docType = doc.document_type || doc.docType || ''
    // 바이러스 스캔 상태도 fingerprint에 포함
    const virusScanStatus = doc.virusScan?.status || ''
    // 파일명도 fingerprint에 포함
    const displayName = doc.displayName || ''
    const originalName = doc.originalName || ''
    return `${id}:${status}:${progress}:${customerRelation}:${convStatus}:${docType}:${virusScanStatus}:${displayName}:${originalName}`
  }

  describe('fingerprint 생성', () => {
    it('모든 fingerprint 필드를 포함해야 함', () => {
      const doc = {
        _id: 'doc123',
        overallStatus: 'processing',
        progress: 50,
        customer_relation: { customer_id: 'cust456' },
        conversionStatus: 'completed',
        document_type: '청약서',
        virusScan: { status: 'clean' },
        displayName: '보험계약서.pdf',
        originalName: 'insurance_contract.pdf'
      }

      const fingerprint = createDocFingerprint(doc)

      expect(fingerprint).toBe('doc123:processing:50:cust456:completed:청약서:clean:보험계약서.pdf:insurance_contract.pdf')
    })

    it('customer_relation이 없으면 빈 문자열이어야 함', () => {
      const doc = {
        _id: 'doc123',
        overallStatus: 'completed',
        progress: 100
      }

      const fingerprint = createDocFingerprint(doc)

      expect(fingerprint).toBe('doc123:completed:100::::::')
    })

    it('id 필드도 _id 대신 사용 가능해야 함', () => {
      const doc = {
        id: 'temp-123',
        overallStatus: 'pending',
        progress: 0
      }

      const fingerprint = createDocFingerprint(doc)

      expect(fingerprint).toBe('temp-123:pending:0::::::')
    })

    it('upload.conversion_status를 conversionStatus 대체로 사용해야 함', () => {
      const doc = {
        _id: 'doc123',
        overallStatus: 'processing',
        progress: 80,
        upload: { conversion_status: 'converting' }
      }

      const fingerprint = createDocFingerprint(doc)

      expect(fingerprint).toBe('doc123:processing:80::converting::::')
    })

    it('docType을 document_type 대체로 사용해야 함', () => {
      const doc = {
        _id: 'doc123',
        overallStatus: 'completed',
        progress: 100,
        docType: '가입설계서'
      }

      const fingerprint = createDocFingerprint(doc)

      expect(fingerprint).toBe('doc123:completed:100:::가입설계서:::')
    })
  })

  describe('상태 변경 감지', () => {
    it('ID가 같아도 상태가 변경되면 다른 fingerprint를 생성해야 함', () => {
      const docBefore = {
        _id: 'doc123',
        overallStatus: 'processing',
        progress: 50
      }

      const docAfter = {
        _id: 'doc123',
        overallStatus: 'completed',
        progress: 100
      }

      const fingerprintBefore = createDocFingerprint(docBefore)
      const fingerprintAfter = createDocFingerprint(docAfter)

      expect(fingerprintBefore).not.toBe(fingerprintAfter)
    })

    it('ID가 같아도 고객 연결이 추가되면 다른 fingerprint를 생성해야 함', () => {
      const docBefore = {
        _id: 'doc123',
        overallStatus: 'completed',
        progress: 100
      }

      const docAfter = {
        _id: 'doc123',
        overallStatus: 'completed',
        progress: 100,
        customer_relation: { customer_id: 'cust456' }
      }

      const fingerprintBefore = createDocFingerprint(docBefore)
      const fingerprintAfter = createDocFingerprint(docAfter)

      expect(fingerprintBefore).not.toBe(fingerprintAfter)
    })

    it('displayName 변경 시 다른 fingerprint를 생성해야 함', () => {
      const docBefore = {
        _id: 'doc123',
        overallStatus: 'completed',
        progress: 100,
        displayName: '원본이름.pdf'
      }

      const docAfter = {
        _id: 'doc123',
        overallStatus: 'completed',
        progress: 100,
        displayName: '변경된이름.pdf'
      }

      const fingerprintBefore = createDocFingerprint(docBefore)
      const fingerprintAfter = createDocFingerprint(docAfter)

      expect(fingerprintBefore).not.toBe(fingerprintAfter)
    })

    it('originalName 변경 시 다른 fingerprint를 생성해야 함', () => {
      const docBefore = {
        _id: 'doc123',
        overallStatus: 'completed',
        progress: 100,
        originalName: 'file_v1.pdf'
      }

      const docAfter = {
        _id: 'doc123',
        overallStatus: 'completed',
        progress: 100,
        originalName: 'file_v2.pdf'
      }

      const fingerprintBefore = createDocFingerprint(docBefore)
      const fingerprintAfter = createDocFingerprint(docAfter)

      expect(fingerprintBefore).not.toBe(fingerprintAfter)
    })

    it('바이러스 스캔 상태 변경 시 다른 fingerprint를 생성해야 함', () => {
      const docBefore = {
        _id: 'doc123',
        overallStatus: 'completed',
        progress: 100,
        virusScan: { status: 'scanning' }
      }

      const docAfter = {
        _id: 'doc123',
        overallStatus: 'completed',
        progress: 100,
        virusScan: { status: 'infected' }
      }

      const fingerprintBefore = createDocFingerprint(docBefore)
      const fingerprintAfter = createDocFingerprint(docAfter)

      expect(fingerprintBefore).not.toBe(fingerprintAfter)
    })

    it('변환 상태 변경 시 다른 fingerprint를 생성해야 함', () => {
      const docBefore = {
        _id: 'doc123',
        overallStatus: 'processing',
        progress: 80,
        conversionStatus: 'converting'
      }

      const docAfter = {
        _id: 'doc123',
        overallStatus: 'processing',
        progress: 80,
        conversionStatus: 'completed'
      }

      const fingerprintBefore = createDocFingerprint(docBefore)
      const fingerprintAfter = createDocFingerprint(docAfter)

      expect(fingerprintBefore).not.toBe(fingerprintAfter)
    })

    it('문서 유형 변경 시 다른 fingerprint를 생성해야 함', () => {
      const docBefore = {
        _id: 'doc123',
        overallStatus: 'completed',
        progress: 100,
        document_type: '청약서'
      }

      const docAfter = {
        _id: 'doc123',
        overallStatus: 'completed',
        progress: 100,
        document_type: '가입설계서'
      }

      const fingerprintBefore = createDocFingerprint(docBefore)
      const fingerprintAfter = createDocFingerprint(docAfter)

      expect(fingerprintBefore).not.toBe(fingerprintAfter)
    })

    it('모든 값이 동일하면 같은 fingerprint를 생성해야 함', () => {
      const doc1 = {
        _id: 'doc123',
        overallStatus: 'completed',
        progress: 100,
        customer_relation: { customer_id: 'cust456' },
        conversionStatus: 'completed',
        document_type: '청약서',
        virusScan: { status: 'clean' },
        displayName: '보험계약서.pdf',
        originalName: 'contract.pdf'
      }

      const doc2 = {
        _id: 'doc123',
        overallStatus: 'completed',
        progress: 100,
        customer_relation: { customer_id: 'cust456' },
        conversionStatus: 'completed',
        document_type: '청약서',
        virusScan: { status: 'clean' },
        displayName: '보험계약서.pdf',
        originalName: 'contract.pdf'
      }

      const fingerprint1 = createDocFingerprint(doc1)
      const fingerprint2 = createDocFingerprint(doc2)

      expect(fingerprint1).toBe(fingerprint2)
    })
  })

  describe('문서 배열 비교', () => {
    it('문서 상태가 변경된 배열은 다른 fingerprint 문자열을 생성해야 함', () => {
      const docsBefore = [
        { _id: 'doc1', overallStatus: 'processing', progress: 50 },
        { _id: 'doc2', overallStatus: 'processing', progress: 75 }
      ]

      const docsAfter = [
        { _id: 'doc1', overallStatus: 'completed', progress: 100 },
        { _id: 'doc2', overallStatus: 'processing', progress: 75 }
      ]

      const fingerprintsBefore = docsBefore.map(createDocFingerprint).sort().join('|')
      const fingerprintsAfter = docsAfter.map(createDocFingerprint).sort().join('|')

      expect(fingerprintsBefore).not.toBe(fingerprintsAfter)
    })

    it('순서만 다르고 내용이 같으면 같은 fingerprint 문자열을 생성해야 함 (정렬 적용)', () => {
      const docs1 = [
        { _id: 'doc1', overallStatus: 'completed', progress: 100 },
        { _id: 'doc2', overallStatus: 'completed', progress: 100 }
      ]

      const docs2 = [
        { _id: 'doc2', overallStatus: 'completed', progress: 100 },
        { _id: 'doc1', overallStatus: 'completed', progress: 100 }
      ]

      const fingerprints1 = docs1.map(createDocFingerprint).sort().join('|')
      const fingerprints2 = docs2.map(createDocFingerprint).sort().join('|')

      expect(fingerprints1).toBe(fingerprints2)
    })
  })
})
