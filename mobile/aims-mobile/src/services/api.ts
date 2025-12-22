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
}

// 싱글톤 인스턴스 export
export const api = new ApiClient();
