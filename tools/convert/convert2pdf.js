const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

async function convertToPDF(inputPath, outputDir) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(inputPath)) {
      return reject(new Error("입력 파일이 존재하지 않습니다."));
    }

    const absInput = path.resolve(inputPath);
    const absOutputDir = path.resolve(outputDir);

    // OS에 따라 LibreOffice 실행 파일 경로 다름
    let libreOfficeCmd = "libreoffice"; // Linux 기본
    if (os.platform() === "win32") {
      libreOfficeCmd = `"C:\\Program Files\\LibreOffice\\program\\soffice.exe"`;
    }

    const command = `${libreOfficeCmd} --headless --convert-to pdf "${absInput}" --outdir "${absOutputDir}"`;

    exec(command, (error, stdout, stderr) => {
      console.log("=== 실행된 명령 ===");
      console.log(command);
      console.log("=== LibreOffice STDOUT ===");
      console.log(stdout);
      console.log("=== LibreOffice STDERR ===");
      console.log(stderr);

      if (error) {
        return reject(new Error(stderr || error.message));
      }

      const pdfFile = path.join(
        absOutputDir,
        path.basename(absInput, path.extname(absInput)) + ".pdf"
      );
      if (!fs.existsSync(pdfFile)) {
        return reject(new Error("PDF 변환 실패: 출력 파일 없음"));
      }
      resolve(pdfFile);
    });
  });
}

// CLI 실행 부분
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
