/**
 * AIMS UIX-3 Document Entity Model
 * @since 2025-09-30
 * @version 1.0.0
 *
 * 문서 엔티티의 타입 정의 및 검증 스키마
 * Zod를 사용한 런타임 타입 검증
 */

import { z } from 'zod';
import { formatDateTime } from '@/shared/lib/timeUtils';

/**
 * 문서 기본 정보 스키마
 */
export const DocumentSchema = z.object({
  _id: z.string(),
  filename: z.string().min(1, '파일명은 필수입니다'),
  originalName: z.string().optional(),
  mimeType: z.string().optional(),
  size: z.number().optional(),
  path: z.string().optional(),
  uploadDate: z.string().datetime().optional(),

  // 문서 메타데이터
  category: z.string().optional(),
  tags: z.array(z.string()).default([]),
  description: z.string().optional(),

  // OCR 및 분석 결과
  ocrText: z.string().optional(),
  ocrStatus: z.enum(['pending', 'processing', 'completed', 'failed']).default('pending'),

  // 고객 연결 정보
  customerId: z.string().optional(),
  customerName: z.string().optional(),

  // Annual Report 여부
  is_annual_report: z.boolean().optional(),

  // 상태 정보
  status: z.enum(['active', 'archived', 'deleted']).default('active'),

  // 메타데이터
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * 문서 생성 요청 스키마
 */
export const CreateDocumentSchema = DocumentSchema.omit({
  _id: true,
  createdAt: true,
  updatedAt: true,
}).partial({
  tags: true,
  status: true,
  ocrStatus: true,
});

/**
 * 문서 업데이트 요청 스키마
 */
export const UpdateDocumentSchema = CreateDocumentSchema.partial({
  filename: true,
});

/**
 * 문서 검색 쿼리 스키마
 */
export const DocumentSearchQuerySchema = z.object({
  q: z.string().optional(), // 검색어 (파일명, OCR 텍스트 등)
  category: z.string().optional(), // 카테고리 필터
  tags: z.array(z.string()).optional(), // 태그 필터
  customerId: z.string().optional(), // 고객 ID 필터
  status: z.enum(['active', 'archived', 'deleted']).optional(), // 상태 필터
  ocrStatus: z.enum(['pending', 'processing', 'completed', 'failed']).optional(), // OCR 상태 필터
  mimeType: z.string().optional(), // MIME 타입 필터
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
  sortBy: z.enum(['filename', 'uploadDate', 'size', 'createdAt', 'updatedAt', 'fileType']).default('uploadDate'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * 문서 검색 응답 스키마
 */
export const DocumentSearchResponseSchema = z.object({
  documents: z.array(DocumentSchema),
  total: z.number(),
  hasMore: z.boolean(),
  offset: z.number(),
  limit: z.number(),
});

/**
 * TypeScript 타입 추출
 */
export type Document = z.infer<typeof DocumentSchema>;
export type CreateDocumentData = z.infer<typeof CreateDocumentSchema>;
export type UpdateDocumentData = z.infer<typeof UpdateDocumentSchema>;
export type DocumentSearchQuery = z.infer<typeof DocumentSearchQuerySchema>;
export type DocumentSearchResponse = z.infer<typeof DocumentSearchResponseSchema>;

/**
 * 문서 타입 판별용 입력 타입
 * Document, SearchResultItem, CustomerDocumentItem 등 다양한 소스에서 사용
 */
export interface DocumentTypeInput {
  badgeType?: string
  mimeType?: string
  ocr?: {
    status?: string
    confidence?: number | string
  } | string
  ocrConfidence?: number | string
  docembed?: {
    text_source?: string
  }
  meta?: {
    full_text?: string
  }
  stages?: {
    ocr?: {
      message?: string
    }
  }
  created_at?: string
  uploaded_at?: string
  _id?: string
}

/**
 * 문서 유틸리티
 */
export const DocumentUtils = {
  /**
   * 문서 표시용 이름 반환
   */
  getDisplayName: (document: Document): string => {
    return document.originalName || document.filename || '이름 없음';
  },

  /**
   * 파일 크기를 사람이 읽기 쉬운 형식으로 변환
   */
  formatFileSize: (bytes?: number): string => {
    if (!bytes || bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  },

  /**
   * MIME 타입에서 파일 확장자 추출
   */
  getFileExtension: (mimeType?: string): string => {
    if (!mimeType) return '';

    const mimeMap: Record<string, string> = {
      'application/pdf': 'PDF',
      'image/jpeg': 'JPG',
      'image/jpg': 'JPG',
      'image/png': 'PNG',
      'image/gif': 'GIF',
      'application/msword': 'DOC',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
      'application/vnd.ms-excel': 'XLS',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
      'application/vnd.ms-powerpoint': 'PPT',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
      'text/plain': 'TXT',
      'text/csv': 'CSV',
      'application/x-hwp': 'HWP',
      'application/haansofthwp': 'HWP',
      'application/vnd.hancom.hwp': 'HWP',
      'application/hwp+zip': 'HWPX',
      'application/vnd.hancom.hwpx': 'HWPX',
      'application/zip': 'ZIP',
      'application/x-zip-compressed': 'ZIP',
      'application/x-zip': 'ZIP',
      'application/postscript': 'AI',
      'application/illustrator': 'AI',
    };

    return mimeMap[mimeType] || mimeType.split('/')[1]?.toUpperCase() || '';
  },

  /**
   * 파일 아이콘 타입 반환 (SF Symbol 이름)
   * 🍎 COMPREHENSIVE FILE ICONS: iOS-style system icons
   */
  getFileIcon: (mimeType?: string, filename?: string): string => {
    if (!mimeType && !filename) return 'doc';

    const mime = (mimeType || '').toLowerCase();
    const extension = filename?.split('.').pop()?.toLowerCase() || '';

    // 🍎 PDF: Dedicated PDF icon
    if (mime.includes('pdf') || extension === 'pdf') {
      return 'doc.richtext';
    }

    // 🍎 IMAGES: Photo gallery icon
    if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'].includes(extension)) {
      return 'photo';
    }

    // 🍎 VIDEOS: Video camera icon
    if (mime.startsWith('video/') || ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', '3gp'].includes(extension)) {
      return 'video';
    }

    // 🍎 AUDIO: Music note icon
    if (mime.startsWith('audio/') || ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'].includes(extension)) {
      return 'music.note';
    }

    // 🍎 ARCHIVES: Folder icon
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'cab', 'dmg', 'iso'].includes(extension)) {
      return 'archivebox';
    }

    // 🍎 OFFICE DOCUMENTS: Specific icons
    if (['doc', 'docx', 'hwp'].includes(extension) || mime.includes('msword')) {
      return 'doc.plaintext';
    }

    if (['xls', 'xlsx'].includes(extension) || mime.includes('sheet')) {
      return 'tablecells';
    }

    if (['ppt', 'pptx'].includes(extension) || mime.includes('presentation')) {
      return 'play.rectangle';
    }

    // 🍎 CODE FILES: Terminal icon
    if (['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'scss', 'less', 'json', 'xml', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'dart'].includes(extension)) {
      return 'chevron.left.forwardslash.chevron.right';
    }

    // 🍎 TEXT FILES: Document icon
    if (mime.includes('text') || ['txt', 'md', 'rtf', 'log', 'csv'].includes(extension)) {
      return 'doc.plaintext';
    }

    // 🍎 EXECUTABLE: Gear icon
    if (['exe', 'msi', 'deb', 'rpm', 'pkg', 'dmg', 'app'].includes(extension)) {
      return 'gearshape';
    }

    // 🍎 DEFAULT: Generic document
    return 'doc';
  },

  /**
   * 파일 타입 CSS 클래스 반환
   * 🍎 FILE TYPE CSS CLASS: Apple-style color categorization
   */
  getFileTypeClass: (mimeType?: string, filename?: string): string => {
    if (!mimeType && !filename) return 'file-icon--default';

    const mime = (mimeType || '').toLowerCase();
    const extension = filename?.split('.').pop()?.toLowerCase() || '';

    // 🍎 PDF: Red theme
    if (mime.includes('pdf') || extension === 'pdf') {
      return 'file-icon--pdf';
    }

    // 🍎 IMAGES: Blue theme
    if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'].includes(extension)) {
      return 'file-icon--image';
    }

    // 🍎 VIDEOS: Purple theme
    if (mime.startsWith('video/') || ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', '3gp'].includes(extension)) {
      return 'file-icon--video';
    }

    // 🍎 AUDIO: Pink theme
    if (mime.startsWith('audio/') || ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'].includes(extension)) {
      return 'file-icon--audio';
    }

    // 🍎 ARCHIVES: Orange theme
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'cab', 'dmg', 'iso'].includes(extension)) {
      return 'file-icon--archive';
    }

    // 🍎 WORD DOCUMENTS: Blue theme
    if (['doc', 'docx', 'hwp'].includes(extension) || mime.includes('msword')) {
      return 'file-icon--word';
    }

    // 🍎 EXCEL DOCUMENTS: Green theme
    if (['xls', 'xlsx'].includes(extension) || mime.includes('sheet')) {
      return 'file-icon--excel';
    }

    // 🍎 POWERPOINT DOCUMENTS: Orange theme
    if (['ppt', 'pptx'].includes(extension) || mime.includes('presentation')) {
      return 'file-icon--powerpoint';
    }

    // 🍎 CODE FILES: Indigo theme
    if (['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'scss', 'less', 'json', 'xml', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'dart'].includes(extension)) {
      return 'file-icon--code';
    }

    // 🍎 TEXT FILES: Gray theme
    if (mime.includes('text') || ['txt', 'md', 'rtf', 'log', 'csv'].includes(extension)) {
      return 'file-icon--text';
    }

    // 🍎 EXECUTABLE: Dark theme
    if (['exe', 'msi', 'deb', 'rpm', 'pkg', 'dmg', 'app'].includes(extension)) {
      return 'file-icon--executable';
    }

    // 🍎 DEFAULT: Neutral theme
    return 'file-icon--default';
  },

  /**
   * OCR 상태 텍스트 반환
   */
  getOCRStatusText: (document: Document): string => {
    switch (document.ocrStatus) {
      case 'pending':
        return '대기 중';
      case 'processing':
        return '처리 중';
      case 'completed':
        return '완료';
      case 'failed':
        return '실패';
      default:
        return '알 수 없음';
    }
  },

  /**
   * 문서 상태 텍스트 반환
   */
  getStatusText: (document: Document): string => {
    switch (document.status) {
      case 'active':
        return '활성';
      case 'archived':
        return '보관됨';
      case 'deleted':
        return '삭제됨';
      default:
        return '알 수 없음';
    }
  },

  /**
   * 문서 타입 판별: OCR 기반 vs TXT 기반
   * @param document - Document, SearchResultItem, CustomerDocumentItem 등
   * @returns 'ocr' | 'txt' | 'bin'
   *
   * 판별 기준:
   * - OCR 기반: ocr 필드가 존재하고 status가 'done'
   * - TXT 기반: meta.full_text가 있거나 docembed.text_source가 'meta'
   * - bin: 판별 불가
   */
  getDocumentType: (document: DocumentTypeInput | null | undefined): 'ocr' | 'txt' | 'bin' => {
    if (!document) return 'bin';

    // 🔥 우선순위 1: 백엔드가 계산한 badgeType 사용 (고객 문서 탭용)
    if (document.badgeType) {
      const type = document.badgeType.toLowerCase();
      if (type === 'txt') return 'txt';
      if (type === 'ocr') return 'ocr';
      if (type === 'bin') return 'bin';
    }

    // MIME 타입 확인: 압축/미디어는 즉시 BIN
    const mimeType = document.mimeType || '';
    if (mimeType === 'application/zip' || mimeType === 'application/x-rar' ||
        mimeType === 'application/x-zip-compressed') {
      return 'bin';
    }
    if (mimeType.startsWith('audio/') || mimeType.startsWith('video/')) {
      return 'bin';
    }

    // 1. OCR 필드가 있고 완료된 경우 → OCR 기반
    if (document.ocr && typeof document.ocr === 'object') {
      if (document.ocr.status === 'done') {
        return 'ocr';
      }
    }

    // 3. docembed.text_source 확인
    if (document.docembed && typeof document.docembed === 'object') {
      if (document.docembed.text_source === 'ocr') {
        return 'ocr';
      }
      if (document.docembed.text_source === 'meta') {
        return 'txt';
      }
    }

    // 4. meta.full_text가 있는 경우 → TXT 기반
    if (document.meta && typeof document.meta === 'object') {
      if (document.meta.full_text && document.meta.full_text.length > 0) {
        return 'txt';
      }
    }

    // 6. 나머지 모두 BIN (full_text 없고 OCR 없으면 BIN)
    return 'bin';
  },

  /**
   * 문서 타입 레이블 반환
   * @param document - Document, SearchResultItem, CustomerDocumentItem 등
   * @returns 'OCR' | 'TXT' | 'BIN' | ''
   */
  getDocumentTypeLabel: (document: DocumentTypeInput | null | undefined): 'OCR' | 'TXT' | 'BIN' | '' => {
    const type = DocumentUtils.getDocumentType(document);
    if (type === 'ocr') return 'OCR';
    if (type === 'txt') return 'TXT';
    if (type === 'bin') return 'BIN';
    return '';
  },

  /**
   * OCR 신뢰도를 5단계로 분류
   * 0.0 ~ 1.0 범위의 신뢰도를 색상 레벨로 변환
   */
  getOcrConfidenceLevel: (confidence: number): { color: string; label: string } => {
    if (confidence >= 0.95) return { color: 'excellent', label: '매우 높음' }
    if (confidence >= 0.85) return { color: 'high', label: '높음' }
    if (confidence >= 0.70) return { color: 'medium', label: '보통' }
    if (confidence >= 0.50) return { color: 'low', label: '낮음' }
    return { color: 'very-low', label: '매우 낮음' }
  },

  /**
   * 문서에서 OCR confidence 추출
   * 여러 소스에서 시도:
   * 1. document.ocrConfidence (CustomerDocumentItem)
   * 2. document.ocr?.confidence (Document)
   * 3. document.stages?.ocr?.message 파싱 (리스트 API)
   */
  getOcrConfidence: (document: DocumentTypeInput | null | undefined): number | null => {
    if (!document) return null

    // 1. ocrConfidence 직접 필드 (CustomerDocumentItem)
    if (document.ocrConfidence !== null && document.ocrConfidence !== undefined) {
      const parsed = typeof document.ocrConfidence === 'string'
        ? parseFloat(document.ocrConfidence)
        : document.ocrConfidence
      if (!isNaN(parsed)) return parsed
    }

    // 2. ocr.confidence (Document)
    if (document.ocr && typeof document.ocr !== 'string') {
      const directConfidence = document.ocr.confidence
      if (directConfidence !== null && directConfidence !== undefined) {
        const parsed = typeof directConfidence === 'string'
          ? parseFloat(directConfidence)
          : directConfidence
        if (!isNaN(parsed)) return parsed
      }
    }

    // 3. stages.ocr.message 파싱 (예: "OCR 완료 (신뢰도: 0.9817)")
    const stageOcr = document.stages?.ocr
    if (stageOcr && typeof stageOcr !== 'string') {
      const ocrMessage = stageOcr.message
      if (ocrMessage && typeof ocrMessage === 'string') {
        const match = ocrMessage.match(/신뢰도:\s*([\d.]+)/)
        if (match && match[1]) {
          const parsed = parseFloat(match[1])
          if (!isNaN(parsed)) return parsed
        }
      }
    }

    return null
  },

  /**
   * 업로드 날짜 포맷팅 (시분초 포함)
   */
  formatUploadDate: (date?: string): string => {
    if (!date) return '-';
    return formatDateTime(date);
  },

  /**
   * 문서 데이터 검증
   */
  validate: (data: unknown): Document => {
    return DocumentSchema.parse(data);
  },

  /**
   * 문서 생성 데이터 검증
   */
  validateCreateData: (data: unknown): CreateDocumentData => {
    return CreateDocumentSchema.parse(data);
  },

  /**
   * 문서 업데이트 데이터 검증
   */
  validateUpdateData: (data: unknown): UpdateDocumentData => {
    return UpdateDocumentSchema.parse(data);
  },

  /**
   * 검색 쿼리 검증
   */
  validateSearchQuery: (query: unknown): DocumentSearchQuery => {
    return DocumentSearchQuerySchema.parse(query);
  },

  /**
   * 검색 응답 검증
   */
  validateSearchResponse: (response: unknown): DocumentSearchResponse => {
    return DocumentSearchResponseSchema.parse(response);
  },

  /**
   * 파일명으로 정렬하는 비교 함수
   */
  sortByFilename: (a: Document, b: Document): number => {
    return a.filename.localeCompare(b.filename, 'ko', { numeric: true });
  },

  /**
   * 업로드 날짜로 정렬하는 비교 함수 (최신순)
   */
  sortByUploadDate: (a: Document, b: Document): number => {
    const dateA = a.uploadDate ? new Date(a.uploadDate).getTime() : 0;
    const dateB = b.uploadDate ? new Date(b.uploadDate).getTime() : 0;
    return dateB - dateA;
  },

  /**
   * 파일 크기로 정렬하는 비교 함수
   */
  sortBySize: (a: Document, b: Document): number => {
    const sizeA = a.size || 0;
    const sizeB = b.size || 0;
    return sizeB - sizeA;
  },

  /**
   * 파일 형식 우선순위 반환 (숫자가 작을수록 우선순위 높음)
   * 보험 업무에 최적화된 순서: PDF → 문서 → 스프레드시트 → 프레젠테이션 → 이미지 → 기타
   */
  getFileTypePriority: (mimeType?: string, filename?: string): number => {
    const mime = (mimeType || '').toLowerCase();
    const extension = filename?.split('.').pop()?.toLowerCase() || '';

    // 1. PDF (보험 서류에서 가장 많이 사용)
    if (mime.includes('pdf') || extension === 'pdf') return 1;

    // 2. 문서 (DOC, DOCX, HWP)
    if (['doc', 'docx', 'hwp'].includes(extension) || mime.includes('msword')) return 2;

    // 3. 스프레드시트 (XLS, XLSX)
    if (['xls', 'xlsx'].includes(extension) || mime.includes('sheet')) return 3;

    // 4. 프레젠테이션 (PPT, PPTX)
    if (['ppt', 'pptx'].includes(extension) || mime.includes('presentation')) return 4;

    // 5. 이미지
    if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extension)) return 5;

    // 6. 텍스트 파일
    if (mime.includes('text') || ['txt', 'md', 'csv'].includes(extension)) return 6;

    // 7. 압축 파일
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) return 7;

    // 8. 기타
    return 99;
  },

  /**
   * 파일 형식으로 정렬하는 비교 함수
   */
  sortByFileType: (a: Document, b: Document): number => {
    const priorityA = DocumentUtils.getFileTypePriority(a.mimeType, a.filename);
    const priorityB = DocumentUtils.getFileTypePriority(b.mimeType, b.filename);

    // 우선순위가 다르면 우선순위로 정렬
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // 같은 형식이면 파일명으로 정렬
    return a.filename.localeCompare(b.filename, 'ko', { numeric: true });
  },
};

