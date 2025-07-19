#!/usr/bin/env node

/**
 * file_analyzer.js
 * 
 * Usage: node file_analyzer.js <filePath>
 */

const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const pdfParse = require('pdf-parse');
const exif = require('exif-parser');

async function getFileMetadata(filePath) {
  const meta = {
    filename: path.basename(filePath),
    extension: path.extname(filePath),
    mime: null,
    size_bytes: 0,
    created_at: null,
    status: "not_found",
    exif: {},
    pdf_pages: null
  };

  // 파일 존재 확인
  if (!fs.existsSync(filePath)) {
    meta.reason = "file not found";
    return meta;
  }

  const stat = fs.statSync(filePath);
  meta.size_bytes = stat.size;
  meta.created_at = new Date(stat.ctimeMs).toISOString();
  meta.status = "ok";

  const mimeType = mime.lookup(filePath);
  meta.mime = mimeType || "unknown";

  // PDF면 페이지 수 추출
  if (mimeType === "application/pdf") {
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer);
    meta.pdf_pages = pdfData.numpages;
  }

  // JPEG만 EXIF 파싱, PNG 등은 스킵
  if (mimeType === 'image/jpeg') {
      try {
          const buffer = fs.readFileSync(filePath);
          const parser = exif.create(buffer);
          meta.exif = parser.parse().tags;
      } catch (error) {
          meta.exif = {};
      }
  } else {
      meta.exif = {}; // PNG, PDF 등은 EXIF 없음
  }

  return meta;
}

// CLI 실행부
(async () => {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: node file_analyzer.js <filePath>");
    process.exit(1);
  }

  const filePath = args[0];
  const meta = await getFileMetadata(filePath);

  // n8n이 JSON으로 인식하도록 출력
  console.log(JSON.stringify(meta));
})();

