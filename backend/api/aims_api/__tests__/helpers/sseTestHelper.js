/**
 * sseTestHelper.js
 * SSE (Server-Sent Events) 엔드포인트 테스트 유틸리티
 *
 * SSE는 long-lived 연결이므로 supertest로는 테스트 불가.
 * raw HTTP 연결을 열어 이벤트 스트림을 파싱.
 *
 * @since 2026-02-07
 */

const http = require('http');

/**
 * SSE 엔드포인트에 연결하여 이벤트 수집
 *
 * @param {string} url - 전체 URL (http://host:port/api/...)
 * @param {object} options
 * @param {object} options.headers - 추가 헤더
 * @param {number} options.timeoutMs - 타임아웃 (ms, 기본 5000)
 * @param {number} options.maxEvents - 최대 수집 이벤트 수 (기본 3)
 * @returns {Promise<{ events: Array, statusCode: number, headers: object }>}
 */
function connectSSE(url, {
  headers = {},
  timeoutMs = 5000,
  maxEvents = 3,
} = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);

    const events = [];
    let buffer = '';
    let statusCode;
    let responseHeaders;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        Accept: 'text/event-stream',
        ...headers,
      },
    };

    const req = http.get(options, (res) => {
      statusCode = res.statusCode;
      responseHeaders = res.headers;

      // SSE가 아닌 응답이면 즉시 반환
      if (!res.headers['content-type']?.includes('text/event-stream')) {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          resolve({ events: [], statusCode, headers: responseHeaders, body });
        });
        return;
      }

      res.on('data', (chunk) => {
        buffer += chunk.toString();

        // SSE 이벤트 파싱
        const lines = buffer.split('\n');
        buffer = lines.pop(); // 불완전한 마지막 줄 보관

        let currentEvent = {};
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent.event = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            try {
              currentEvent.data = JSON.parse(dataStr);
            } catch {
              currentEvent.data = dataStr;
            }
          } else if (line === '') {
            if (currentEvent.event || currentEvent.data) {
              events.push({ ...currentEvent });
              currentEvent = {};
            }
          }
        }

        if (events.length >= maxEvents) {
          req.destroy();
          resolve({ events, statusCode, headers: responseHeaders });
        }
      });
    });

    req.on('error', (err) => {
      if (events.length > 0) {
        resolve({ events, statusCode, headers: responseHeaders });
      } else {
        // 연결 거부 등은 정상적인 테스트 실패
        resolve({ events: [], statusCode: 0, headers: {}, error: err.message });
      }
    });

    // 타임아웃
    setTimeout(() => {
      req.destroy();
      resolve({ events, statusCode, headers: responseHeaders });
    }, timeoutMs);
  });
}

module.exports = { connectSSE };
