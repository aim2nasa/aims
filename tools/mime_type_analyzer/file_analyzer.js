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
const { getDocument } = require('pdfjs-dist/legacy/build/pdf.js');

async function analyzePdfTextRatio(pdfPath, minTextLengthPerPage = 50) {
  if (!fs.existsSync(pdfPath)) {
    return { total_pages: 0, text_pages: 0, text_ratio: 0.0 };
  }

  try {
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const pdf = await getDocument({ data }).promise;
    const totalPages = pdf.numPages;

    let textPages = 0;

    for (let i = 1; i <= totalPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const extractedText = textContent.items.map(item => item.str).join(" ").trim();
      if (extractedText.length >= minTextLengthPerPage) {
        textPages++;
      }
    }

    const ratio = totalPages > 0 ? parseFloat(((textPages / totalPages) * 100).toFixed(2)) : 0.0;

    return {
      total_pages: totalPages,
      text_pages: textPages,
      text_ratio: ratio
    };
  } catch (err) {
    return { total_pages: 0, text_pages: 0, text_ratio: 0.0 };
  }
}

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

  // PDF면 페이지 수 및 텍스트 비율 추출
  if (mimeType === "application/pdf") {
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer);
    meta.pdf_pages = pdfData.numpages;

    const textStats = await analyzePdfTextRatio(filePath);
    meta.pdf_text_ratio = textStats;
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

