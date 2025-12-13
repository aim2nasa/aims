const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

// ========================
// 설정
// ========================
const CONVERT_TIMEOUT_MS = 120000; // 2분 타임아웃

// ========================
// 좀비 프로세스 정리
// ========================
function killZombieProcesses() {
  try {
    if (process.platform === "win32") {
      // Windows: taskkill로 soffice 프로세스 종료
      execSync('taskkill /F /IM soffice.exe /T 2>nul', { stdio: 'ignore' });
      execSync('taskkill /F /IM soffice.bin /T 2>nul', { stdio: 'ignore' });
    } else {
      // Linux/Mac: pkill로 soffice 프로세스 종료
      execSync('pkill -9 soffice 2>/dev/null || true', { stdio: 'ignore' });
    }
  } catch (e) {
    // 프로세스가 없으면 에러 발생 - 무시
  }
}

// 프로세스 종료 대기 (동기)
function waitForProcessCleanup(delayMs = 500) {
  const start = Date.now();
  while (Date.now() - start < delayMs) {
    // busy wait - 프로세스 완전 종료 대기
  }
}

// soffice 프로세스 존재 여부 확인
function isSofficeRunning() {
  try {
    if (process.platform === "win32") {
      const result = execSync('tasklist /FI "IMAGENAME eq soffice.exe" 2>nul', { encoding: 'utf8' });
      return result.includes('soffice.exe');
    } else {
      execSync('pgrep soffice', { stdio: 'ignore' });
      return true;
    }
  } catch (e) {
    return false;
  }
}

// 안전한 프로세스 정리 (확인 포함)
function safeCleanup() {
  const maxRetries = 3;

  for (let i = 0; i < maxRetries; i++) {
    if (!isSofficeRunning()) {
      return; // 프로세스 없음 - 정상
    }

    console.log(`[convert2pdf] soffice 프로세스 발견 - 정리 시도 ${i + 1}/${maxRetries}`);
    killZombieProcesses();
    waitForProcessCleanup(1000); // 1초 대기
  }

  if (isSofficeRunning()) {
    console.error('[convert2pdf] 경고: soffice 프로세스 정리 실패 - 변환 시도 계속');
  }
}

// ========================
// 변환 작업 큐 (동시 실행 제한)
// ========================
class ConvertQueue {
  constructor(limit = 1) {
    this.limit = limit;
    this.running = 0;
    this.queue = [];
  }

  push(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this._next();
    });
  }

  async _next() {
    if (this.running >= this.limit) return;
    const item = this.queue.shift();
    if (!item) return;

    this.running++;
    try {
      const result = await item.task();
      item.resolve(result);
    } catch (e) {
      item.reject(e);
    } finally {
      this.running--;
      this._next();
    }
  }
}

// 서버 기준: 동시에 1개만 실행 (가장 안전)
const convertQueue = new ConvertQueue(1);

// ========================
// LibreOffice 경로 (OS별)
// ========================
function getLibreOfficePath() {
  if (process.platform === "win32") {
    // Windows
    const paths = [
      "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe"
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
    throw new Error("LibreOffice를 찾을 수 없습니다. 설치되어 있는지 확인하세요.");
  }
  // Linux/Mac
  return "libreoffice";
}

// ========================
// LibreOffice 실행 (spawn + 타임아웃)
// ========================
function runLibreOffice(inputPath, outputDir) {
  return new Promise((resolve, reject) => {
    const soffice = getLibreOfficePath();
    let killed = false;
    let stderr = "";

    const proc = spawn(soffice, [
      "--headless",
      "--convert-to", "pdf",
      inputPath,
      "--outdir", outputDir
    ]);

    // 타임아웃 설정
    const timeout = setTimeout(() => {
      killed = true;
      console.error(`[convert2pdf] 타임아웃 (${CONVERT_TIMEOUT_MS / 1000}초) - 프로세스 강제 종료`);

      // 프로세스 트리 전체 종료
      try {
        if (process.platform === "win32") {
          execSync(`taskkill /F /T /PID ${proc.pid} 2>nul`, { stdio: 'ignore' });
        } else {
          process.kill(-proc.pid, 'SIGKILL');
        }
      } catch (e) {
        proc.kill('SIGKILL');
      }
    }, CONVERT_TIMEOUT_MS);

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`LibreOffice 실행 실패: ${err.message}`));
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);

      if (killed) {
        return reject(new Error("LibreOffice 변환 타임아웃 - 파일이 너무 크거나 복잡합니다"));
      }

      if (code !== 0) {
        const errMsg = stderr ? `: ${stderr.trim()}` : "";
        return reject(new Error(`LibreOffice 변환 실패 (code: ${code})${errMsg}`));
      }

      resolve();
    });
  });
}

// ========================
// 외부에서 호출하는 메인 함수
// ========================
async function convertToPDF(inputPath, outputDir = ".", options = {}) {
  const { cleanupBefore = true } = options;

  if (!fs.existsSync(inputPath)) {
    throw new Error("입력 파일이 존재하지 않습니다.");
  }

  const absInput = path.resolve(inputPath);
  const absOutputDir = path.resolve(outputDir);

  if (!fs.existsSync(absOutputDir)) {
    fs.mkdirSync(absOutputDir, { recursive: true });
  }

  return convertQueue.push(async () => {
    // 변환 전 좀비 프로세스 정리 (확인 포함)
    if (cleanupBefore) {
      safeCleanup();
    }

    await runLibreOffice(absInput, absOutputDir);

    const pdfPath = path.join(
      absOutputDir,
      path.basename(absInput, path.extname(absInput)) + ".pdf"
    );

    if (!fs.existsSync(pdfPath)) {
      throw new Error("PDF 변환 실패: 출력 파일 없음");
    }

    return pdfPath;
  });
}

// ========================
// 모듈 내보내기
// ========================
module.exports = { convertToPDF, ConvertQueue, killZombieProcesses, safeCleanup, isSofficeRunning };

// ========================
// CLI 실행 (직접 실행 시에만)
// ========================
if (require.main === module) {
  (async () => {
    const [,, inputFile, outputDir = "."] = process.argv;

    if (!inputFile) {
      console.error("사용법: node convert2pdf.js <inputFile> [outputDir]");
      process.exit(1);
    }

    try {
      const pdfPath = await convertToPDF(inputFile, outputDir);
      console.log(`✅ 변환 완료: ${pdfPath}`);
    } catch (err) {
      console.error(`❌ 오류: ${err.message}`);
      process.exit(1);
    }
  })();
}
