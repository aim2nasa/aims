/**
 * API Client 테스트
 * @since 2025-10-15
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  apiRequest,
  api,
  ApiError,
  NetworkError,
  TimeoutError,
  handleApiError,
  checkApiHealth,
  API_CONFIG
} from '../api';

describe('API Error Classes', () => {
  describe('ApiError', () => {
    it('ApiError를 생성할 수 있어야 함', () => {
      const error = new ApiError('Test error', 404, 'Not Found', { detail: 'test' });

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ApiError');
      expect(error.message).toBe('Test error');
      expect(error.status).toBe(404);
      expect(error.statusText).toBe('Not Found');
      expect(error.data).toEqual({ detail: 'test' });
    });

    it('data 없이 ApiError를 생성할 수 있어야 함', () => {
      const error = new ApiError('Test error', 500, 'Internal Server Error');

      expect(error.data).toBeUndefined();
    });
  });

  describe('NetworkError', () => {
    it('NetworkError를 생성할 수 있어야 함', () => {
      const originalError = new Error('Connection failed');
      const error = new NetworkError('Network issue', originalError);

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('NetworkError');
      expect(error.message).toBe('Network issue');
      expect(error.originalError).toBe(originalError);
    });

    it('originalError 없이 NetworkError를 생성할 수 있어야 함', () => {
      const error = new NetworkError('Network issue');

      expect(error.originalError).toBeUndefined();
    });
  });

  describe('TimeoutError', () => {
    it('TimeoutError를 생성할 수 있어야 함', () => {
      const error = new TimeoutError();

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('TimeoutError');
      expect(error.message).toBe('요청 시간이 초과되었습니다');
    });

    it('커스텀 메시지로 TimeoutError를 생성할 수 있어야 함', () => {
      const error = new TimeoutError('Custom timeout message');

      expect(error.message).toBe('Custom timeout message');
    });
  });
});

describe('handleApiError', () => {
  it('ApiError를 처리해야 함', () => {
    const error = new ApiError('API failed', 400, 'Bad Request');
    expect(handleApiError(error)).toBe('API failed');
  });

  it('NetworkError를 처리해야 함', () => {
    const error = new NetworkError('Connection failed');
    expect(handleApiError(error)).toBe('Connection failed');
  });

  it('TimeoutError를 처리해야 함', () => {
    const error = new TimeoutError('Timeout occurred');
    expect(handleApiError(error)).toBe('Timeout occurred');
  });

  it('일반 Error를 처리해야 함', () => {
    const error = new Error('General error');
    expect(handleApiError(error)).toBe('General error');
  });

  it('알 수 없는 에러를 처리해야 함', () => {
    expect(handleApiError('string error')).toBe('알 수 없는 오류가 발생했습니다');
    expect(handleApiError(123)).toBe('알 수 없는 오류가 발생했습니다');
    expect(handleApiError(null)).toBe('알 수 없는 오류가 발생했습니다');
  });
});

describe('apiRequest', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('성공 케이스', () => {
    it('JSON 응답을 파싱해야 함', async () => {
      const mockData = { success: true, data: 'test' };
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockData
      } as unknown as Response);

      const result = await apiRequest('/test');

      expect(result).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('텍스트 응답을 파싱해야 함', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => 'plain text response'
      } as Response);

      const result = await apiRequest<string>('/test');

      expect(result).toBe('plain text response');
    });

    it('Blob 응답을 처리해야 함', async () => {
      const mockBlob = new Blob(['test'], { type: 'application/octet-stream' });
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/octet-stream' }),
        blob: async () => mockBlob
      } as Response);

      const result = await apiRequest<Blob>('/test');

      expect(result).toBe(mockBlob);
    });

    it('절대 URL을 그대로 사용해야 함', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({})
      } as Response);

      await apiRequest('https://external-api.com/endpoint');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://external-api.com/endpoint',
        expect.any(Object)
      );
    });

    it('상대 URL에 baseUrl을 붙여야 함', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({})
      } as Response);

      await apiRequest('/api/test');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/test'),
        expect.any(Object)
      );
    });
  });

  describe('요청 바디 처리', () => {
    beforeEach(() => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({})
      } as Response);
    });

    it('JSON 바디를 직렬화해야 함', async () => {
      await apiRequest('/test', {
        method: 'POST',
        body: { key: 'value' }
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ key: 'value' })
        })
      );
    });

    it('문자열 바디를 그대로 전달해야 함', async () => {
      await apiRequest('/test', {
        method: 'POST',
        body: 'raw string'
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: 'raw string'
        })
      );
    });

    it('FormData는 Content-Type을 제거하고 전달해야 함', async () => {
      const formData = new FormData();
      formData.append('file', 'test');

      await apiRequest('/test', {
        method: 'POST',
        body: formData
      });

      const fetchCall = vi.mocked(global.fetch).mock.calls?.[0];
      const headers = fetchCall?.[1]?.headers as Record<string, string> | undefined;

      expect(headers?.['Content-Type']).toBeUndefined();
      expect(fetchCall?.[1]?.body).toBe(formData);
    });
  });

  describe('타임아웃 처리', () => {
    it('타임아웃 시 TimeoutError를 발생시켜야 함', async () => {
      vi.spyOn(global, 'fetch').mockImplementation(() =>
        new Promise((_, reject) => {
          setTimeout(() => {
            const error = new Error('AbortError');
            error.name = 'AbortError';
            reject(error);
          }, 50);
        })
      );

      await expect(
        apiRequest('/test', { timeout: 10 })
      ).rejects.toThrow(TimeoutError);
    });

    it('커스텀 타임아웃을 적용해야 함', async () => {
      vi.spyOn(global, 'fetch').mockImplementation((_, options) => {
        // AbortController signal이 전달되었는지 확인
        const signal = (options as RequestInit)?.signal;
        expect(signal).toBeInstanceOf(AbortSignal);

        // 타임아웃 발생 시뮬레이션
        return new Promise((_, reject) => {
          const error = new Error('AbortError');
          error.name = 'AbortError';
          reject(error);
        });
      });

      await expect(
        apiRequest('/test', { timeout: 100 })
      ).rejects.toThrow(TimeoutError);
    });
  });

  describe('에러 응답 처리', () => {
    it('HTTP 에러 시 ApiError를 발생시켜야 함', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ message: 'Resource not found' })
      } as Response);

      await expect(
        apiRequest('/test')
      ).rejects.toMatchObject({
        name: 'ApiError',
        message: 'Resource not found',
        status: 404,
        statusText: 'Not Found'
      });
    });

    it('message 없는 에러 응답을 처리해야 함', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'something' })
      } as Response);

      await expect(
        apiRequest('/test')
      ).rejects.toMatchObject({
        name: 'ApiError',
        message: 'HTTP 500: Internal Server Error',
        status: 500
      });
    });

    it('응답 파싱 실패 시 ApiError를 발생시켜야 함', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => {
          throw new Error('Invalid JSON');
        }
      } as unknown as Response);

      await expect(
        apiRequest('/test')
      ).rejects.toMatchObject({
        name: 'ApiError',
        message: '응답 파싱 중 오류가 발생했습니다',
        status: 200
      });
    });
  });

  describe('네트워크 에러 처리', () => {
    it('fetch 실패 시 NetworkError를 발생시켜야 함', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network failure'));

      await expect(
        apiRequest('/test')
      ).rejects.toMatchObject({
        name: 'NetworkError',
        message: expect.stringContaining('Network failure')
      });
    });

    it('알 수 없는 에러를 NetworkError로 변환해야 함', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue('unknown error');

      await expect(
        apiRequest('/test')
      ).rejects.toMatchObject({
        name: 'NetworkError',
        message: '알 수 없는 네트워크 오류'
      });
    });
  });

  describe('커스텀 헤더', () => {
    it('커스텀 헤더를 추가해야 함', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({})
      } as Response);

      await apiRequest('/test', {
        headers: { 'X-Custom-Header': 'test-value' }
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-Header': 'test-value',
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('기본 헤더를 덮어쓸 수 있어야 함', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({})
      } as Response);

      await apiRequest('/test', {
        headers: { 'Content-Type': 'text/plain' }
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'text/plain'
          })
        })
      );
    });
  });
});

describe('api 편의 함수', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true })
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('api.get()은 GET 요청을 보내야 함', async () => {
    await api.get('/test');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('api.post()는 POST 요청을 보내야 함', async () => {
    await api.post('/test', { data: 'value' });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ data: 'value' })
      })
    );
  });

  it('api.put()은 PUT 요청을 보내야 함', async () => {
    await api.put('/test', { data: 'value' });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ data: 'value' })
      })
    );
  });

  it('api.patch()는 PATCH 요청을 보내야 함', async () => {
    await api.patch('/test', { data: 'value' });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ data: 'value' })
      })
    );
  });

  it('api.delete()는 DELETE 요청을 보내야 함', async () => {
    await api.delete('/test');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});

describe('checkApiHealth', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('API 정상 시 ok 상태를 반환해야 함', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({})
    } as Response);

    const result = await checkApiHealth();

    expect(result.status).toBe('ok');
    expect(result.timestamp).toBeGreaterThan(0);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/health'),
      expect.objectContaining({
        signal: expect.any(AbortSignal)
      })
    );
  });

  it('API 실패 시 error 상태를 반환해야 함', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Connection failed'));

    const result = await checkApiHealth();

    expect(result.status).toBe('error');
    expect(result.timestamp).toBeGreaterThan(0);
  });
});

describe('API_CONFIG', () => {
  it('API 설정이 올바르게 정의되어야 함', () => {
    expect(API_CONFIG).toBeDefined();
    expect(API_CONFIG.BASE_URL).toBeDefined();
    expect(API_CONFIG.TIMEOUT).toBe(10000);
    expect(API_CONFIG.DEFAULT_HEADERS).toEqual({
      'Content-Type': 'application/json'
    });
  });
});
