/**
 * Document Model Tests
 * @since 2025-10-14
 *
 * DocumentUtils 및 DocumentTagUtils 테스트
 */

import { describe, it, expect } from 'vitest';
import { DocumentUtils, DocumentTagUtils, type Document } from './model';

// ============================================
// DocumentUtils.getDisplayName 테스트
// ============================================
describe('DocumentUtils.getDisplayName', () => {
  it('originalName이 있으면 우선 반환한다', () => {
    const doc = {
      _id: 'doc-1',
      filename: 'file.pdf',
      originalName: '보험청구서.pdf',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    } as Document;

    expect(DocumentUtils.getDisplayName(doc)).toBe('보험청구서.pdf');
  });

  it('originalName이 없으면 filename을 반환한다', () => {
    const doc = {
      _id: 'doc-1',
      filename: 'file.pdf',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    } as Document;

    expect(DocumentUtils.getDisplayName(doc)).toBe('file.pdf');
  });

  it('둘 다 없으면 "이름 없음"을 반환한다', () => {
    const doc = {
      _id: 'doc-1',
      filename: '',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    } as Document;

    expect(DocumentUtils.getDisplayName(doc)).toBe('이름 없음');
  });
});

// ============================================
// DocumentUtils.formatFileSize 테스트
// ============================================
describe('DocumentUtils.formatFileSize', () => {
  it('0 바이트를 처리한다', () => {
    expect(DocumentUtils.formatFileSize(0)).toBe('0 B');
  });

  it('bytes를 올바르게 변환한다', () => {
    expect(DocumentUtils.formatFileSize(500)).toBe('500 B');
  });

  it('KB를 올바르게 변환한다', () => {
    expect(DocumentUtils.formatFileSize(1024)).toBe('1 KB');
    expect(DocumentUtils.formatFileSize(2048)).toBe('2 KB');
  });

  it('MB를 올바르게 변환한다', () => {
    expect(DocumentUtils.formatFileSize(1048576)).toBe('1 MB'); // 1024 * 1024
    expect(DocumentUtils.formatFileSize(5242880)).toBe('5 MB'); // 5 * 1024 * 1024
  });

  it('GB를 올바르게 변환한다', () => {
    expect(DocumentUtils.formatFileSize(1073741824)).toBe('1 GB'); // 1024^3
  });

  it('undefined를 처리한다', () => {
    expect(DocumentUtils.formatFileSize(undefined)).toBe('0 B');
  });

  it('소수점 두 자리로 반올림한다', () => {
    expect(DocumentUtils.formatFileSize(1536)).toBe('1.5 KB'); // 1.5 * 1024
  });
});

