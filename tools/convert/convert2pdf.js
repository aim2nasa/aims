const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

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
// LibreOffice 실행 (spawn)
// ========================
function runLibreOffice(inputPath, outputDir) {
  return new Promise((resolve, reject) => {
    const soffice = getLibreOfficePath();
    const proc = spawn(soffice, [
      "--headless",
      "--convert-to", "pdf",
      inputPath,
      "--outdir", outputDir
    ]);

    proc.on("error", reject);

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error("LibreOffice 변환 실패"));
      }
      resolve();
    });
  });
}

// ========================
// 외부에서 호출하는 메인 함수
// ========================
async function convertToPDF(inputPath, outputDir = ".") {
  if (!fs.existsSync(inputPath)) {
    throw new Error("입력 파일이 존재하지 않습니다.");
  }

  const absInput = path.resolve(inputPath);
  const absOutputDir = path.resolve(outputDir);

  if (!fs.existsSync(absOutputDir)) {
    fs.mkdirSync(absOutputDir, { recursive: true });
  }

  return convertQueue.push(async () => {
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
module.exports = { convertToPDF, ConvertQueue };

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
