/**
 * HTTP/TCP 헬스체크 모듈
 */

import http from 'http';
import net from 'net';
import { config } from './config';

export interface HealthCheckResult {
  healthy: boolean;
  responseTime: number;
  error: string | null;
  statusCode?: number;
}

/**
 * HTTP 헬스체크
 * @param port 포트 번호
 * @param path 헬스 엔드포인트 경로
 * @param timeout 타임아웃 (ms)
 */
export function checkHttpHealth(
  port: number,
  path: string,
  timeout: number = config.healthTimeout
): Promise<HealthCheckResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();

    const options: http.RequestOptions = {
      hostname: 'localhost',
      port,
      path,
      method: 'GET',
      timeout
    };

    const req = http.request(options, (res) => {
      const responseTime = Date.now() - startTime;

      // 2xx 응답은 healthy
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        resolve({
          healthy: true,
          responseTime,
          error: null,
          statusCode: res.statusCode
        });
      } else {
        resolve({
          healthy: false,
          responseTime,
          error: `HTTP ${res.statusCode}`,
          statusCode: res.statusCode
        });
      }

      // 응답 바디 drain (메모리 누수 방지)
      res.resume();
    });

    req.on('error', (err) => {
      const responseTime = Date.now() - startTime;
      resolve({
        healthy: false,
        responseTime,
        error: err.message
      });
    });

    req.on('timeout', () => {
      req.destroy();
      const responseTime = Date.now() - startTime;
      resolve({
        healthy: false,
        responseTime,
        error: `Timeout (${timeout}ms)`
      });
    });

    req.end();
  });
}

/**
 * TCP 포트 체크 (MongoDB, Qdrant 등)
 * @param port 포트 번호
 * @param timeout 타임아웃 (ms)
 */
export function checkTcpHealth(
  port: number,
  timeout: number = config.healthTimeout
): Promise<HealthCheckResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      const responseTime = Date.now() - startTime;
      socket.destroy();
      resolve({
        healthy: true,
        responseTime,
        error: null
      });
    });

    socket.on('timeout', () => {
      const responseTime = Date.now() - startTime;
      socket.destroy();
      resolve({
        healthy: false,
        responseTime,
        error: `Timeout (${timeout}ms)`
      });
    });

    socket.on('error', (err) => {
      const responseTime = Date.now() - startTime;
      socket.destroy();
      resolve({
        healthy: false,
        responseTime,
        error: err.message
      });
    });

    socket.connect(port, 'localhost');
  });
}
