const express = require("express");
const http = require("http");
const router = express.Router();

// rustdesk-service는 호스트 PM2에서 127.0.0.1:3015로 실행 중
// Docker 컨테이너(--network host)에서 직접 접근 가능
const RUSTDESK_SERVICE = "http://127.0.0.1:3015";

/**
 * 내부 rustdesk-service에 HTTP 요청 전달
 */
function proxyRequest(method, path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, RUSTDESK_SERVICE);
    const req = http.request(url, { method, timeout: 10000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ success: true, raw: data });
        }
      });
    });
    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("rustdesk-service 응답 타임아웃"));
    });
    req.end();
  });
}

module.exports = function (db, authenticateJWT) {
  // POST /api/rustdesk/support-request — 포트 열기
  router.post("/rustdesk/support-request", authenticateJWT, async (req, res) => {
    try {
      const result = await proxyRequest("POST", "/start");
      res.json({ success: true, ...result });
    } catch (err) {
      res.json({ success: false, error: err.message });
    }
  });

  // POST /api/rustdesk/close — 포트 닫기 (비상용)
  router.post("/rustdesk/close", authenticateJWT, async (req, res) => {
    try {
      const result = await proxyRequest("POST", "/close");
      res.json({ success: true, ...result });
    } catch (err) {
      res.json({ success: false, error: err.message });
    }
  });

  // GET /api/rustdesk/status — 포트 상태
  router.get("/rustdesk/status", authenticateJWT, async (req, res) => {
    try {
      const result = await proxyRequest("GET", "/status");
      res.json(result);
    } catch (err) {
      res.json({ status: "error", error: err.message });
    }
  });

  return router;
};
