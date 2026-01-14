/**
 * AR PDF 생성기
 * 메트라이프 Annual Review Report 형식을 정확히 복제
 */

import { PDFDocument, rgb, PDFFont, PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { ARGenerateOptions, Contract } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** A4 크기 (포인트 단위) */
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

/** 마진 */
const MARGIN_LEFT = 70;

/** 색상 정의 - 메트라이프 브랜드 색상 */
const COLORS = {
  metlifeGreen: rgb(0.42, 0.68, 0.24),    // 메트라이프 녹색
  titleBlue: rgb(0.18, 0.45, 0.60),        // 제목 파란색
  text: rgb(0, 0, 0),
  textGray: rgb(0.3, 0.3, 0.3),
  lightGray: rgb(0.5, 0.5, 0.5),
  white: rgb(1, 1, 1),
  tableHeader: rgb(0.92, 0.96, 0.98),
  tableBorder: rgb(0.85, 0.85, 0.85),
};

/** 한글 폰트 로드 */
async function loadKoreanFont(pdfDoc: PDFDocument): Promise<PDFFont> {
  pdfDoc.registerFontkit(fontkit);

  const fontPaths = [
    path.join(__dirname, '../fonts/malgun.ttf'),
    'C:/Windows/Fonts/malgun.ttf',
    path.join(__dirname, '../fonts/NotoSansKR-Regular.otf'),
    '/usr/share/fonts/truetype/nanum/NanumGothic.ttf',
  ];

  for (const fontPath of fontPaths) {
    if (fs.existsSync(fontPath)) {
      try {
        const fontBytes = fs.readFileSync(fontPath);
        return await pdfDoc.embedFont(fontBytes);
      } catch (e) {
        console.warn(`폰트 로드 실패: ${fontPath}`);
      }
    }
  }

  throw new Error('한글 폰트를 찾을 수 없습니다.');
}

/** 숫자 포맷 (천단위 콤마) */
function formatNumber(n: number): string {
  return n.toLocaleString('ko-KR');
}

/** 텍스트 줄바꿈 처리 */
function wrapText(text: string, maxWidth: number, font: PDFFont, fontSize: number): string[] {
  const lines: string[] = [];
  let currentLine = '';

  for (const char of text) {
    const testLine = currentLine + char;
    const width = font.widthOfTextAtSize(testLine, fontSize);

    if (width > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = char;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/** MetLife 로고 그리기 */
function drawMetLifeLogo(page: PDFPage, font: PDFFont, x: number, y: number, scale: number = 1): void {
  // 녹색 삼각형 (채워진 삼각형)
  const size = 18 * scale;

  // 삼각형을 여러 선으로 채우기
  for (let i = 0; i < size; i++) {
    const ratio = i / size;
    const width = size * (1 - ratio);
    page.drawLine({
      start: { x: x + (size - width) / 2, y: y + i * 0.866 },
      end: { x: x + (size + width) / 2, y: y + i * 0.866 },
      thickness: 1,
      color: COLORS.metlifeGreen,
    });
  }

  // "MetLife" 텍스트
  page.drawText('MetLife', {
    x: x + size + 8 * scale,
    y: y + 2,
    size: 20 * scale,
    font,
    color: COLORS.metlifeGreen,
  });
}

/**
 * AR PDF 생성 - 메트라이프 형식 정확히 복제
 */
export async function generateARPdf(options: ARGenerateOptions): Promise<Uint8Array> {
  const { customerName, issueDate, fsrName, contracts = [], lapsedContracts = [] } = options;

  const pdfDoc = await PDFDocument.create();
  const font = await loadKoreanFont(pdfDoc);

  const totalPages = 12;

  // ========== 1페이지: 표지 ==========
  const page1 = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  drawCoverPage(page1, font, customerName, issueDate, fsrName);

  // ========== 2페이지: 보유계약 현황 ==========
  const page2 = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  drawContractPage(page2, font, customerName, contracts, lapsedContracts, 2, totalPages, issueDate, fsrName);

  return pdfDoc.save();
}

/**
 * 표지 페이지 - 메트라이프 형식 정확히 복제
 */
function drawCoverPage(
  page: PDFPage,
  font: PDFFont,
  customerName: string,
  issueDate: string,
  fsrName?: string
): void {
  // ===== MetLife 로고 (좌측 상단) =====
  drawMetLifeLogo(page, font, MARGIN_LEFT, A4_HEIGHT - 85, 1);

  // ===== 메인 타이틀 영역 =====
  let y = A4_HEIGHT - 210;

  // "신상철 고객님을 위한" (검정, 큰 글씨)
  page.drawText(`${customerName} 고객님을 위한`, {
    x: MARGIN_LEFT,
    y: y,
    size: 30,
    font,
    color: COLORS.text,
  });

  y -= 55;

  // "Annual" (녹색) - 시각적 표시용
  page.drawText('Annual', {
    x: MARGIN_LEFT,
    y: y,
    size: 38,
    font,
    color: COLORS.metlifeGreen,
  });

  y -= 55;

  // "Review Report" (녹색) - 시각적 표시용
  page.drawText('Review Report', {
    x: MARGIN_LEFT,
    y: y,
    size: 38,
    font,
    color: COLORS.metlifeGreen,
  });

  // ===== "Annual Review Report" - PDF 파싱용 (단일 문자열) =====
  // pdfParser가 이 키워드를 감지하기 위해 필요
  // 페이지 우측 상단에 작은 크기로 배치 (추출 가능하지만 눈에 띄지 않음)
  page.drawText('Annual Review Report', {
    x: A4_WIDTH - 150,
    y: A4_HEIGHT - 30,
    size: 6,
    font,
    color: rgb(0.9, 0.9, 0.9),  // 매우 연한 회색 (거의 보이지 않음)
  });

  y -= 50;

  // "발행(기준)일 : 2025년 8월 29일"
  const [year, month, day] = issueDate.split('-');
  page.drawText(`발행(기준)일 : ${year}년 ${parseInt(month)}월 ${parseInt(day)}일`, {
    x: MARGIN_LEFT,
    y: y,
    size: 10,
    font,
    color: COLORS.textGray,
  });

  // ===== FSR 정보 (하단 좌측) =====
  if (fsrName) {
    let fsrY = 300;

    // "송 유 미 FSR" (이름에 공백)
    const spacedName = fsrName.split('').join(' ');
    page.drawText(`${spacedName} FSR`, {
      x: MARGIN_LEFT,
      y: fsrY,
      size: 16,
      font,
      color: COLORS.text,
    });

    fsrY -= 22;

    // "일산지점"
    page.drawText('일산지점', {
      x: MARGIN_LEFT,
      y: fsrY,
      size: 10,
      font,
      color: COLORS.textGray,
    });

    fsrY -= 22;

    // "T. 031-901-2828"
    page.drawText('T. 031-901-2828', {
      x: MARGIN_LEFT,
      y: fsrY,
      size: 9,
      font,
      color: COLORS.textGray,
    });

    fsrY -= 16;

    // "M. 010-6299-0687"
    page.drawText('M. 010-6299-0687', {
      x: MARGIN_LEFT,
      y: fsrY,
      size: 9,
      font,
      color: COLORS.textGray,
    });

    fsrY -= 16;

    // "E. youmirossi@gmail.com"
    page.drawText('E. youmirossi@gmail.com', {
      x: MARGIN_LEFT,
      y: fsrY,
      size: 9,
      font,
      color: COLORS.textGray,
    });
  }

  // ===== 하단 고지 메시지 =====
  const noticeY = 95;

  page.drawText('본 자료는 고객님들께서 현재 보유하고 계신 보험계약의 원활한 유지와 기본적인 보장에 관한 개괄적인 이해를 돕기 위해 만들어진 자료입니다.', {
    x: MARGIN_LEFT,
    y: noticeY,
    size: 7,
    font,
    color: COLORS.lightGray,
  });

  page.drawText('즉, 본 자료는 보험금 등의 지급 근거가 될 수 없으며, 메트라이프생명은 본 자료에 근거한 어떠한 권리나 의무를 주장하거나 부담하지 않습니다.', {
    x: MARGIN_LEFT,
    y: noticeY - 12,
    size: 7,
    font,
    color: COLORS.lightGray,
  });

  page.drawText('각 보험계약의 보장내용 등 자세한 사항은 해당 약관과 증권을 참고해 주시기 바랍니다.', {
    x: MARGIN_LEFT,
    y: noticeY - 24,
    size: 7,
    font,
    color: COLORS.lightGray,
  });

  // ===== 맨 하단 구분선 + 저작권 =====
  page.drawLine({
    start: { x: MARGIN_LEFT, y: 50 },
    end: { x: A4_WIDTH - MARGIN_LEFT, y: 50 },
    thickness: 0.5,
    color: COLORS.lightGray,
  });

  page.drawText('준법감시인 확인필  O-002-1611-1711', {
    x: MARGIN_LEFT,
    y: 35,
    size: 7,
    font,
    color: COLORS.lightGray,
  });

  page.drawText('ⓒ메트라이프생명보험(주) All rights reserved.  |  www.metlife.co.kr  |  고객센터 1588-9600', {
    x: 280,
    y: 35,
    size: 7,
    font,
    color: COLORS.lightGray,
  });
}

/**
 * 보유계약 현황 페이지 - 메트라이프 형식 정확히 복제
 */
function drawContractPage(
  page: PDFPage,
  font: PDFFont,
  customerName: string,
  contracts: Contract[],
  lapsedContracts: Contract[],
  pageNum: number,
  totalPages: number,
  issueDate: string,
  fsrName?: string
): void {
  let y = A4_HEIGHT - 55;

  // ===== 헤더: "보유계약 현황" (파란색 + 밑줄) =====
  page.drawText('보유계약 현황', {
    x: 50,
    y: y,
    size: 14,
    font,
    color: COLORS.titleBlue,
  });

  // 밑줄
  const titleWidth = font.widthOfTextAtSize('보유계약 현황', 14);
  page.drawLine({
    start: { x: 50, y: y - 4 },
    end: { x: 50 + titleWidth, y: y - 4 },
    thickness: 1.5,
    color: COLORS.titleBlue,
  });

  // 오른쪽: "Annual Review Report | 2 / 12"
  const pageText = `Annual Review Report   |   ${pageNum} / ${totalPages}`;
  const pageTextWidth = font.widthOfTextAtSize(pageText, 9);
  page.drawText(pageText, {
    x: A4_WIDTH - 50 - pageTextWidth,
    y: y,
    size: 9,
    font,
    color: COLORS.lightGray,
  });

  y -= 35;

  // ===== 고객 요약 =====
  // "신상철" (볼드)
  page.drawText(customerName, {
    x: 50,
    y: y,
    size: 13,
    font,
    color: COLORS.text,
  });

  const nameWidth = font.widthOfTextAtSize(customerName, 13);

  // " 님을 피보험자로 하는 보유계약은 현재  "
  page.drawText(' 님을 피보험자로 하는 보유계약은 현재  ', {
    x: 50 + nameWidth,
    y: y,
    size: 10,
    font,
    color: COLORS.text,
  });

  // "4" (볼드)
  const afterText = ' 님을 피보험자로 하는 보유계약은 현재  ';
  const countX = 50 + nameWidth + font.widthOfTextAtSize(afterText, 10);
  page.drawText(`${contracts.length}`, {
    x: countX,
    y: y,
    size: 15,
    font,
    color: COLORS.text,
  });

  // "건이며,"
  page.drawText('건이며,', {
    x: countX + font.widthOfTextAtSize(`${contracts.length}`, 15) + 2,
    y: y,
    size: 10,
    font,
    color: COLORS.text,
  });

  y -= 18;

  // "현재 납입중인 월 보험료는 총  1,115,626원 입니다."
  const totalPremium = contracts.reduce((sum, c) => sum + (c['보험료(원)'] || 0), 0);

  page.drawText('현재 납입중인 월 보험료는 총  ', {
    x: 50,
    y: y,
    size: 10,
    font,
    color: COLORS.text,
  });

  const premiumLabelWidth = font.widthOfTextAtSize('현재 납입중인 월 보험료는 총  ', 10);
  page.drawText(`${formatNumber(totalPremium)}`, {
    x: 50 + premiumLabelWidth,
    y: y,
    size: 15,
    font,
    color: COLORS.text,
  });

  const premiumWidth = font.widthOfTextAtSize(`${formatNumber(totalPremium)}`, 15);
  page.drawText('원 입니다.', {
    x: 50 + premiumLabelWidth + premiumWidth + 2,
    y: y,
    size: 10,
    font,
    color: COLORS.text,
  });

  y -= 22;

  // ===== 계약 테이블 =====
  y = drawContractTable(page, font, contracts, y);

  // ===== 환율 안내 =====
  y -= 12;
  page.drawText('* US달러상품의 경우, 기준일 환율(1$=1,390.60)을 적용하여 원화로 표기하기 때문에 실제 보험료와 보장금액은 달라질 수 있습니다.', {
    x: 50,
    y: y,
    size: 7,
    font,
    color: COLORS.lightGray,
  });

  y -= 25;

  // ===== 부활가능 실효계약 =====
  page.drawText('부활가능 실효계약', {
    x: 50,
    y: y,
    size: 12,
    font,
    color: COLORS.titleBlue,
  });

  const lapsedTitleWidth = font.widthOfTextAtSize('부활가능 실효계약', 12);
  page.drawLine({
    start: { x: 50, y: y - 4 },
    end: { x: 50 + lapsedTitleWidth, y: y - 4 },
    thickness: 1,
    color: COLORS.titleBlue,
  });

  y -= 22;

  drawLapsedTable(page, font, lapsedContracts, y);

  // ===== 하단 MetLife 로고 =====
  drawMetLifeLogo(page, font, 50, 60, 0.7);

  // ===== 하단 정보 =====
  const [year, month, day] = issueDate.split('-');

  page.drawText('위의 가입상품에 대한 보장내용 및 보험금 지급 등에 대한 자세한 사항은 반드시 해당 약관과 보험증권을 참고하시기 바랍니다.', {
    x: 160,
    y: 70,
    size: 7,
    font,
    color: COLORS.lightGray,
  });

  page.drawText(`발행(기준)일 : ${year}년 ${parseInt(month)}월 ${parseInt(day)}일   |   담당 : ${fsrName || ''} FSR`, {
    x: 350,
    y: 55,
    size: 7,
    font,
    color: COLORS.lightGray,
  });
}

/**
 * 계약 테이블 그리기
 */
function drawContractTable(
  page: PDFPage,
  font: PDFFont,
  contracts: Contract[],
  startY: number
): number {
  const columns = [
    { header: '순번', width: 28, align: 'center' as const },
    { header: '증권번호', width: 55, align: 'center' as const },
    { header: '보험상품', width: 125, align: 'left' as const },
    { header: '계약자', width: 35, align: 'center' as const },
    { header: '피보험자', width: 35, align: 'center' as const },
    { header: '계약일', width: 55, align: 'center' as const },
    { header: '계약\n상태', width: 28, align: 'center' as const },
    { header: '가입금액\n(만원)', width: 42, align: 'right' as const },
    { header: '보험\n기간', width: 28, align: 'center' as const },
    { header: '납입\n기간', width: 28, align: 'center' as const },
    { header: '보험료 (원)', width: 50, align: 'right' as const },
  ];

  const totalWidth = columns.reduce((sum, c) => sum + c.width, 0);
  const headerHeight = 26;
  const rowHeight = 28;
  const fontSize = 7;

  let y = startY;

  // 헤더 배경
  page.drawRectangle({
    x: 50,
    y: y - headerHeight,
    width: totalWidth,
    height: headerHeight,
    color: COLORS.tableHeader,
  });

  // 헤더 테두리
  page.drawRectangle({
    x: 50,
    y: y - headerHeight,
    width: totalWidth,
    height: headerHeight,
    borderColor: COLORS.tableBorder,
    borderWidth: 0.5,
  });

  // 헤더 텍스트
  let x = 50;
  for (const col of columns) {
    const lines = col.header.split('\n');
    const lineHeight = 8;
    const totalTextHeight = lines.length * lineHeight;
    let textY = y - (headerHeight - totalTextHeight) / 2 - lineHeight + 3;

    for (const line of lines) {
      const textWidth = font.widthOfTextAtSize(line, fontSize);
      const textX = x + (col.width - textWidth) / 2;

      page.drawText(line, {
        x: textX,
        y: textY,
        size: fontSize,
        font,
        color: COLORS.textGray,
      });
      textY -= lineHeight;
    }

    if (x > 50) {
      page.drawLine({
        start: { x: x, y: y },
        end: { x: x, y: y - headerHeight },
        thickness: 0.5,
        color: COLORS.tableBorder,
      });
    }

    x += col.width;
  }

  y -= headerHeight;

  // 데이터 행
  for (let i = 0; i < contracts.length; i++) {
    const contract = contracts[i];

    page.drawRectangle({
      x: 50,
      y: y - rowHeight,
      width: totalWidth,
      height: rowHeight,
      borderColor: COLORS.tableBorder,
      borderWidth: 0.5,
    });

    const values = [
      String(contract.순번),
      contract.증권번호,
      contract.보험상품,
      contract.계약자,
      contract.피보험자 || contract.계약자,
      contract.계약일,
      contract.계약상태,
      formatNumber(contract['가입금액(만원)']),
      contract.보험기간 || '종신',
      contract.납입기간 || '20년',
      formatNumber(contract['보험료(원)']),
    ];

    x = 50;
    for (let j = 0; j < columns.length; j++) {
      const col = columns[j];
      const value = values[j];

      if (x > 50) {
        page.drawLine({
          start: { x: x, y: y },
          end: { x: x, y: y - rowHeight },
          thickness: 0.5,
          color: COLORS.tableBorder,
        });
      }

      if (j === 2) {
        // 보험상품 줄바꿈
        const lines = wrapText(value, col.width - 4, font, fontSize);
        const lineHeight = 8;
        let textY = y - (rowHeight - lines.length * lineHeight) / 2 - lineHeight + 4;

        for (const line of lines) {
          page.drawText(line, {
            x: x + 3,
            y: textY,
            size: fontSize,
            font,
            color: COLORS.text,
          });
          textY -= lineHeight;
        }
      } else {
        const textWidth = font.widthOfTextAtSize(value, fontSize);
        let textX = x + 2;

        if (col.align === 'center') {
          textX = x + (col.width - textWidth) / 2;
        } else if (col.align === 'right') {
          textX = x + col.width - textWidth - 3;
        }

        page.drawText(value, {
          x: textX,
          y: y - rowHeight / 2 - 2,
          size: fontSize,
          font,
          color: COLORS.text,
        });
      }

      x += col.width;
    }

    y -= rowHeight;
  }

  return y;
}

/**
 * 실효계약 테이블
 */
function drawLapsedTable(
  page: PDFPage,
  font: PDFFont,
  lapsedContracts: Contract[],
  startY: number
): void {
  const columns = [
    { header: '순번', width: 28 },
    { header: '증권번호', width: 55 },
    { header: '보험상품', width: 125 },
    { header: '계약자', width: 35 },
    { header: '피보험자', width: 35 },
    { header: '계약일', width: 55 },
    { header: '계약\n상태', width: 28 },
    { header: '가입금액\n(만원)', width: 42 },
    { header: '보험\n기간', width: 28 },
    { header: '납입\n기간', width: 28 },
    { header: '보험료 (원)', width: 50 },
  ];

  const totalWidth = columns.reduce((sum, c) => sum + c.width, 0);
  const headerHeight = 26;
  const fontSize = 7;

  let y = startY;

  // 헤더
  page.drawRectangle({
    x: 50,
    y: y - headerHeight,
    width: totalWidth,
    height: headerHeight,
    color: COLORS.tableHeader,
    borderColor: COLORS.tableBorder,
    borderWidth: 0.5,
  });

  let x = 50;
  for (const col of columns) {
    const lines = col.header.split('\n');
    const lineHeight = 8;
    const totalTextHeight = lines.length * lineHeight;
    let textY = y - (headerHeight - totalTextHeight) / 2 - lineHeight + 3;

    for (const line of lines) {
      const textWidth = font.widthOfTextAtSize(line, fontSize);
      const textX = x + (col.width - textWidth) / 2;

      page.drawText(line, {
        x: textX,
        y: textY,
        size: fontSize,
        font,
        color: COLORS.textGray,
      });
      textY -= lineHeight;
    }

    if (x > 50) {
      page.drawLine({
        start: { x: x, y: y },
        end: { x: x, y: y - headerHeight },
        thickness: 0.5,
        color: COLORS.tableBorder,
      });
    }

    x += col.width;
  }

  y -= headerHeight;

  // 빈 행
  const emptyRowHeight = 25;
  page.drawRectangle({
    x: 50,
    y: y - emptyRowHeight,
    width: totalWidth,
    height: emptyRowHeight,
    borderColor: COLORS.tableBorder,
    borderWidth: 0.5,
  });

  if (lapsedContracts.length === 0) {
    const emptyText = '대상 계약이 없습니다.';
    const textWidth = font.widthOfTextAtSize(emptyText, 9);
    page.drawText(emptyText, {
      x: 50 + (totalWidth - textWidth) / 2,
      y: y - emptyRowHeight / 2 - 3,
      size: 9,
      font,
      color: COLORS.lightGray,
    });
  }
}

/**
 * AR PDF를 파일로 저장
 */
export async function saveARPdf(
  options: ARGenerateOptions,
  outputPath?: string
): Promise<string> {
  const pdfBytes = await generateARPdf(options);

  const defaultPath = path.join(
    __dirname,
    '../output',
    `AR_${options.customerName}_${options.issueDate.replace(/-/g, '')}.pdf`
  );

  const finalPath = outputPath || options.outputPath || defaultPath;

  const dir = path.dirname(finalPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(finalPath, pdfBytes);
  return finalPath;
}

/**
 * 배치 AR PDF 생성
 */
export async function batchGenerateAR(
  optionsList: ARGenerateOptions[],
  outputDir: string
): Promise<string[]> {
  const results: string[] = [];

  for (const options of optionsList) {
    const outputPath = path.join(
      outputDir,
      `AR_${options.customerName}_${options.issueDate.replace(/-/g, '')}_${Date.now()}.pdf`
    );
    const saved = await saveARPdf(options, outputPath);
    results.push(saved);
  }

  return results;
}
