/**
 * RustDesk 포트 제어 서비스 — 호스트에서 PM2로 실행
 * UFW 명령은 호스트에서만 가능하므로 별도 서비스로 분리
 * 
 * 엔드포인트:
 *   POST /start  — 포트 열기 + 감시 프로세스 시작
 *   POST /close  — 포트 닫기 + 감시 종료
 *   GET  /status — 현재 상태 JSON
 */

const http = require("http");
const { execSync, exec } = require("child_process");

const PORT = 3015;
const SCRIPT = "/home/rossi/aims/scripts/rustdesk_port.sh";

const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "POST" && req.url === "/start") {
    exec(`/bin/bash ${SCRIPT} start`, { timeout: 10000 }, (err, stdout, stderr) => {
      if (err) {
        res.end(JSON.stringify({ success: false, error: err.message }));
        return;
      }
      try {
        res.end(stdout.trim());
      } catch {
        res.end(JSON.stringify({ success: true, raw: stdout.trim() }));
      }
    });
  } else if (req.method === "POST" && req.url === "/close") {
    exec(`/bin/bash ${SCRIPT} close`, { timeout: 10000 }, (err, stdout) => {
      if (err) {
        res.end(JSON.stringify({ success: false, error: err.message }));
        return;
      }
      try {
        res.end(stdout.trim());
      } catch {
        res.end(JSON.stringify({ success: true, raw: stdout.trim() }));
      }
    });
  } else if (req.method === "GET" && req.url === "/status") {
    exec(`/bin/bash ${SCRIPT} status`, { timeout: 5000 }, (err, stdout) => {
      if (err) {
        res.end(JSON.stringify({ status: "error", error: err.message }));
        return;
      }
      try {
        res.end(stdout.trim());
      } catch {
        res.end(JSON.stringify({ status: "unknown", raw: stdout.trim() }));
      }
    });
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ success: false, error: "Not found" }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`RustDesk port control service listening on 127.0.0.1:${PORT}`);
});
