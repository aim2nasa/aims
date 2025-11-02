/**
 * Backend Timestamp Utility Functions Unit Tests
 * @since 2025-11-02
 *
 * 테스트 범위:
 * 1. normalizeTimestamp - AIMS 표준 형식으로 정규화 (핵심 함수)
 * 2. utcNowISO - 현재 UTC 시간
 * 3. toUTCISO - Date → ISO 8601
 * 4. parseISOTimestamp - ISO 8601 → Date
 * 5. getTimeDiff - 두 timestamp 차이
 */

const {
  utcNowISO,
  toUTCISO,
  parseISOTimestamp,
  getTimeDiff,
  normalizeTimestamp
} = require('../timeUtils');

describe('Backend timeUtils', () => {
  describe('normalizeTimestamp', () => {
    /**
     * 회귀 테스트: KST → UTC 변환
     *
     * 문제 배경 (2025-11-02):
     * - MongoDB에 KST 타임존(+09:00)으로 저장된 timestamp가
     *   프론트엔드에서 중구난방으로 표시됨
     * - API 응답에서 혼재된 형식 반환
     *
     * 해결:
     * - normalizeTimestamp() 함수로 모든 timestamp를 UTC로 정규화
     * - AIMS 표준: UTC 타임존 (Z), 밀리초 3자리, ISO 8601 형식
     *
     * 이 테스트의 목적:
     * - KST → UTC 변환이 정확히 작동하는지 검증
     * - 향후 timezone 처리 로직 변경 시 즉시 감지
     */
    it('[회귀] KST 타임존(+09:00)을 UTC(Z)로 변환해야 함', () => {
      // MongoDB에 저장된 실제 KST timestamp
      const kstTimestamp = '2025-11-02T17:56:12.636+09:00';

      const result = normalizeTimestamp(kstTimestamp);

      // UTC로 변환되어야 함 (9시간 차이)
      expect(result).toBe('2025-11-02T08:56:12.636Z');
    });

    /**
     * 회귀 테스트: 마이크로초 → 밀리초 변환
     *
     * 문제 배경:
     * - Python에서 생성한 timestamp가 마이크로초(6자리) 정밀도
     * - 프론트엔드 Date는 밀리초(3자리)만 지원
     * - 표시 불일치 발생
     *
     * 해결:
     * - normalizeTimestamp()가 자동으로 밀리초 3자리로 절삭
     *
     * 이 테스트의 목적:
     * - 마이크로초 정밀도를 밀리초로 정확히 변환하는지 검증
     */
    it('[회귀] 마이크로초(6자리)를 밀리초(3자리)로 절삭해야 함', () => {
      // Python에서 생성한 마이크로초 timestamp
      const microsecondTimestamp = '2025-11-02T08:57:06.074108+00:00';

      const result = normalizeTimestamp(microsecondTimestamp);

      // 밀리초 3자리로 절삭되어야 함
      expect(result).toBe('2025-11-02T08:57:06.074Z');
    });

    /**
     * 회귀 테스트: 이미 표준 형식인 timestamp는 그대로 유지
     *
     * 이 테스트의 목적:
     * - 표준 형식 timestamp를 손상시키지 않는지 검증
     * - idempotent(멱등성) 보장
     */
    it('[회귀] 이미 AIMS 표준 형식인 timestamp는 그대로 반환해야 함', () => {
      const standardTimestamp = '2025-11-02T08:56:12.636Z';

      const result = normalizeTimestamp(standardTimestamp);

      expect(result).toBe(standardTimestamp);
    });

    /**
     * 회귀 테스트: null/undefined 처리
     *
     * 이 테스트의 목적:
     * - null/undefined 입력에 안전하게 null 반환하는지 검증
     * - API 응답에서 선택적 필드 처리 시 안전성 보장
     */
    it('[회귀] null이나 undefined는 null을 반환해야 함', () => {
      expect(normalizeTimestamp(null)).toBeNull();
      expect(normalizeTimestamp(undefined)).toBeNull();
      expect(normalizeTimestamp('')).toBeNull();
    });

    /**
     * 회귀 테스트: 잘못된 형식 처리
     *
     * 이 테스트의 목적:
     * - 잘못된 timestamp에 대해 graceful하게 실패하는지 검증
     * - 에러 대신 null 반환으로 안정성 확보
     */
    it('[회귀] 잘못된 형식의 timestamp는 null을 반환해야 함', () => {
      expect(normalizeTimestamp('not-a-date')).toBeNull();
      expect(normalizeTimestamp('2025-99-99')).toBeNull();
      expect(normalizeTimestamp('invalid')).toBeNull();
    });

    /**
     * 회귀 테스트: 다양한 타임존 형식 지원
     *
     * 이 테스트의 목적:
     * - 전 세계 다양한 타임존 형식을 올바르게 UTC로 변환하는지 검증
     */
    it('[회귀] 다양한 타임존 형식을 UTC로 변환해야 함', () => {
      // PST (Pacific Standard Time)
      const pst = normalizeTimestamp('2025-11-02T00:56:12.636-08:00');
      expect(pst).toBe('2025-11-02T08:56:12.636Z');

      // JST (Japan Standard Time)
      const jst = normalizeTimestamp('2025-11-02T17:56:12.636+09:00');
      expect(jst).toBe('2025-11-02T08:56:12.636Z');

      // UTC+0
      const utc = normalizeTimestamp('2025-11-02T08:56:12.636+00:00');
      expect(utc).toBe('2025-11-02T08:56:12.636Z');
    });

    /**
     * 회귀 테스트: ISO 8601 형식 강제
     *
     * 이 테스트의 목적:
     * - 출력이 항상 ISO 8601 형식인지 검증
     * - 정규표현식으로 형식 엄격하게 검증
     */
    it('[회귀] 출력은 항상 ISO 8601 형식이어야 함', () => {
      const inputs = [
        '2025-11-02T17:56:12.636+09:00',
        '2025-11-02T08:57:06.074108+00:00',
        '2025-11-02T08:56:12.636Z'
      ];

      inputs.forEach(input => {
        const result = normalizeTimestamp(input);

        // ISO 8601 형식: YYYY-MM-DDTHH:mm:ss.sssZ
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      });
    });

    /**
     * 회귀 테스트: 밀리초 정확성
     *
     * 이 테스트의 목적:
     * - 밀리초 값이 정확히 보존되는지 검증
     * - 반올림이나 절삭 오류 방지
     */
    it('[회귀] 밀리초 값을 정확히 보존해야 함', () => {
      const timestamps = [
        { input: '2025-11-02T08:56:12.000Z', expected: '2025-11-02T08:56:12.000Z' },
        { input: '2025-11-02T08:56:12.001Z', expected: '2025-11-02T08:56:12.001Z' },
        { input: '2025-11-02T08:56:12.999Z', expected: '2025-11-02T08:56:12.999Z' },
        { input: '2025-11-02T08:56:12.636Z', expected: '2025-11-02T08:56:12.636Z' }
      ];

      timestamps.forEach(({ input, expected }) => {
        const result = normalizeTimestamp(input);
        expect(result).toBe(expected);
      });
    });
  });

  describe('utcNowISO', () => {
    it('현재 시간을 ISO 8601 UTC 형식으로 반환해야 한다', () => {
      const result = utcNowISO();

      // ISO 8601 형식 검증: YYYY-MM-DDTHH:mm:ss.sssZ
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

      // Date로 파싱 가능한지 확인
      const date = new Date(result);
      expect(date).toBeInstanceOf(Date);
      expect(isNaN(date.getTime())).toBe(false);
    });
  });

  describe('toUTCISO', () => {
    it('Date 객체를 ISO 8601 UTC 문자열로 변환해야 한다', () => {
      const date = new Date('2025-11-01T07:17:21.143Z');
      const result = toUTCISO(date);

      expect(result).toBe('2025-11-01T07:17:21.143Z');
    });

    it('잘못된 Date 객체는 에러를 던져야 한다', () => {
      const invalidDate = new Date('invalid');

      expect(() => toUTCISO(invalidDate)).toThrow('Invalid Date object');
    });

    it('Date가 아닌 값은 에러를 던져야 한다', () => {
      expect(() => toUTCISO('not-a-date')).toThrow('Invalid Date object');
      expect(() => toUTCISO(null)).toThrow('Invalid Date object');
      expect(() => toUTCISO(undefined)).toThrow('Invalid Date object');
    });
  });

  describe('parseISOTimestamp', () => {
    it('ISO 8601 문자열을 Date 객체로 파싱해야 한다', () => {
      const result = parseISOTimestamp('2025-11-01T07:17:21.143Z');

      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe('2025-11-01T07:17:21.143Z');
    });

    it('null이나 undefined를 null로 반환해야 한다', () => {
      expect(parseISOTimestamp(null)).toBeNull();
      expect(parseISOTimestamp(undefined)).toBeNull();
      expect(parseISOTimestamp('')).toBeNull();
    });

    it('잘못된 형식의 timestamp는 null을 반환해야 한다', () => {
      expect(parseISOTimestamp('not-a-date')).toBeNull();
      expect(parseISOTimestamp('2025-99-99')).toBeNull();
    });

    it('다양한 ISO 8601 형식을 파싱해야 한다', () => {
      // 밀리초 없는 형식
      const withoutMs = parseISOTimestamp('2025-11-01T07:17:21Z');
      expect(withoutMs).toBeInstanceOf(Date);

      // 타임존 오프셋 형식
      const withOffset = parseISOTimestamp('2025-11-01T16:17:21+09:00');
      expect(withOffset).toBeInstanceOf(Date);
    });
  });

  describe('getTimeDiff', () => {
    it('두 ISO 8601 문자열의 차이를 밀리초로 반환해야 한다', () => {
      const diff = getTimeDiff(
        '2025-11-01T07:17:21.143Z',
        '2025-11-01T07:17:28.617Z'
      );

      // 7.474초 차이
      expect(diff).toBe(7474);
    });

    it('Date 객체도 처리할 수 있어야 한다', () => {
      const date1 = new Date('2025-11-01T07:17:21.143Z');
      const date2 = new Date('2025-11-01T07:17:28.617Z');

      const diff = getTimeDiff(date1, date2);
      expect(diff).toBe(7474);
    });

    it('null이나 undefined가 포함되면 null을 반환해야 한다', () => {
      expect(getTimeDiff(null, '2025-11-01T07:17:21.143Z')).toBeNull();
      expect(getTimeDiff('2025-11-01T07:17:21.143Z', null)).toBeNull();
      expect(getTimeDiff(null, null)).toBeNull();
    });

    it('종료 시간이 시작 시간보다 이전이면 음수를 반환해야 한다', () => {
      const diff = getTimeDiff(
        '2025-11-01T07:17:28.617Z',
        '2025-11-01T07:17:21.143Z'
      );
      expect(diff).toBe(-7474);
    });
  });

  describe('멱등성 (Idempotency)', () => {
    /**
     * 회귀 테스트: normalizeTimestamp의 멱등성
     *
     * 이 테스트의 목적:
     * - 동일한 입력에 대해 여러 번 호출해도 같은 결과가 나오는지 검증
     * - 이미 정규화된 timestamp를 재정규화해도 안전한지 확인
     */
    it('[회귀] normalizeTimestamp는 멱등성을 가져야 함', () => {
      const inputs = [
        '2025-11-02T17:56:12.636+09:00',
        '2025-11-02T08:57:06.074108+00:00',
        '2025-11-02T08:56:12.636Z'
      ];

      inputs.forEach(input => {
        const result1 = normalizeTimestamp(input);
        const result2 = normalizeTimestamp(result1);
        const result3 = normalizeTimestamp(result2);

        expect(result1).toBe(result2);
        expect(result2).toBe(result3);
      });
    });
  });
});
