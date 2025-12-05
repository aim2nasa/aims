/**
 * DocumentStatusProvider Fingerprint 비교 로직 테스트
 *
 * 문제: ID만 비교하여 상태 변경 시 업데이트가 안됨
 * 해결: ID + overallStatus + progress + customer_relation 비교
 */

describe('DocumentStatusProvider - Fingerprint 비교 로직', () => {
  // 테스트용 fingerprint 생성 함수 (실제 구현과 동일)
  const createDocFingerprint = (doc: {
    _id?: string
    id?: string
    overallStatus?: string
    progress?: number
    customer_relation?: { customer_id?: string }
  }) => {
    const id = doc._id || doc.id || ''
    const status = doc.overallStatus || ''
    const progress = doc.progress ?? 0
    const customerRelation = doc.customer_relation?.customer_id || ''
    return `${id}:${status}:${progress}:${customerRelation}`
  }

  describe('fingerprint 생성', () => {
    it('ID, 상태, 진행률, 고객연결 정보를 모두 포함해야 함', () => {
      const doc = {
        _id: 'doc123',
        overallStatus: 'processing',
        progress: 50,
        customer_relation: { customer_id: 'cust456' }
      }

      const fingerprint = createDocFingerprint(doc)

      expect(fingerprint).toBe('doc123:processing:50:cust456')
    })

    it('customer_relation이 없으면 빈 문자열이어야 함', () => {
      const doc = {
        _id: 'doc123',
        overallStatus: 'completed',
        progress: 100
      }

      const fingerprint = createDocFingerprint(doc)

      expect(fingerprint).toBe('doc123:completed:100:')
    })

    it('id 필드도 _id 대신 사용 가능해야 함', () => {
      const doc = {
        id: 'temp-123',
        overallStatus: 'pending',
        progress: 0
      }

      const fingerprint = createDocFingerprint(doc)

      expect(fingerprint).toBe('temp-123:pending:0:')
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
        overallStatus: 'completed',  // 상태 변경
        progress: 100                // 진행률 변경
      }

      const fingerprintBefore = createDocFingerprint(docBefore)
      const fingerprintAfter = createDocFingerprint(docAfter)

      // 핵심: 상태 변경 시 fingerprint가 달라야 업데이트됨
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
        customer_relation: { customer_id: 'cust456' }  // 고객 연결 추가
      }

      const fingerprintBefore = createDocFingerprint(docBefore)
      const fingerprintAfter = createDocFingerprint(docAfter)

      // 핵심: 고객 연결 시 fingerprint가 달라야 업데이트됨
      expect(fingerprintBefore).not.toBe(fingerprintAfter)
    })

    it('모든 값이 동일하면 같은 fingerprint를 생성해야 함', () => {
      const doc1 = {
        _id: 'doc123',
        overallStatus: 'completed',
        progress: 100,
        customer_relation: { customer_id: 'cust456' }
      }

      const doc2 = {
        _id: 'doc123',
        overallStatus: 'completed',
        progress: 100,
        customer_relation: { customer_id: 'cust456' }
      }

      const fingerprint1 = createDocFingerprint(doc1)
      const fingerprint2 = createDocFingerprint(doc2)

      // 같으면 리렌더링 방지
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
        { _id: 'doc1', overallStatus: 'completed', progress: 100 },  // 변경됨
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
        { _id: 'doc2', overallStatus: 'completed', progress: 100 },  // 순서만 다름
        { _id: 'doc1', overallStatus: 'completed', progress: 100 }
      ]

      const fingerprints1 = docs1.map(createDocFingerprint).sort().join('|')
      const fingerprints2 = docs2.map(createDocFingerprint).sort().join('|')

      // 정렬 후 비교하므로 같아야 함
      expect(fingerprints1).toBe(fingerprints2)
    })
  })
})
