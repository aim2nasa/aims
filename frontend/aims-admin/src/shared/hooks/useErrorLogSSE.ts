/**
 * 시스템 로그 실시간 스트림 훅
 * SSE를 통해 새 시스템 로그를 실시간으로 수신
 * @since 2025-12-22
 * @updated 2025-12-22 - 전체 로그 레벨 지원 (debug/info/warn/error)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ErrorLog, ErrorLogStats } from '@/features/error-logs/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

interface UseErrorLogSSEReturn {
  /** SSE 연결 상태 */
  isConnected: boolean;
  /** 실시간 통계 */
  stats: ErrorLogStats | null;
  /** 새 에러 로그 목록 (세션 중 수신된 것) */
  newLogs: ErrorLog[];
  /** 새 에러 개수 */
  newCount: number;
  /** 새 에러 목록 초기화 */
  clearNewLogs: () => void;
}

/**
 * 에러 로그 SSE 스트림 URL 생성
 */
function getStreamUrl(): string {
  const token = localStorage.getItem('aims-admin-token');
  if (!token) return '';
  return `${API_BASE_URL}/api/admin/error-logs/stream?token=${encodeURIComponent(token)}`;
}

/**
 * 에러 로그 실시간 스트림 훅
 * @param enabled SSE 연결 활성화 여부
 */
export function useErrorLogSSE(enabled: boolean = true): UseErrorLogSSEReturn {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [stats, setStats] = useState<ErrorLogStats | null>(null);
  const [newLogs, setNewLogs] = useState<ErrorLog[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // SSE 연결 설정
  const connectSSE = useCallback(() => {
    if (!enabled) return;

    // 기존 연결 정리
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const url = getStreamUrl();
    if (!url) {
      console.log('[ErrorLogSSE] 토큰이 없어 SSE 연결을 건너뜁니다.');
      return;
    }

    console.log('[ErrorLogSSE] SSE 연결 시작...');
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('connected', () => {
      console.log('[ErrorLogSSE] SSE 연결됨');
      setIsConnected(true);
    });

    eventSource.addEventListener('init', (e) => {
      try {
        const data = JSON.parse(e.data);
        setStats(data.stats);
        console.log('[ErrorLogSSE] 초기 통계 수신:', data.stats);
      } catch (error) {
        console.error('[ErrorLogSSE] init 이벤트 파싱 실패:', error);
      }
    });

    // 통계 업데이트 헬퍼
    const updateStats = (log: ErrorLog) => {
      setStats((prev) => {
        if (!prev) return prev;
        const level = log.level || 'error';
        return {
          ...prev,
          total: prev.total + 1,
          byLevel: {
            ...prev.byLevel,
            [level]: (prev.byLevel?.[level] || 0) + 1
          },
          bySeverity: log.error ? {
            ...prev.bySeverity,
            [log.error.severity]: (prev.bySeverity[log.error.severity] || 0) + 1
          } : prev.bySeverity,
          byCategory: log.error ? {
            ...prev.byCategory,
            [log.error.category]: (prev.byCategory[log.error.category] || 0) + 1
          } : prev.byCategory,
          bySource: {
            ...prev.bySource,
            [log.source.type]: (prev.bySource[log.source.type] || 0) + 1
          }
        };
      });
    };

    // 기존 new-error 이벤트 (하위 호환성)
    eventSource.addEventListener('new-error', (e) => {
      try {
        const errorLog: ErrorLog = JSON.parse(e.data);
        console.log('[SystemLogSSE] 새 에러 수신:', errorLog);
        setNewLogs((prev) => [errorLog, ...prev]);
        updateStats(errorLog);
        queryClient.invalidateQueries({ queryKey: ['admin', 'error-logs'] });
      } catch (error) {
        console.error('[SystemLogSSE] new-error 이벤트 파싱 실패:', error);
      }
    });

    // 새 로그 이벤트 (모든 레벨)
    eventSource.addEventListener('new-log', (e) => {
      try {
        const log: ErrorLog = JSON.parse(e.data);
        console.log('[SystemLogSSE] 새 로그 수신:', log);
        setNewLogs((prev) => [log, ...prev]);
        updateStats(log);
        queryClient.invalidateQueries({ queryKey: ['admin', 'error-logs'] });
      } catch (error) {
        console.error('[SystemLogSSE] new-log 이벤트 파싱 실패:', error);
      }
    });

    // 배치 로그 이벤트 (debug/info 레벨)
    eventSource.addEventListener('logs-batch', (e) => {
      try {
        const logs: ErrorLog[] = JSON.parse(e.data);
        console.log('[SystemLogSSE] 배치 로그 수신:', logs.length, '개');
        // 배치는 역순으로 추가 (최신이 앞에)
        setNewLogs((prev) => [...logs.reverse(), ...prev]);
        logs.forEach(updateStats);
        queryClient.invalidateQueries({ queryKey: ['admin', 'error-logs'] });
      } catch (error) {
        console.error('[SystemLogSSE] logs-batch 이벤트 파싱 실패:', error);
      }
    });

    eventSource.addEventListener('ping', () => {
      // Keep-alive, 무시
    });

    eventSource.onerror = (error) => {
      console.error('[ErrorLogSSE] SSE 오류:', error);
      setIsConnected(false);
      eventSource.close();

      // 5초 후 재연결 시도
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('[ErrorLogSSE] SSE 재연결 시도...');
        connectSSE();
      }, 5000);
    };
  }, [enabled, queryClient]);

  // 새 에러 목록 초기화
  const clearNewLogs = useCallback(() => {
    setNewLogs([]);
  }, []);

  // SSE 연결 관리
  useEffect(() => {
    if (enabled) {
      connectSSE();
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      setIsConnected(false);
    };
  }, [enabled, connectSSE]);

  return {
    isConnected,
    stats,
    newLogs,
    newCount: newLogs.length,
    clearNewLogs,
  };
}
