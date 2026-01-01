import { Platform } from 'react-native';
import { ChatEvent, ApiResponse } from '../types';

// API 기본 URL (환경 변수 또는 기본값)
// 프로덕션: https://aims.giize.com (nginx 프록시 → 3010)
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://aims.giize.com';

/**
 * 기존 파일 해시 정보
 */
export interface ExistingFileHash {
  documentId: string;
  fileName: string;
  fileHash: string;
  fileSize: number;
  uploadedAt: string;
}

/**
 * 중복 검사 결과
 */
export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingDoc?: ExistingFileHash;
  newFileHash: string;
}

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

  // 문서 업로드 (React Native + Web 호환)
  async uploadDocument(
    file: { uri: string; name: string; mimeType?: string },
    customerId?: string
  ): Promise<{ success: boolean; docId?: string; error?: string }> {
    const formData = new FormData();

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

    const UPLOAD_URL = `${API_BASE_URL}/shadow/docprep-main`;
    console.log(`[API] 📤 업로드 시작: ${file.name} (userId: ${userId}, customerId: ${customerId || 'none'}, platform: ${Platform.OS})`);

    try {
      // 웹에서는 blob URI를 실제 파일로 변환
      if (Platform.OS === 'web') {
        const response = await fetch(file.uri);
        const blob = await response.blob();
        const webFile = new File([blob], file.name, { type: file.mimeType || 'application/octet-stream' });
        formData.append('file', webFile);
        console.log('[API] 웹 파일 변환 완료:', webFile.name, webFile.size, webFile.type);
      } else {
        // React Native에서 파일 추가 방식
        formData.append('file', {
          uri: file.uri,
          name: file.name,
          type: file.mimeType || 'application/octet-stream',
        } as any);
      }
    } catch (e) {
      console.error('[API] 파일 변환 실패:', e);
      return { success: false, error: '파일 변환 실패' };
    }

    formData.append('userId', userId);

    // 고객 ID가 있으면 추가
    if (customerId) {
      formData.append('customerId', customerId);
    }

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
              error: result.message || result.detail?.[0]?.msg || `HTTP ${xhr.status}`,
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

  // 고객 검색 (이름으로) - aims-uix3 동일 로직
  async findCustomerByName(name: string): Promise<{ id: string; name: string } | null> {
    console.log('[API] 고객 검색 시작:', name);
    try {
      // 검색어에서 "고객", "문서" 등 불필요한 단어 제거하여 순수 이름만 추출
      const cleanName = name
        .replace(/고객|문서|를|을|에게|첨부|해줘|등록|보여줘/g, '')
        .trim();

      if (!cleanName) {
        console.log('[API] 정제 후 빈 문자열');
        return null;
      }

      console.log('[API] 정제된 검색어:', cleanName);

      const response = await this.get<{
        success?: boolean;
        data?: {
          customers: Array<{
            _id: string;
            name?: string;
            personal_info?: { name?: string };
          }>;
        };
        customers?: Array<{
          _id: string;
          name?: string;
          personal_info?: { name?: string };
        }>;
      }>(`/api/customers?search=${encodeURIComponent(cleanName)}&limit=5`);

      console.log('[API] 고객 검색 응답:', JSON.stringify(response));

      // API 응답 구조: response.data.customers 또는 response.customers
      const customers = response.data?.customers || response.customers || [];

      if (customers.length > 0) {
        // 정확히 일치하는 고객만 반환 (aims-uix3 동일)
        // 고객명은 personal_info.name 또는 name에 있을 수 있음
        const exactMatch = customers.find(c => {
          const customerName = c.personal_info?.name || c.name;
          return customerName === cleanName;
        });
        if (exactMatch) {
          const matchedName = exactMatch.personal_info?.name || exactMatch.name || cleanName;
          console.log('[API] 정확 매칭:', exactMatch._id, matchedName);
          return { id: exactMatch._id, name: matchedName };
        }
        console.log('[API] 검색 결과 있으나 정확 매칭 없음');
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

// ============================================
// 중복 파일 검사 유틸리티
// ============================================

/**
 * 고객 문서 목록 응답 타입
 */
interface CustomerDocumentsResponse {
  success?: boolean;
  data?: {
    customer_id?: string;
    documents?: Array<{
      _id: string;
      originalName?: string;
      filename?: string;
      fileSize?: number;
      uploadedAt?: string;
      linkedAt?: string;
    }>;
    total?: number;
  };
}

/**
 * 문서 상태 응답 타입
 */
interface DocumentStatusResponse {
  success?: boolean;
  data?: {
    raw?: {
      meta?: {
        file_hash?: string;
      };
    };
  };
}

/**
 * 고객의 기존 문서 해시 목록 조회
 *
 * @param customerId 고객 ID
 * @returns 기존 문서 해시 목록
 */
export async function getCustomerFileHashes(customerId: string): Promise<ExistingFileHash[]> {
  if (!customerId?.trim()) {
    return [];
  }

  try {
    // 1. 고객의 문서 목록 조회
    const response = await api.get<CustomerDocumentsResponse>(
      `/api/customers/${customerId}/documents`
    );

    const documents = response?.data?.documents || [];

    if (documents.length === 0) {
      return [];
    }

    // 2. 각 문서의 해시 조회 (병렬 처리)
    // 해시가 없어도 파일명 기반 비교를 위해 정보 반환
    const hashPromises = documents.map(async (doc): Promise<ExistingFileHash> => {
      const fileName = doc.originalName || doc.filename || 'unknown';
      const fileSize = doc.fileSize || 0;
      const uploadedAt = doc.uploadedAt || doc.linkedAt || '';

      try {
        const statusResponse = await api.get<DocumentStatusResponse>(
          `/api/documents/${doc._id}/status`
        );

        const fileHash = statusResponse?.data?.raw?.meta?.file_hash || '';

        return {
          documentId: doc._id,
          fileName,
          fileHash,
          fileSize,
          uploadedAt,
        };
      } catch {
        // 해시 조회 실패 시에도 파일명 정보는 반환 (fallback용)
        return {
          documentId: doc._id,
          fileName,
          fileHash: '',
          fileSize,
          uploadedAt,
        };
      }
    });

    const results = await Promise.all(hashPromises);
    return results;
  } catch (error) {
    console.error('[duplicateChecker] 고객 문서 해시 조회 실패:', error);
    return [];
  }
}

/**
 * 파일의 SHA-256 해시 계산 (React Native + Web 호환)
 *
 * @param fileUri 파일 URI
 * @param mimeType 파일 MIME 타입
 * @returns SHA-256 해시 (64자 hex string)
 */
export async function calculateFileHash(fileUri: string, mimeType?: string): Promise<string> {
  // React Native에서는 Web Crypto API가 없음 - 조용히 fallback
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    return '';
  }

  try {
    // 파일을 fetch로 읽어서 ArrayBuffer로 변환
    const response = await fetch(fileUri);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();

    // SHA-256 해시 계산 (Web Crypto API)
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);

    // ArrayBuffer를 hex string으로 변환
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return hashHex;
  } catch (error) {
    // 조용히 fallback
    // 해시 계산 실패 시 빈 문자열 반환 (파일명 비교로 fallback)
    return '';
  }
}

/**
 * 파일이 중복인지 확인
 *
 * 검사 우선순위:
 * 1. SHA-256 해시 비교 (정확한 중복 검사)
 * 2. 파일명 비교 (fallback - 백엔드에서 해시 미제공 시)
 *
 * @param file 확인할 파일 { uri, name, mimeType }
 * @param existingHashes 기존 문서 해시 목록
 * @returns 중복 검사 결과
 */
export async function checkDuplicateFile(
  file: { uri: string; name: string; mimeType?: string },
  existingHashes: ExistingFileHash[]
): Promise<DuplicateCheckResult> {
  // 파일 해시 계산
  const newFileHash = await calculateFileHash(file.uri, file.mimeType);

  // 1차: 해시 비교 (가장 정확)
  if (newFileHash) {
    const hashMatch = existingHashes.find(
      (doc) => doc.fileHash && doc.fileHash === newFileHash
    );

    if (hashMatch) {
      return {
        isDuplicate: true,
        existingDoc: hashMatch,
        newFileHash,
      };
    }
  }

  // 2차: 파일명 비교 (fallback - 해시가 없는 기존 문서와 비교)
  // 해시가 없는 문서들 중에서 파일명이 일치하는 것 찾기
  const nameMatch = existingHashes.find(
    (doc) => !doc.fileHash && doc.fileName === file.name
  );

  if (nameMatch) {
    return {
      isDuplicate: true,
      existingDoc: nameMatch,
      newFileHash: newFileHash || '',
    };
  }

  return {
    isDuplicate: false,
    newFileHash: newFileHash || '',
  };
}

/**
 * 여러 파일의 중복 일괄 검사
 *
 * @param files 검사할 파일 목록
 * @param existingHashes 기존 문서 해시 목록
 * @returns { duplicates: 중복 파일명[], nonDuplicates: 중복 아닌 파일[] }
 */
export async function filterDuplicateFiles(
  files: Array<{ uri: string; name: string; mimeType?: string }>,
  existingHashes: ExistingFileHash[]
): Promise<{
  duplicates: string[];
  nonDuplicates: Array<{ uri: string; name: string; mimeType?: string }>;
}> {
  const duplicates: string[] = [];
  const nonDuplicates: Array<{ uri: string; name: string; mimeType?: string }> = [];

  // 병렬로 모든 파일 해시 계산 및 비교
  const checkPromises = files.map(async (file) => {
    const result = await checkDuplicateFile(file, existingHashes);
    return { file, result };
  });

  const checkResults = await Promise.all(checkPromises);

  for (const { file, result } of checkResults) {
    if (result.isDuplicate) {
      duplicates.push(file.name);
    } else {
      nonDuplicates.push(file);
    }
  }

  return { duplicates, nonDuplicates };
}
