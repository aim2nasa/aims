/**
 * Document Status Helper Unit Tests
 * @since 2026-02-05
 *
 * 테스트 범위:
 * 1. prepareDocumentResponse - raw/computed 분리 반환
 * 2. formatBytes - 바이트 포맷팅
 * 3. isConvertibleFile - PDF 변환 대상 확인
 * 4. isNativePreviewable - 네이티브 프리뷰 가능 확인
 *
 * @see docs/DOCUMENT_STATUS_FLOW.md
 */

const {
  prepareDocumentResponse,
  formatBytes,
  isConvertibleFile,
  CONVERTIBLE_EXTENSIONS
} = require('../documentStatusHelper');

// =============================================================================
// 유틸리티 함수 테스트
// =============================================================================

describe('documentStatusHelper - 유틸리티 함수', () => {
  describe('formatBytes', () => {
    it('0 바이트 → "0 Bytes"', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
    });

    it('500 바이트 → "500 Bytes"', () => {
      expect(formatBytes(500)).toBe('500 Bytes');
    });

    it('1024 바이트 → "1 KB"', () => {
      expect(formatBytes(1024)).toBe('1 KB');
    });

    it('1536 바이트 → "1.5 KB"', () => {
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    it('1048576 바이트 → "1 MB"', () => {
      expect(formatBytes(1048576)).toBe('1 MB');
    });

    it('1572864 바이트 → "1.5 MB"', () => {
      expect(formatBytes(1572864)).toBe('1.5 MB');
    });

    it('1073741824 바이트 → "1 GB"', () => {
      expect(formatBytes(1073741824)).toBe('1 GB');
    });
  });

  describe('isConvertibleFile', () => {
    describe('변환 대상 확장자', () => {
      it('doc 파일은 변환 대상', () => {
        expect(isConvertibleFile('/path/to/file.doc')).toBe(true);
      });

      it('docx 파일은 변환 대상', () => {
        expect(isConvertibleFile('/path/to/file.docx')).toBe(true);
      });

      it('xls 파일은 변환 대상', () => {
        expect(isConvertibleFile('/path/to/file.xls')).toBe(true);
      });

      it('xlsx 파일은 변환 대상', () => {
        expect(isConvertibleFile('/path/to/file.xlsx')).toBe(true);
      });

      it('ppt 파일은 변환 대상', () => {
        expect(isConvertibleFile('/path/to/file.ppt')).toBe(true);
      });

      it('pptx 파일은 변환 대상', () => {
        expect(isConvertibleFile('/path/to/file.pptx')).toBe(true);
      });

      it('hwp 파일은 변환 대상', () => {
        expect(isConvertibleFile('/path/to/file.hwp')).toBe(true);
      });
    });

    describe('변환 대상이 아닌 확장자', () => {
      it('pdf 파일은 변환 대상 아님', () => {
        expect(isConvertibleFile('/path/to/file.pdf')).toBe(false);
      });

      it('jpg 파일은 변환 대상 아님', () => {
        expect(isConvertibleFile('/path/to/file.jpg')).toBe(false);
      });

      it('png 파일은 변환 대상 아님', () => {
        expect(isConvertibleFile('/path/to/file.png')).toBe(false);
      });
    });

    describe('엣지 케이스', () => {
      it('null 경로는 false 반환', () => {
        expect(isConvertibleFile(null)).toBe(false);
      });

      it('undefined 경로는 false 반환', () => {
        expect(isConvertibleFile(undefined)).toBe(false);
      });

      it('빈 문자열은 false 반환', () => {
        expect(isConvertibleFile('')).toBe(false);
      });

      it('대문자 확장자도 인식 (DOCX → true)', () => {
        expect(isConvertibleFile('/path/to/file.DOCX')).toBe(true);
      });
    });
  });

  describe('CONVERTIBLE_EXTENSIONS 상수', () => {
    it('doc, docx, xls, xlsx, ppt, pptx를 포함해야 함', () => {
      expect(CONVERTIBLE_EXTENSIONS).toContain('doc');
      expect(CONVERTIBLE_EXTENSIONS).toContain('docx');
      expect(CONVERTIBLE_EXTENSIONS).toContain('xls');
      expect(CONVERTIBLE_EXTENSIONS).toContain('xlsx');
      expect(CONVERTIBLE_EXTENSIONS).toContain('ppt');
      expect(CONVERTIBLE_EXTENSIONS).toContain('pptx');
    });

    it('hwp를 포함해야 함 (한글 문서)', () => {
      expect(CONVERTIBLE_EXTENSIONS).toContain('hwp');
    });

    it('pdf는 포함하지 않아야 함', () => {
      expect(CONVERTIBLE_EXTENSIONS).not.toContain('pdf');
    });
  });
});

// =============================================================================
// prepareDocumentResponse 테스트
// =============================================================================

describe('documentStatusHelper - prepareDocumentResponse', () => {
  describe('raw 데이터 반환', () => {
    it('원본 upload 데이터를 raw에 포함해야 함', () => {
      const doc = {
        _id: 'doc-001',
        upload: {
          originalName: 'test.pdf',
          destPath: '/uploads/test.pdf',
          uploaded_at: new Date()
        }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.raw.upload).toEqual(doc.upload);
    });

    it('원본 meta 데이터를 raw에 포함해야 함', () => {
      const doc = {
        _id: 'doc-001',
        meta: {
          mime: 'application/pdf',
          size_bytes: 1024,
          meta_status: 'ok'
        }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.raw.meta).toEqual(doc.meta);
    });

    it('원본 ocr 데이터를 raw에 포함해야 함', () => {
      const doc = {
        _id: 'doc-001',
        ocr: {
          status: 'done',
          confidence: 0.95,
          page_count: 5
        }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.raw.ocr).toEqual(doc.ocr);
    });

    it('원본 docembed 데이터를 raw에 포함해야 함', () => {
      const doc = {
        _id: 'doc-001',
        docembed: {
          status: 'done',
          chunks: 10,
          dims: 1536
        }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.raw.docembed).toEqual(doc.docembed);
    });
  });

  describe('computed - 상태별 진행률', () => {
    it('업로드만 완료 → progress 20%', () => {
      const doc = {
        _id: 'doc-001',
        upload: {
          originalName: 'test.pdf',
          destPath: '/uploads/test.pdf'
        }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.progress).toBe(20);
      expect(result.computed.currentStage).toBe(1);
    });

    it('meta 완료 (OCR 필요) → progress 60% (ocr_prep 포함)', () => {
      // meta 완료 시 ocr_prep도 자동 완료되므로 60%
      const doc = {
        _id: 'doc-001',
        upload: { destPath: '/uploads/test.pdf' },
        meta: { meta_status: 'ok', mime: 'application/pdf', size_bytes: 1024 }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.progress).toBe(60);
      expect(result.computed.currentStage).toBe(3); // ocr_prep 완료 후
    });

    it('meta 완료 (full_text 있음) → progress 50%', () => {
      const doc = {
        _id: 'doc-001',
        upload: { destPath: '/uploads/test.pdf' },
        meta: {
          meta_status: 'ok',
          mime: 'application/pdf',
          full_text: '테스트 텍스트 내용'
        }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.progress).toBe(50);
      expect(result.computed.processingPath).toBe('meta_fulltext');
    });

    it('임베딩 완료 → progress 100%', () => {
      const doc = {
        _id: 'doc-001',
        upload: { destPath: '/uploads/test.pdf' },
        meta: { meta_status: 'ok', mime: 'application/pdf' },
        ocr: { status: 'done', confidence: 0.95 },
        docembed: { status: 'done', chunks: 10, dims: 1536 }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.progress).toBe(100);
      expect(result.computed.overallStatus).toBe('completed');
    });
  });

  describe('computed - credit_pending 상태', () => {
    it('credit_pending 상태 → 크레딧 부족 UI 표시', () => {
      // credit_pending 감지를 위해 progress 필드가 있어야 함
      const doc = {
        _id: 'doc-001',
        upload: { destPath: '/uploads/test.pdf' },
        progress: 0,  // progress 필드 필요
        overallStatus: 'credit_pending',
        progressStage: 'credit_pending',
        credit_pending_info: {
          days_until_reset: 15
        }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.overallStatus).toBe('credit_pending');
      expect(result.computed.creditPending).toBe(true);
      expect(result.computed.displayMessages.status).toBe('크레딧 부족');
    });

    it('credit_pending 상태 → uiStages에 credit 단계 표시', () => {
      const doc = {
        _id: 'doc-001',
        upload: { destPath: '/uploads/test.pdf' },
        progress: 0,  // progress 필드 필요
        overallStatus: 'credit_pending',
        progressStage: 'credit_pending',
        credit_pending_info: {}
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.uiStages.credit).toBeDefined();
      expect(result.computed.uiStages.credit.status).toBe('warning');
    });
  });

  describe('computed - progress 필드 우선 사용', () => {
    it('progress 100 → 완료 상태 반환', () => {
      const doc = {
        _id: 'doc-001',
        upload: { destPath: '/uploads/test.pdf' },
        progress: 100,
        progressStage: 'complete'
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.progress).toBe(100);
      expect(result.computed.overallStatus).toBe('completed');
    });

    it('progress 50 → 처리 중 상태 반환', () => {
      const doc = {
        _id: 'doc-001',
        upload: { destPath: '/uploads/test.pdf' },
        progress: 50,
        progressMessage: '임베딩 처리 중'
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.progress).toBe(50);
      expect(result.computed.overallStatus).toBe('processing');
    });
  });

  describe('computed - 에러 상태', () => {
    it('meta 에러 → overallStatus error', () => {
      const doc = {
        _id: 'doc-001',
        upload: { destPath: '/uploads/test.pdf' },
        meta: { meta_status: 'error' }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.overallStatus).toBe('error');
      expect(result.computed.uiStages.meta.status).toBe('error');
    });

    it('OCR 에러 → overallStatus error, docembed 단계 제거', () => {
      const doc = {
        _id: 'doc-001',
        upload: { destPath: '/uploads/test.pdf' },
        meta: { meta_status: 'ok', mime: 'application/pdf' },
        ocr: { status: 'error', statusMessage: 'OCR 처리 실패' }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.overallStatus).toBe('error');
      expect(result.computed.uiStages.ocr.status).toBe('error');
      // OCR 실패 시 docembed 단계가 제거됨
      expect(result.computed.uiStages.docembed).toBeUndefined();
    });

    it('OCR quota_exceeded → overallStatus error', () => {
      const doc = {
        _id: 'doc-001',
        upload: { destPath: '/uploads/test.pdf' },
        meta: { meta_status: 'ok', mime: 'application/pdf' },
        ocr: { status: 'quota_exceeded', quota_message: 'OCR 한도 초과' }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.overallStatus).toBe('error');
      expect(result.computed.uiStages.ocr.message).toContain('OCR 한도 초과');
    });
  });

  describe('raw - 에러 관련 필드 포함 (#20)', () => {
    it('progressMessage가 raw에 포함됨', () => {
      const doc = {
        _id: 'doc-001',
        upload: { destPath: '/uploads/test.pdf' },
        progress: -1,
        progressStage: 'error',
        progressMessage: '메타데이터 저장 실패: HTTP 500',
        status: 'failed'
      };

      const result = prepareDocumentResponse(doc);

      expect(result.raw.progressMessage).toBe('메타데이터 저장 실패: HTTP 500');
    });

    it('error 객체가 raw에 포함됨', () => {
      const doc = {
        _id: 'doc-001',
        upload: { destPath: '/uploads/test.pdf' },
        progress: -1,
        progressStage: 'error',
        progressMessage: '파일 변환 실패',
        status: 'failed',
        error: { statusCode: 422, statusMessage: '파일 변환 실패' }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.raw.error).toEqual({ statusCode: 422, statusMessage: '파일 변환 실패' });
    });

    it('에러 없는 문서는 progressMessage/error가 null', () => {
      const doc = {
        _id: 'doc-001',
        upload: { destPath: '/uploads/test.pdf' },
        meta: { meta_status: 'ok', mime: 'application/pdf', full_text: 'text' },
        ocr: { status: 'ok' },
        docembed: { status: 'ok' }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.raw.progressMessage).toBeNull();
      expect(result.raw.error).toBeNull();
    });
  });

  describe('computed - 비지원 MIME 타입', () => {
    it('zip 파일 → meta 완료 시 즉시 100% 완료', () => {
      const doc = {
        _id: 'doc-001',
        upload: { destPath: '/uploads/test.zip' },
        meta: {
          meta_status: 'ok',
          mime: 'application/zip',
          size_bytes: 1024
        }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.progress).toBe(100);
      expect(result.computed.overallStatus).toBe('completed');
      // OCR, docembed 단계가 없음
      expect(result.computed.uiStages.ocr).toBeUndefined();
      expect(result.computed.uiStages.docembed).toBeUndefined();
    });

    it('video 파일 → meta 완료 시 즉시 100% 완료', () => {
      const doc = {
        _id: 'doc-001',
        upload: { destPath: '/uploads/test.mp4' },
        meta: {
          meta_status: 'ok',
          mime: 'video/mp4',
          size_bytes: 1024
        }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.progress).toBe(100);
      expect(result.computed.overallStatus).toBe('completed');
    });
  });

  describe('computed - PDF 프리뷰 관련', () => {
    it('PDF 파일 → canPreview true', () => {
      const doc = {
        _id: 'doc-001',
        upload: {
          destPath: '/uploads/test.pdf'
        }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.canPreview).toBe(true);
      expect(result.computed.previewFilePath).toBe('/uploads/test.pdf');
    });

    it('변환된 PDF가 있으면 그것을 사용', () => {
      const doc = {
        _id: 'doc-001',
        upload: {
          destPath: '/uploads/test.docx',
          convPdfPath: '/uploads/test_converted.pdf',
          conversion_status: 'completed'
        }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.canPreview).toBe(true);
      expect(result.computed.previewFilePath).toBe('/uploads/test_converted.pdf');
    });

    it('docx 파일 (변환 미완료) → canPreview false', () => {
      const doc = {
        _id: 'doc-001',
        upload: {
          destPath: '/uploads/test.docx'
        }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.canPreview).toBe(false);
      expect(result.computed.isConvertible).toBe(true);
    });
  });
});

// =============================================================================
// 회귀 테스트
// =============================================================================

describe('documentStatusHelper - 회귀 테스트', () => {
  describe('[회귀] credit_pending 상태 표시 (2026-02-05)', () => {
    /**
     * 버그 배경:
     * - credit_pending 상태인 문서가 UI에서 올바르게 표시되지 않음
     * - uiStages에 credit 단계가 누락됨
     *
     * 해결:
     * - prepareDocumentResponse()에서 credit_pending 상태를 별도로 처리
     * - uiStages.credit 단계 추가
     */
    it('credit_pending 문서는 uiStages.credit을 가져야 함', () => {
      // credit_pending 감지를 위해 progress 필드가 있어야 함
      const doc = {
        _id: 'doc-001',
        upload: { destPath: '/uploads/test.pdf' },
        progress: 0,
        progressStage: 'credit_pending',
        overallStatus: 'credit_pending'
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.uiStages.credit).toBeDefined();
      expect(result.computed.uiStages.credit.name).toBe('크레딧');
    });
  });

  describe('[회귀] OCR 실패 시 docembed 단계 제거 (2025-11-02)', () => {
    /**
     * 버그 배경:
     * - OCR 실패 시에도 docembed 단계가 UI에 표시됨
     * - 사용자 혼란 유발
     *
     * 해결:
     * - OCR error 시 uiStages에서 docembed 키 삭제
     */
    it('OCR 에러 시 uiStages.docembed가 없어야 함', () => {
      const doc = {
        _id: 'doc-001',
        upload: { destPath: '/uploads/test.pdf' },
        meta: { meta_status: 'ok', mime: 'application/pdf' },
        ocr: { status: 'error' }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.uiStages.docembed).toBeUndefined();
    });
  });

  describe('[회귀] meta_status null 처리 (2025-11-02)', () => {
    /**
     * 버그 배경:
     * - meta_status가 null인 경우 에러로 처리됨
     * - 실제로는 OCR 직접 처리 경로
     *
     * 해결:
     * - meta_status null → 'skipped' 상태로 처리
     */
    it('meta_status가 null이면 skipped 상태', () => {
      const doc = {
        _id: 'doc-001',
        upload: { destPath: '/uploads/test.pdf' },
        meta: { meta_status: null }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.uiStages.meta.status).toBe('skipped');
      expect(result.computed.overallStatus).not.toBe('error');
    });
  });
});
