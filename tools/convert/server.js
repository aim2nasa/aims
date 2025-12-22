const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { convertToPDF } = require("./convert2pdf");

const app = express();
const PORT = 8005;

// 임시 파일 저장 디렉토리
const TEMP_DIR = path.join(__dirname, "temp");
const OUTPUT_DIR = path.join(__dirname, "output");

// 디렉토리 생성
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// CORS 설정 (POC 테스트용 - 모든 origin 허용)
app.use(cors({
  origin: true,
  methods: ["GET", "POST"],
  credentials: true,
  exposedHeaders: ["X-Conversion-Time"]
}));

app.use(express.json());

// Multer 설정 (파일 업로드)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // 매 요청마다 디렉토리 존재 확인 (운영 중 삭제 대비)
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
    cb(null, TEMP_DIR);
  },
  filename: (req, file, cb) => {
    // 원본 파일명 유지 (한글 지원)
    const originalName = Buffer.from(file.originalname, "latin1").toString("utf8");
    const timestamp = Date.now();
    const ext = path.extname(originalName);
    const base = path.basename(originalName, ext);
    cb(null, `${timestamp}_${base}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB 제한
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = [
      ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
      ".odt", ".ods", ".odp", ".rtf", ".txt", ".csv", ".html",
      ".hwp"  // HWP 지원 (pyhwp 필요)
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`지원하지 않는 파일 형식입니다: ${ext}`));
    }
  }
});

// 모든 요청 전에 디렉토리 확인/생성 (다른 프로세스가 삭제했을 경우 대비)
app.use((req, res, next) => {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    console.log(`[디렉토리 재생성] ${TEMP_DIR}`);
  }
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`[디렉토리 재생성] ${OUTPUT_DIR}`);
  }
  next();
});

// 헬스 체크
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "pdf-converter"
  });
});

// 지원 형식 목록
app.get("/formats", (req, res) => {
  res.json({
    supported: [
      { ext: ".docx", name: "Word 문서", status: "stable" },
      { ext: ".doc", name: "Word 97-2003", status: "stable" },
      { ext: ".xlsx", name: "Excel 스프레드시트", status: "stable" },
      { ext: ".xls", name: "Excel 97-2003", status: "stable" },
      { ext: ".pptx", name: "PowerPoint 프레젠테이션", status: "stable" },
      { ext: ".ppt", name: "PowerPoint 97-2003", status: "stable" },
      { ext: ".csv", name: "CSV 파일", status: "stable" },
      { ext: ".odt", name: "OpenDocument 텍스트", status: "stable" },
      { ext: ".ods", name: "OpenDocument 스프레드시트", status: "stable" },
      { ext: ".odp", name: "OpenDocument 프레젠테이션", status: "stable" },
      { ext: ".rtf", name: "서식 있는 텍스트", status: "stable" },
      { ext: ".txt", name: "텍스트 파일", status: "stable" },
      { ext: ".html", name: "HTML 문서", status: "stable" },
      { ext: ".hwp", name: "한글 문서", status: "beta", note: "HWP v5만 지원, 복잡한 서식 손실 가능" }
    ],
    unsupported: []
  });
});

// PDF 변환
app.post("/convert", upload.single("file"), async (req, res) => {
  const startTime = Date.now();
  let tempFilePath = null;
  let pdfPath = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "파일이 업로드되지 않았습니다."
      });
    }

    tempFilePath = req.file.path;
    const originalName = Buffer.from(req.file.originalname, "latin1").toString("utf8");

    console.log(`[변환 시작] ${originalName}`);

    // PDF 변환
    pdfPath = await convertToPDF(tempFilePath, OUTPUT_DIR);

    const duration = Date.now() - startTime;
    console.log(`[변환 완료] ${originalName} (${duration}ms)`);

    // PDF 파일 전송
    const pdfFileName = path.basename(originalName, path.extname(originalName)) + ".pdf";

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(pdfFileName)}`);
    res.setHeader("X-Conversion-Time", duration.toString());

    const pdfStream = fs.createReadStream(pdfPath);
    pdfStream.pipe(res);

    // 스트림 완료 후 임시 파일 정리
    pdfStream.on("end", () => {
      cleanup(tempFilePath, pdfPath);
    });

    pdfStream.on("error", (err) => {
      console.error("[스트림 에러]", err);
      cleanup(tempFilePath, pdfPath);
    });

  } catch (err) {
    console.error(`[변환 실패] ${err.message}`);
    cleanup(tempFilePath, pdfPath);

    res.status(500).json({
      success: false,
      error: err.message,
      duration: Date.now() - startTime
    });
  }
});

// 임시 파일 정리
function cleanup(...files) {
  for (const file of files) {
    if (file && fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch (e) {
        console.error(`[정리 실패] ${file}: ${e.message}`);
      }
    }
  }
}

// 에러 핸들러
app.use((err, req, res, next) => {
  console.error("[서버 에러]", err);
  res.status(500).json({
    success: false,
    error: err.message || "서버 내부 오류"
  });
});

// 서버 시작 (0.0.0.0으로 외부 접속 허용)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════════╗
║     PDF Converter API Server               ║
╠════════════════════════════════════════════╣
║  Port: ${PORT}                               ║
║  Host: 0.0.0.0 (외부 접속 가능)            ║
║  Health: http://localhost:${PORT}/health     ║
║  Formats: http://localhost:${PORT}/formats   ║
║  Convert: POST http://localhost:${PORT}/convert
╚════════════════════════════════════════════╝
  `);
});