// ============================================
// DocumentUtils.getFileExtension 테스트
// ============================================
describe('DocumentUtils.getFileExtension', () => {
  it('PDF를 올바르게 반환한다', () => {
    expect(DocumentUtils.getFileExtension('application/pdf')).toBe('PDF');
  });

  it('이미지 확장자를 올바르게 반환한다', () => {
    expect(DocumentUtils.getFileExtension('image/jpeg')).toBe('JPG');
    expect(DocumentUtils.getFileExtension('image/jpg')).toBe('JPG');
    expect(DocumentUtils.getFileExtension('image/png')).toBe('PNG');
  });

  it('문서 확장자를 올바르게 반환한다', () => {
    expect(DocumentUtils.getFileExtension('application/msword')).toBe('DOC');
    expect(DocumentUtils.getFileExtension('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('DOCX');
    expect(DocumentUtils.getFileExtension('application/vnd.ms-excel')).toBe('XLS');
    expect(DocumentUtils.getFileExtension('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('XLSX');
  });

  it('undefined를 처리한다', () => {
    expect(DocumentUtils.getFileExtension(undefined)).toBe('');
  });

  it('알 수 없는 MIME 타입은 대문자로 변환한다', () => {
    expect(DocumentUtils.getFileExtension('application/octet-stream')).toBe('OCTET-STREAM');
  });
});

// ============================================
// DocumentUtils.getFileIcon 테스트
// ============================================
describe('DocumentUtils.getFileIcon', () => {
  it('PDF 아이콘을 반환한다', () => {
    expect(DocumentUtils.getFileIcon('application/pdf')).toBe('doc.richtext');
    expect(DocumentUtils.getFileIcon(undefined, 'file.pdf')).toBe('doc.richtext');
  });

  it('이미지 아이콘을 반환한다', () => {
    expect(DocumentUtils.getFileIcon('image/jpeg')).toBe('photo');
    expect(DocumentUtils.getFileIcon(undefined, 'photo.png')).toBe('photo');
  });

  it('비디오 아이콘을 반환한다', () => {
    expect(DocumentUtils.getFileIcon('video/mp4')).toBe('video');
    expect(DocumentUtils.getFileIcon(undefined, 'movie.avi')).toBe('video');
  });

  it('오디오 아이콘을 반환한다', () => {
    expect(DocumentUtils.getFileIcon('audio/mpeg')).toBe('music.note');
    expect(DocumentUtils.getFileIcon(undefined, 'song.mp3')).toBe('music.note');
  });

  it('압축 파일 아이콘을 반환한다', () => {
    expect(DocumentUtils.getFileIcon(undefined, 'archive.zip')).toBe('archivebox');
    expect(DocumentUtils.getFileIcon(undefined, 'archive.rar')).toBe('archivebox');
  });

  it('Office 문서 아이콘을 반환한다', () => {
    expect(DocumentUtils.getFileIcon('application/msword')).toBe('doc.plaintext');
    expect(DocumentUtils.getFileIcon(undefined, 'spreadsheet.xlsx')).toBe('tablecells');
    expect(DocumentUtils.getFileIcon(undefined, 'presentation.pptx')).toBe('play.rectangle');
  });

  it('코드 파일 아이콘을 반환한다', () => {
    expect(DocumentUtils.getFileIcon(undefined, 'script.js')).toBe('chevron.left.forwardslash.chevron.right');
    expect(DocumentUtils.getFileIcon(undefined, 'component.tsx')).toBe('chevron.left.forwardslash.chevron.right');
  });

  it('텍스트 파일 아이콘을 반환한다', () => {
    expect(DocumentUtils.getFileIcon('text/plain')).toBe('doc.plaintext');
    expect(DocumentUtils.getFileIcon(undefined, 'readme.txt')).toBe('doc.plaintext');
  });

  it('기본 아이콘을 반환한다', () => {
    expect(DocumentUtils.getFileIcon(undefined, undefined)).toBe('doc');
    expect(DocumentUtils.getFileIcon('application/unknown')).toBe('doc');
  });
});

// ============================================
// DocumentUtils.getFileTypeClass 테스트
// ============================================
describe('DocumentUtils.getFileTypeClass', () => {
  it('PDF 클래스를 반환한다', () => {
    expect(DocumentUtils.getFileTypeClass('application/pdf')).toBe('file-icon--pdf');
  });

  it('이미지 클래스를 반환한다', () => {
    expect(DocumentUtils.getFileTypeClass('image/jpeg')).toBe('file-icon--image');
  });

  it('비디오 클래스를 반환한다', () => {
    expect(DocumentUtils.getFileTypeClass('video/mp4')).toBe('file-icon--video');
  });

  it('오디오 클래스를 반환한다', () => {
    expect(DocumentUtils.getFileTypeClass('audio/mpeg')).toBe('file-icon--audio');
  });

  it('압축 파일 클래스를 반환한다', () => {
    expect(DocumentUtils.getFileTypeClass(undefined, 'archive.zip')).toBe('file-icon--archive');
  });

  it('Office 문서 클래스를 반환한다', () => {
    expect(DocumentUtils.getFileTypeClass(undefined, 'document.docx')).toBe('file-icon--word');
    expect(DocumentUtils.getFileTypeClass(undefined, 'spreadsheet.xlsx')).toBe('file-icon--excel');
    expect(DocumentUtils.getFileTypeClass(undefined, 'presentation.pptx')).toBe('file-icon--powerpoint');
  });

  it('코드 파일 클래스를 반환한다', () => {
    expect(DocumentUtils.getFileTypeClass(undefined, 'script.js')).toBe('file-icon--code');
  });

  it('텍스트 파일 클래스를 반환한다', () => {
    expect(DocumentUtils.getFileTypeClass('text/plain')).toBe('file-icon--text');
  });

  it('기본 클래스를 반환한다', () => {
    expect(DocumentUtils.getFileTypeClass(undefined, undefined)).toBe('file-icon--default');
  });
});

// ============================================
// DocumentUtils.getOCRStatusText 테스트
// ============================================
describe('DocumentUtils.getOCRStatusText', () => {
  it('pending 상태를 처리한다', () => {
    const doc = {
      _id: 'doc-1',
      filename: 'file.pdf',
      ocrStatus: 'pending' as const,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    } as Document;

    expect(DocumentUtils.getOCRStatusText(doc)).toBe('대기 중');
  });

  it('processing 상태를 처리한다', () => {
    const doc = {
      _id: 'doc-1',
      filename: 'file.pdf',
      ocrStatus: 'processing' as const,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    } as Document;

    expect(DocumentUtils.getOCRStatusText(doc)).toBe('처리 중');
  });

  it('completed 상태를 처리한다', () => {
    const doc = {
      _id: 'doc-1',
      filename: 'file.pdf',
      ocrStatus: 'completed' as const,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    } as Document;

    expect(DocumentUtils.getOCRStatusText(doc)).toBe('완료');
  });

  it('failed 상태를 처리한다', () => {
    const doc = {
      _id: 'doc-1',
      filename: 'file.pdf',
      ocrStatus: 'failed' as const,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    } as Document;

    expect(DocumentUtils.getOCRStatusText(doc)).toBe('실패');
  });
});

// ============================================
// DocumentUtils.getStatusText 테스트
// ============================================
describe('DocumentUtils.getStatusText', () => {
  it('active 상태를 처리한다', () => {
    const doc = {
      _id: 'doc-1',
      filename: 'file.pdf',
      status: 'active' as const,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    } as Document;

    expect(DocumentUtils.getStatusText(doc)).toBe('활성');
  });

  it('archived 상태를 처리한다', () => {
    const doc = {
      _id: 'doc-1',
      filename: 'file.pdf',
      status: 'archived' as const,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    } as Document;

    expect(DocumentUtils.getStatusText(doc)).toBe('보관됨');
  });

  it('deleted 상태를 처리한다', () => {
    const doc = {
      _id: 'doc-1',
      filename: 'file.pdf',
      status: 'deleted' as const,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    } as Document;

    expect(DocumentUtils.getStatusText(doc)).toBe('삭제됨');
  });
});

// ============================================
// DocumentUtils.formatUploadDate 테스트
// ============================================
describe('DocumentUtils.formatUploadDate', () => {
  it('유효한 날짜를 포맷팅한다', () => {
    const formatted = DocumentUtils.formatUploadDate('2025-01-15T14:30:45Z');

    // 정확한 포맷은 로케일에 따라 다를 수 있으므로, 주요 구성 요소만 확인
    expect(formatted).toContain('2025');
    expect(formatted).toContain('01');
    expect(formatted).toContain('15');
  });

  it('undefined를 처리한다', () => {
    expect(DocumentUtils.formatUploadDate(undefined)).toBe('-');
  });

  it('빈 문자열을 처리한다', () => {
    expect(DocumentUtils.formatUploadDate('')).toBe('-');
  });
});

// ============================================
// DocumentUtils.getFileTypePriority 테스트
// ============================================
describe('DocumentUtils.getFileTypePriority', () => {
  it('PDF가 최우선 순위를 가진다 (1)', () => {
    expect(DocumentUtils.getFileTypePriority('application/pdf')).toBe(1);
    expect(DocumentUtils.getFileTypePriority(undefined, 'file.pdf')).toBe(1);
  });

  it('문서 파일이 두 번째 순위를 가진다 (2)', () => {
    expect(DocumentUtils.getFileTypePriority(undefined, 'file.docx')).toBe(2);
    expect(DocumentUtils.getFileTypePriority('application/msword')).toBe(2);
  });

  it('스프레드시트가 세 번째 순위를 가진다 (3)', () => {
    expect(DocumentUtils.getFileTypePriority(undefined, 'file.xlsx')).toBe(3);
  });

  it('프레젠테이션이 네 번째 순위를 가진다 (4)', () => {
    expect(DocumentUtils.getFileTypePriority(undefined, 'file.pptx')).toBe(4);
  });

  it('이미지가 다섯 번째 순위를 가진다 (5)', () => {
    expect(DocumentUtils.getFileTypePriority('image/jpeg')).toBe(5);
  });

  it('텍스트 파일이 여섯 번째 순위를 가진다 (6)', () => {
    expect(DocumentUtils.getFileTypePriority('text/plain')).toBe(6);
  });

  it('압축 파일이 일곱 번째 순위를 가진다 (7)', () => {
    expect(DocumentUtils.getFileTypePriority(undefined, 'file.zip')).toBe(7);
  });

  it('기타 파일이 가장 낮은 순위를 가진다 (99)', () => {
    expect(DocumentUtils.getFileTypePriority('application/unknown')).toBe(99);
  });
});

// ============================================
// DocumentUtils 정렬 함수 테스트
// ============================================
describe('DocumentUtils 정렬 함수', () => {
  const createDoc = (overrides: Partial<Document>): Document => ({
    _id: 'doc-1',
    filename: 'file.pdf',
    tags: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  } as Document);

  describe('sortByFilename', () => {
    it('파일명으로 오름차순 정렬한다', () => {
      const docs = [
        createDoc({ filename: 'zebra.pdf' }),
        createDoc({ filename: 'alpha.pdf' }),
        createDoc({ filename: 'beta.pdf' }),
      ];

      docs.sort(DocumentUtils.sortByFilename);
      expect(docs.map(d => d.filename)).toEqual(['alpha.pdf', 'beta.pdf', 'zebra.pdf']);
    });

    it('한글 파일명을 올바르게 정렬한다', () => {
      const docs = [
        createDoc({ filename: '하.pdf' }),
        createDoc({ filename: '가.pdf' }),
        createDoc({ filename: '나.pdf' }),
      ];

      docs.sort(DocumentUtils.sortByFilename);
      expect(docs.map(d => d.filename)).toEqual(['가.pdf', '나.pdf', '하.pdf']);
    });

    it('숫자가 포함된 파일명을 자연스럽게 정렬한다', () => {
      const docs = [
        createDoc({ filename: 'file10.pdf' }),
        createDoc({ filename: 'file2.pdf' }),
        createDoc({ filename: 'file1.pdf' }),
      ];

      docs.sort(DocumentUtils.sortByFilename);
      expect(docs.map(d => d.filename)).toEqual(['file1.pdf', 'file2.pdf', 'file10.pdf']);
    });
  });

  describe('sortByUploadDate', () => {
    it('업로드 날짜로 내림차순 정렬한다 (최신순)', () => {
      const docs = [
        createDoc({ uploadDate: '2025-01-01T00:00:00Z' }),
        createDoc({ uploadDate: '2025-01-03T00:00:00Z' }),
        createDoc({ uploadDate: '2025-01-02T00:00:00Z' }),
      ];

      docs.sort(DocumentUtils.sortByUploadDate);
      expect(docs.map(d => d.uploadDate)).toEqual([
        '2025-01-03T00:00:00Z',
        '2025-01-02T00:00:00Z',
        '2025-01-01T00:00:00Z',
      ]);
    });

    it('uploadDate가 없는 문서를 마지막에 둔다', () => {
      const docs = [
        createDoc({ uploadDate: undefined }),
        createDoc({ uploadDate: '2025-01-02T00:00:00Z' }),
        createDoc({ uploadDate: '2025-01-01T00:00:00Z' }),
      ];

      docs.sort(DocumentUtils.sortByUploadDate);
      expect(docs[0]!.uploadDate).toBe('2025-01-02T00:00:00Z');
      expect(docs[2]!.uploadDate).toBe(undefined);
    });
  });

  describe('sortBySize', () => {
    it('파일 크기로 내림차순 정렬한다', () => {
      const docs = [
        createDoc({ size: 1000 }),
        createDoc({ size: 5000 }),
        createDoc({ size: 3000 }),
      ];

      docs.sort(DocumentUtils.sortBySize);
      expect(docs.map(d => d.size)).toEqual([5000, 3000, 1000]);
    });

    it('size가 없는 문서를 마지막에 둔다', () => {
      const docs = [
        createDoc({ size: undefined }),
        createDoc({ size: 2000 }),
        createDoc({ size: 1000 }),
      ];

      docs.sort(DocumentUtils.sortBySize);
      expect(docs[0]!.size).toBe(2000);
      expect(docs[2]!.size).toBe(undefined);
    });
  });

  describe('sortByFileType', () => {
    it('파일 타입 우선순위로 정렬한다', () => {
      const docs = [
        createDoc({ filename: 'image.jpg', mimeType: 'image/jpeg' }), // Priority 5
        createDoc({ filename: 'doc.pdf', mimeType: 'application/pdf' }), // Priority 1
        createDoc({ filename: 'sheet.xlsx' }), // Priority 3
      ];

      docs.sort(DocumentUtils.sortByFileType);
      expect(docs[0]!.filename).toBe('doc.pdf');
      expect(docs[1]!.filename).toBe('sheet.xlsx');
      expect(docs[2]!.filename).toBe('image.jpg');
    });

    it('같은 타입은 파일명으로 정렬한다', () => {
      const docs = [
        createDoc({ filename: 'zebra.pdf', mimeType: 'application/pdf' }),
        createDoc({ filename: 'alpha.pdf', mimeType: 'application/pdf' }),
        createDoc({ filename: 'beta.pdf', mimeType: 'application/pdf' }),
      ];

      docs.sort(DocumentUtils.sortByFileType);
      expect(docs.map(d => d.filename)).toEqual(['alpha.pdf', 'beta.pdf', 'zebra.pdf']);
    });
  });
});

// ============================================
// DocumentTagUtils 테스트
// ============================================
describe('DocumentTagUtils', () => {
  const createDoc = (tags: string[] = []): Document => ({
    _id: 'doc-1',
    filename: 'file.pdf',
    tags,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  } as Document);

  describe('addTag', () => {
    it('새 태그를 추가한다', () => {
      const doc = createDoc(['기존태그']);
      const updated = DocumentTagUtils.addTag(doc, '새태그');

      expect(updated.tags).toEqual(['기존태그', '새태그']);
    });

    it('이미 존재하는 태그는 추가하지 않는다', () => {
      const doc = createDoc(['기존태그']);
      const updated = DocumentTagUtils.addTag(doc, '기존태그');

      expect(updated.tags).toEqual(['기존태그']);
    });

    it('원본 문서를 변경하지 않는다', () => {
      const doc = createDoc(['기존태그']);
      const updated = DocumentTagUtils.addTag(doc, '새태그');

      expect(doc.tags).toEqual(['기존태그']); // 원본은 변경 안 됨
      expect(updated.tags).toEqual(['기존태그', '새태그']);
    });
  });

  describe('removeTag', () => {
    it('태그를 제거한다', () => {
      const doc = createDoc(['태그1', '태그2', '태그3']);
      const updated = DocumentTagUtils.removeTag(doc, '태그2');

      expect(updated.tags).toEqual(['태그1', '태그3']);
    });

    it('존재하지 않는 태그를 제거해도 에러가 발생하지 않는다', () => {
      const doc = createDoc(['태그1']);
      const updated = DocumentTagUtils.removeTag(doc, '없는태그');

      expect(updated.tags).toEqual(['태그1']);
    });

    it('원본 문서를 변경하지 않는다', () => {
      const doc = createDoc(['태그1', '태그2']);
      const updated = DocumentTagUtils.removeTag(doc, '태그1');

      expect(doc.tags).toEqual(['태그1', '태그2']); // 원본은 변경 안 됨
      expect(updated.tags).toEqual(['태그2']);
    });
  });

  describe('toggleTag', () => {
    it('없는 태그는 추가한다', () => {
      const doc = createDoc(['태그1']);
      const updated = DocumentTagUtils.toggleTag(doc, '태그2');

      expect(updated.tags).toEqual(['태그1', '태그2']);
    });

    it('있는 태그는 제거한다', () => {
      const doc = createDoc(['태그1', '태그2']);
      const updated = DocumentTagUtils.toggleTag(doc, '태그1');

      expect(updated.tags).toEqual(['태그2']);
    });

    it('원본 문서를 변경하지 않는다', () => {
      const doc = createDoc(['태그1']);
      const updated = DocumentTagUtils.toggleTag(doc, '태그1');

      expect(doc.tags).toEqual(['태그1']); // 원본은 변경 안 됨
      expect(updated.tags).toEqual([]);
    });
  });

  describe('COMMON_TAGS', () => {
    it('자주 사용되는 태그 목록을 제공한다', () => {
      expect(DocumentTagUtils.COMMON_TAGS).toContain('보험청구서');
      expect(DocumentTagUtils.COMMON_TAGS).toContain('진단서');
      expect(DocumentTagUtils.COMMON_TAGS).toContain('처방전');
      expect(DocumentTagUtils.COMMON_TAGS).toContain('영수증');
      expect(DocumentTagUtils.COMMON_TAGS).toContain('계약서');
      expect(DocumentTagUtils.COMMON_TAGS).toContain('신분증');
      expect(DocumentTagUtils.COMMON_TAGS).toContain('주민등록등본');
      expect(DocumentTagUtils.COMMON_TAGS).toContain('통장사본');
      expect(DocumentTagUtils.COMMON_TAGS).toContain('기타서류');
    });
  });
});
