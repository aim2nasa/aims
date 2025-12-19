/**
 * 문서 처리 완료 대기 유틸리티 함수 (SSE 기반)
 * 폴링 대신 SSE로 문서 OCR 처리 완료를 대기
 * @since 2025-12-19
 */

import { getAuthToken } from '@/shared/lib/api';

const API_BASE_URL = import.meta.env['VITE_API_BASE_URL'] || '';

export type ProcessingResult =
  | { success: true; status: 'completed' }
  | { success: true; status: 'error' }
  | { success: false; status: 'timeout' }
  | { success: false; status: 'connection_error'; error: unknown };

interface WaitOptions {
  /** 타임아웃 (ms, 기본: 180000 = 3분) */
  timeout?: number;
}

/**
 * 문서 처리 완료를 SSE로 대기
 * @param documentId 문서 ID
 * @param options 옵션
 * @returns Promise<ProcessingResult>
 */
export function waitForDocumentProcessing(
  documentId: string,
  options: WaitOptions = {}
): Promise<ProcessingResult> {
  const { timeout = 180000 } = options;

  return new Promise((resolve) => {
    const token = getAuthToken();
    if (!token) {
      console.error('[waitForDocumentProcessing] 인증 토큰 없음');
      resolve({ success: false, status: 'connection_error', error: new Error('No auth token') });
      return;
    }

    const url = `${API_BASE_URL}/api/documents/${documentId}/status/stream?token=${encodeURIComponent(token)}`;
    console.log('[waitForDocumentProcessing] SSE 연결 시작:', { documentId, url: url.replace(/token=[^&]+/, 'token=***') });

    let eventSource: EventSource | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let resolved = false;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };

    const doResolve = (result: ProcessingResult) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(result);
      }
    };

    // 클라이언트 측 타임아웃
    timeoutId = setTimeout(() => {
      console.log('[waitForDocumentProcessing] 클라이언트 타임아웃:', documentId);
      doResolve({ success: false, status: 'timeout' });
    }, timeout);

    try {
      eventSource = new EventSource(url);

      // 연결 성공
      eventSource.addEventListener('connected', (e) => {
        try {
          const data = JSON.parse(e.data);
          console.log('[waitForDocumentProcessing] 연결됨:', data);
        } catch (error) {
          console.error('[waitForDocumentProcessing] connected 이벤트 파싱 실패:', error);
        }
      });

      // 처리 완료 이벤트
      eventSource.addEventListener('processing-complete', (e) => {
        try {
          const data = JSON.parse(e.data);
          console.log('[waitForDocumentProcessing] 처리 완료:', data);

          if (data.status === 'completed') {
            doResolve({ success: true, status: 'completed' });
          } else {
            doResolve({ success: true, status: 'error' });
          }
        } catch (error) {
          console.error('[waitForDocumentProcessing] processing-complete 이벤트 파싱 실패:', error);
        }
      });

      // 서버 측 타임아웃 이벤트
      eventSource.addEventListener('timeout', (e) => {
        try {
          const data = JSON.parse(e.data);
          console.log('[waitForDocumentProcessing] 서버 타임아웃:', data);
          doResolve({ success: false, status: 'timeout' });
        } catch (error) {
          console.error('[waitForDocumentProcessing] timeout 이벤트 파싱 실패:', error);
        }
      });

      // ping 이벤트 (keep-alive)
      eventSource.addEventListener('ping', () => {
        // keep-alive, 무시
      });

      // 연결 오류 처리
      eventSource.onerror = (error) => {
        console.error('[waitForDocumentProcessing] 연결 오류:', error);
        doResolve({ success: false, status: 'connection_error', error });
      };
    } catch (error) {
      console.error('[waitForDocumentProcessing] SSE 생성 실패:', error);
      doResolve({ success: false, status: 'connection_error', error });
    }
  });
}

export default waitForDocumentProcessing;
