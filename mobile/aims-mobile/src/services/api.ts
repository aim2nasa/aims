import { ChatEvent, ApiResponse } from '../types';

// API 기본 URL (환경 변수 또는 기본값)
// 프로덕션: https://aims.giize.com (nginx 프록시 → 3010)
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://aims.giize.com';

// API 에러 클래스
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// API 클라이언트 클래스
class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  // GET 요청
  async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError(response.status, errorText);
    }

    return response.json();
  }

  // POST 요청
  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError(response.status, errorText);
    }

    return response.json();
  }

  // DELETE 요청
  async delete<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError(response.status, errorText);
    }

    return response.json();
  }

  // PATCH 요청
  async patch<T>(endpoint: string, body?: unknown): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError(response.status, errorText);
    }

    return response.json();
  }

  // SSE 스트리밍 (채팅용) - React Native 호환 버전
  async *streamSSE(endpoint: string, body: unknown): AsyncGenerator<ChatEvent> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = this.getHeaders();

    // 이벤트를 수집할 배열과 완료 플래그
    const events: ChatEvent[] = [];
    let isDone = false;
    let error: Error | null = null;
    let resolveWait: (() => void) | null = null;

    // XMLHttpRequest 사용 (React Native에서 더 안정적)
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);

    Object.entries(headers).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value as string);
    });

    let lastIndex = 0;
    let buffer = '';

    xhr.onprogress = () => {
      const newData = xhr.responseText.substring(lastIndex);
      lastIndex = xhr.responseText.length;

      buffer += newData;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr) {
            try {
              const event = JSON.parse(jsonStr) as ChatEvent;
              events.push(event);
              if (resolveWait) {
                resolveWait();
                resolveWait = null;
              }
            } catch (e) {
              console.warn('Failed to parse SSE event:', jsonStr);
            }
          }
        }
      }
    };

    xhr.onload = () => {
      // HTTP 오류 확인
      if (xhr.status >= 400) {
        error = new ApiError(xhr.status, xhr.responseText || `HTTP 오류: ${xhr.status}`);
        isDone = true;
        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
        return;
      }

      // 남은 버퍼 처리
      if (buffer.startsWith('data: ')) {
        const jsonStr = buffer.slice(6).trim();
        if (jsonStr) {
          try {
            const event = JSON.parse(jsonStr) as ChatEvent;
            events.push(event);
          } catch (e) {
            console.warn('Failed to parse final SSE event:', jsonStr);
          }
        }
      }
      isDone = true;
      if (resolveWait) {
        resolveWait();
        resolveWait = null;
      }
    };

    xhr.onerror = () => {
      error = new ApiError(xhr.status || 500, xhr.statusText || '네트워크 오류가 발생했습니다.');
      isDone = true;
      if (resolveWait) {
        resolveWait();
        resolveWait = null;
      }
    };

    xhr.send(JSON.stringify(body));

    // 이벤트를 하나씩 yield
    let yieldIndex = 0;
    while (!isDone || yieldIndex < events.length) {
      if (yieldIndex < events.length) {
        yield events[yieldIndex++];
      } else if (!isDone) {
        // 새 이벤트 대기
        await new Promise<void>(resolve => {
          resolveWait = resolve;
        });
      }
    }

    if (error) {
      throw error;
    }
  }

  // FormData POST (파일 업로드용)
  async postFormData<T>(endpoint: string, formData: FormData): Promise<T> {
    const headers: HeadersInit = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError(response.status, errorText);
    }

    return response.json();
  }

  // 문서 업로드 (React Native용)
  async uploadDocument(
    file: { uri: string; name: string; mimeType?: string },
    customerId?: string
  ): Promise<{ success: boolean; docId?: string; error?: string }> {
    const formData = new FormData();

    // React Native에서 파일 추가 방식
    formData.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.mimeType || 'application/octet-stream',
    } as any);

    // 토큰에서 userId 추출 (JWT 디코드)
    let userId = 'mobile-user';
    if (this.token) {
      try {
        const payload = JSON.parse(atob(this.token.split('.')[1]));
        userId = payload.userId || payload.id || 'mobile-user';
      } catch (e) {
        console.warn('Failed to decode JWT for userId');
      }
    }
    formData.append('userId', userId);

    // 고객 ID가 있으면 추가
    if (customerId) {
      formData.append('customerId', customerId);
    }

    const UPLOAD_URL = `${API_BASE_URL}/shadow/docprep-main`;

    console.log(`[API] 📤 업로드 시작: ${file.name} (userId: ${userId}, customerId: ${customerId || 'none'})`);

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', UPLOAD_URL, true);

      if (this.token) {
        xhr.setRequestHeader('Authorization', `Bearer ${this.token}`);
      }

      xhr.onload = () => {
        try {
          const result = xhr.responseText ? JSON.parse(xhr.responseText) : {};
          if (xhr.status >= 200 && xhr.status < 300) {
            console.log(`[API] ✅ 업로드 성공: ${file.name}`, result);
            resolve({
              success: true,
              docId: result.doc_id || result.id || result._id || '',
            });
          } else {
            console.error(`[API] ❌ 업로드 실패: HTTP ${xhr.status}`, result);
            resolve({
              success: false,
              error: result.message || `HTTP ${xhr.status}`,
            });
          }
        } catch (e) {
          console.error('[API] ❌ 응답 파싱 실패:', e);
          resolve({ success: false, error: '응답 파싱 실패' });
        }
      };

      xhr.onerror = () => {
        console.error('[API] ❌ 네트워크 오류');
        resolve({ success: false, error: '네트워크 오류' });
      };

      xhr.send(formData);
    });
  }

  // 고객 검색 (이름으로)
  async findCustomerByName(name: string): Promise<{ id: string; name: string } | null> {
    console.log('[API] 고객 검색 시작:', name);
    try {
      // 검색어에서 "고객", "문서" 등 불필요한 단어 제거하여 순수 이름만 추출
      const cleanName = name
        .replace(/고객|문서|를|을|에게|첨부|해줘|등록|보여줘/g, '')
        .trim();

      console.log('[API] 정제된 검색어:', cleanName);

      const response = await this.get<{ customers: Array<{ _id: string; name: string }> }>(
        `/api/customers?search=${encodeURIComponent(cleanName)}&limit=5`
      );

      console.log('[API] 고객 검색 응답:', JSON.stringify(response));

      if (response.customers && response.customers.length > 0) {
        // 정확히 일치하는 고객 우선, 없으면 첫 번째 결과
        const exactMatch = response.customers.find(
          c => c.name === cleanName || c.name.includes(cleanName)
        );
        const customer = exactMatch || response.customers[0];
        console.log('[API] 찾은 고객:', customer);
        return { id: customer._id, name: customer.name };
      }
      console.log('[API] 고객을 찾을 수 없음');
      return null;
    } catch (e) {
      console.error('[API] 고객 검색 실패:', e);
      return null;
    }
  }
}

// 싱글톤 인스턴스 export
export const api = new ApiClient();
