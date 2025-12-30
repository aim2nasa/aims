/**
 * 바이러스 스캔 SSE 훅
 * 실시간 바이러스 스캔 알림 수신
 * @since 2025-12-30
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export interface VirusScanEvent {
  type: 'connected' | 'ping' | 'virus-detected' | 'virus-scan-complete' | 'virus-file-deleted' | 'virus-scan-progress';
  data: Record<string, unknown>;
  timestamp: Date;
}

export interface VirusDetectedData {
  documentId: string;
  collectionName: string;
  filePath: string;
  threatName: string;
  userId?: string;
  detectedAt: string;
}

export interface ScanProgressData {
  is_running?: boolean;
  isComplete?: boolean;
  totalFiles: number;
  scannedFiles: number;
  infectedFiles: number;
  progress_percent?: number;
  completedAt?: string;
}

interface UseVirusScanSSEReturn {
  isConnected: boolean;
  events: VirusScanEvent[];
  lastVirusDetected: VirusDetectedData | null;
  scanProgress: ScanProgressData | null;
  clearEvents: () => void;
}

export function useVirusScanSSE(): UseVirusScanSSEReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [events, setEvents] = useState<VirusScanEvent[]>([]);
  const [lastVirusDetected, setLastVirusDetected] = useState<VirusDetectedData | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanProgressData | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const queryClient = useQueryClient();

  const connect = useCallback(() => {
    // 기존 연결 정리
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const token = localStorage.getItem('aims-admin-token');
    if (!token) {
      console.log('[VirusScan-SSE] 토큰 없음, 연결 스킵');
      return;
    }

    const baseURL = import.meta.env.VITE_API_BASE_URL || '';
    const url = `${baseURL}/api/admin/virus-scan/stream?token=${encodeURIComponent(token)}`;

    console.log('[VirusScan-SSE] 연결 시도...');
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[VirusScan-SSE] 연결됨');
      setIsConnected(true);
    };

    eventSource.onerror = (error) => {
      console.error('[VirusScan-SSE] 오류:', error);
      setIsConnected(false);
      eventSource.close();

      // 5초 후 재연결
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = window.setTimeout(() => {
        console.log('[VirusScan-SSE] 재연결 시도...');
        connect();
      }, 5000);
    };

    // 이벤트 핸들러들
    eventSource.addEventListener('connected', (event) => {
      const data = JSON.parse(event.data);
      addEvent('connected', data);
    });

    eventSource.addEventListener('ping', (event) => {
      const data = JSON.parse(event.data);
      addEvent('ping', data);
    });

    eventSource.addEventListener('virus-detected', (event) => {
      const data = JSON.parse(event.data) as VirusDetectedData;
      addEvent('virus-detected', data);
      setLastVirusDetected(data);

      // 쿼리 캐시 무효화
      queryClient.invalidateQueries({ queryKey: ['virus-scan'] });

      // 브라우저 알림 (권한이 있는 경우)
      if (Notification.permission === 'granted') {
        new Notification('바이러스 감지!', {
          body: `${data.threatName}\n${data.filePath}`,
          icon: '/virus-alert.png',
          tag: 'virus-detected'
        });
      }
    });

    eventSource.addEventListener('virus-scan-complete', (event) => {
      const data = JSON.parse(event.data);
      addEvent('virus-scan-complete', data);

      // 쿼리 캐시 무효화
      queryClient.invalidateQueries({ queryKey: ['virus-scan'] });
    });

    eventSource.addEventListener('virus-file-deleted', (event) => {
      const data = JSON.parse(event.data);
      addEvent('virus-file-deleted', data);

      // 쿼리 캐시 무효화
      queryClient.invalidateQueries({ queryKey: ['virus-scan'] });
    });

    eventSource.addEventListener('virus-scan-progress', (event) => {
      const data = JSON.parse(event.data) as ScanProgressData;
      addEvent('virus-scan-progress', data);
      setScanProgress(data);

      if (data.isComplete) {
        // 쿼리 캐시 무효화
        queryClient.invalidateQueries({ queryKey: ['virus-scan'] });
      }
    });
  }, [queryClient]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addEvent = (type: VirusScanEvent['type'], data: any) => {
    setEvents((prev) => {
      const newEvents = [...prev, { type, data, timestamp: new Date() }];
      // 최대 100개 유지
      return newEvents.slice(-100);
    });
  };

  const clearEvents = useCallback(() => {
    setEvents([]);
    setLastVirusDetected(null);
    setScanProgress(null);
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  return {
    isConnected,
    events,
    lastVirusDetected,
    scanProgress,
    clearEvents
  };
}
