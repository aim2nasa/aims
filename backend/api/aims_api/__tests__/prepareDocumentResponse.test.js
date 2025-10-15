/**
 * prepareDocumentResponse.test.js
 * prepareDocumentResponse 함수 유닛 테스트
 */

const { prepareDocumentResponse } = require('../lib/documentStatusHelper');

describe('prepareDocumentResponse', () => {

  describe('meta_status 처리', () => {

    test('meta_status가 "ok"인 경우 정상 처리', () => {
      const doc = {
        _id: '123',
        upload: { uploaded_at: '2025-10-14T00:00:00Z' },
        meta: {
          meta_status: 'ok',
          mime: 'application/pdf',
          size_bytes: 1024,
          created_at: '2025-10-14T00:01:00Z'
        }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.uiStages.meta.status).toBe('completed');
      expect(result.computed.overallStatus).toBe('processing');
      // OCR 준비 단계(3)로 넘어감
      expect(result.computed.currentStage).toBe(3);
    });

    test('meta_status가 "error"인 경우 에러 처리', () => {
      const doc = {
        _id: '123',
        upload: { uploaded_at: '2025-10-14T00:00:00Z' },
        meta: { meta_status: 'error' }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.uiStages.meta.status).toBe('error');
      expect(result.computed.overallStatus).toBe('error');
      expect(result.computed.currentStage).toBe(1);
      expect(result.computed.displayMessages.meta).toBe('메타데이터 추출 실패');
    });

    test('meta_status가 null인 경우 skipped 처리 (NEW - 버그 수정)', () => {
      const doc = {
        _id: '123',
        upload: { uploaded_at: '2025-10-14T00:00:00Z' },
        meta: { meta_status: null },
        ocr: { status: 'done', confidence: '0.95' },
        docembed: { status: 'done', chunks: 10, dims: 1536 }
      };

      const result = prepareDocumentResponse(doc);

      // ✅ meta 단계는 skipped
      expect(result.computed.uiStages.meta.status).toBe('skipped');
      expect(result.computed.uiStages.meta.message).toBe('Meta 단계 생략 (OCR 직접 처리)');

      // ✅ OCR 단계는 completed (early return 하지 않음)
      expect(result.computed.uiStages.ocr.status).toBe('completed');

      // ✅ docembed 단계도 completed
      expect(result.computed.uiStages.docembed.status).toBe('completed');
      expect(result.computed.overallStatus).toBe('completed');
    });

    test('meta_status가 null이고 OCR done인 경우 OCR completed 표시', () => {
      const doc = {
        _id: '123',
        upload: { uploaded_at: '2025-10-14T00:00:00Z' },
        meta: { meta_status: null },
        ocr: {
          status: 'done',
          confidence: '0.97',
          done_at: '2025-10-14T16:54:59.303Z'
        }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.uiStages.meta.status).toBe('skipped');
      expect(result.computed.uiStages.ocr.status).toBe('completed');
      expect(result.computed.displayMessages.ocr).toContain('OCR 완료');
      expect(result.computed.displayMessages.ocr).toContain('0.97');
    });

    test('meta_status가 undefined인 경우 처리', () => {
      const doc = {
        _id: '123',
        upload: { uploaded_at: '2025-10-14T00:00:00Z' },
        meta: {}
      };

      const result = prepareDocumentResponse(doc);

      // meta_status가 undefined면 모든 조건 통과 (pending 유지)
      expect(result.computed.uiStages.meta.status).toBe('pending');
      expect(result.computed.currentStage).toBe(1);
      expect(result.computed.overallStatus).toBe('processing');
    });
  });

  describe('OCR 처리', () => {

    test('OCR status가 done인 경우', () => {
      const doc = {
        _id: '123',
        upload: { uploaded_at: '2025-10-14T00:00:00Z' },
        meta: { meta_status: 'ok', mime: 'application/pdf', size_bytes: 1024 },
        ocr: { status: 'done', confidence: '0.95' }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.uiStages.ocr.status).toBe('completed');
      expect(result.computed.currentStage).toBe(4);
      expect(result.computed.progress).toBe(80);
    });

    test('OCR status가 error인 경우', () => {
      const doc = {
        _id: '123',
        upload: { uploaded_at: '2025-10-14T00:00:00Z' },
        meta: { meta_status: 'ok', mime: 'application/pdf', size_bytes: 1024 },
        ocr: { status: 'error', statusMessage: 'OCR 엔진 오류', statusCode: 500 }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.uiStages.ocr.status).toBe('error');
      expect(result.computed.overallStatus).toBe('error');
      expect(result.computed.uiStages.ocr.message).toContain('OCR 실패');
      expect(result.computed.uiStages.ocr.message).toContain('OCR 엔진 오류');
    });

    test('OCR status가 running인 경우', () => {
      const doc = {
        _id: '123',
        upload: { uploaded_at: '2025-10-14T00:00:00Z' },
        meta: { meta_status: 'ok', mime: 'application/pdf', size_bytes: 1024 },
        ocr: { status: 'running' }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.uiStages.ocr.status).toBe('processing');
      expect(result.computed.overallStatus).toBe('processing');
      expect(result.computed.progress).toBe(75);
    });
  });

  describe('DocEmbed 처리', () => {

    test('DocEmbed status가 done인 경우', () => {
      const doc = {
        _id: '123',
        upload: { uploaded_at: '2025-10-14T00:00:00Z' },
        meta: { meta_status: 'ok', mime: 'application/pdf', size_bytes: 1024 },
        ocr: { status: 'done', confidence: '0.95' },
        docembed: { status: 'done', chunks: 15, dims: 1536 }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.uiStages.docembed.status).toBe('completed');
      expect(result.computed.overallStatus).toBe('completed');
      expect(result.computed.progress).toBe(100);
      expect(result.computed.currentStage).toBe(5);
    });

    test('DocEmbed status가 failed인 경우', () => {
      const doc = {
        _id: '123',
        upload: { uploaded_at: '2025-10-14T00:00:00Z' },
        meta: { meta_status: 'ok', mime: 'application/pdf', size_bytes: 1024 },
        ocr: { status: 'done', confidence: '0.95' },
        docembed: { status: 'failed', error_message: '임베딩 모델 오류' }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.uiStages.docembed.status).toBe('error');
      expect(result.computed.overallStatus).toBe('error');
      expect(result.computed.uiStages.docembed.message).toContain('임베딩 모델 오류');
    });

    test('DocEmbed status가 processing인 경우', () => {
      const doc = {
        _id: '123',
        upload: { uploaded_at: '2025-10-14T00:00:00Z' },
        meta: { meta_status: 'ok', mime: 'application/pdf', size_bytes: 1024 },
        ocr: { status: 'done', confidence: '0.95' },
        docembed: { status: 'processing' }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.uiStages.docembed.status).toBe('processing');
      expect(result.computed.overallStatus).toBe('processing');
      expect(result.computed.progress).toBe(90);
    });
  });

  describe('raw + computed 구조', () => {

    test('raw 필드에 원본 데이터가 포함되어야 함', () => {
      const doc = {
        _id: '123',
        upload: { uploaded_at: '2025-10-14T00:00:00Z' },
        meta: { meta_status: 'ok', mime: 'application/pdf', size_bytes: 1024 },
        ocr: { status: 'done', confidence: '0.95' },
        text: null,
        docembed: { status: 'done', chunks: 10, dims: 1536 }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.raw).toBeDefined();
      expect(result.raw._id).toBe('123');
      expect(result.raw.upload).toEqual(doc.upload);
      expect(result.raw.meta).toEqual(doc.meta);
      expect(result.raw.ocr).toEqual(doc.ocr);
      expect(result.raw.text).toBeNull();
      expect(result.raw.docembed).toEqual(doc.docembed);
    });

    test('computed 필드에 계산된 UI 값이 포함되어야 함', () => {
      const doc = {
        _id: '123',
        upload: { uploaded_at: '2025-10-14T00:00:00Z' },
        meta: { meta_status: 'ok', mime: 'application/pdf', size_bytes: 1024 },
        ocr: { status: 'done', confidence: '0.95' }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed).toBeDefined();
      expect(result.computed.uiStages).toBeDefined();
      expect(result.computed.currentStage).toBeDefined();
      expect(result.computed.overallStatus).toBeDefined();
      expect(result.computed.progress).toBeDefined();
      expect(result.computed.displayMessages).toBeDefined();
      expect(result.computed.processingPath).toBeDefined();
    });
  });

  describe('hasMetaText 경로 분기', () => {

    test('meta.full_text가 있으면 3단계 경로 (upload → meta → docembed)', () => {
      const doc = {
        _id: '123',
        upload: { uploaded_at: '2025-10-14T00:00:00Z' },
        meta: {
          meta_status: 'ok',
          mime: 'application/pdf',
          size_bytes: 1024,
          full_text: '문서 내용'
        },
        docembed: { status: 'done', chunks: 10, dims: 1536 }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.uiStages.ocr_prep).toBeUndefined();
      expect(result.computed.uiStages.ocr).toBeUndefined();
      expect(result.computed.uiStages.upload).toBeDefined();
      expect(result.computed.uiStages.meta).toBeDefined();
      expect(result.computed.uiStages.docembed).toBeDefined();
      expect(result.computed.processingPath).toBe('meta_fulltext');
      expect(result.computed.currentStage).toBe(3);
    });

    test('meta.full_text가 없으면 5단계 경로 (upload → meta → ocr_prep → ocr → docembed)', () => {
      const doc = {
        _id: '123',
        upload: { uploaded_at: '2025-10-14T00:00:00Z' },
        meta: { meta_status: 'ok', mime: 'application/pdf', size_bytes: 1024 },
        ocr: { status: 'done', confidence: '0.95' },
        docembed: { status: 'done', chunks: 10, dims: 1536 }
      };

      const result = prepareDocumentResponse(doc);

      expect(result.computed.uiStages.upload).toBeDefined();
      expect(result.computed.uiStages.meta).toBeDefined();
      expect(result.computed.uiStages.ocr_prep).toBeDefined();
      expect(result.computed.uiStages.ocr).toBeDefined();
      expect(result.computed.uiStages.docembed).toBeDefined();
      expect(result.computed.processingPath).toBe('ocr_normal');
      expect(result.computed.currentStage).toBe(5);
    });
  });

  describe('실제 버그 케이스 (GitHub Issue)', () => {

    test('캐치업사업비내역서.pdf 케이스 - OCR 504 에러, docembed는 skipped여야 함', () => {
      const doc = {
        _id: '68dc951e7b81761c98c4b48e',
        upload: {
          originalName: '캐치업사업비내역서.pdf',
          saveName: '251001024238_olbro94y.pdf',
          destPath: '/data/files/2025/10/251001024238_olbro94y.pdf',
          uploaded_at: '2025-10-01T11:42:38.380xxx',
          sourcePath: ''
        },
        meta: {
          filename: '251001024238_olbro94y.pdf',
          extension: '.pdf',
          mime: 'application/pdf',
          size_bytes: '92126',
          created_at: '2025-10-01T02:42:38.367Z',
          meta_status: 'ok',
          exif: '{}',
          pdf_pages: '8',
          full_text: null,  // 이미지 PDF (텍스트 없음)
          pdf_text_ratio: '{"total_pages":8,"text_pages":0,"text_ratio":0}',
          summary: 'null',
          length: 0,
          truncated: false
        },
        ocr: {
          status: 'error',  // ❌ OCR 실패
          queued_at: '2025-10-01T11:42:40.116+09:00',
          started_at: '2025-10-01T11:42:40.814+09:00',
          failed_at: '2025-10-01T11:43:41.139+09:00',
          statusCode: '504',
          statusMessage: null,
          errorBody: null
        }
        // docembed 서브도큐먼트 없음 (OCR 실패로 생성되지 않음)
      };

      const result = prepareDocumentResponse(doc);

      // ✅ 기대값: meta completed, OCR error, docembed는 존재하지 않음
      expect(result.computed.uiStages.meta.status).toBe('completed');
      expect(result.computed.uiStages.ocr.status).toBe('error');
      expect(result.computed.uiStages.ocr.message).toContain('OCR 실패');
      expect(result.computed.uiStages.ocr.message).toContain('504');

      // ✅ docembed는 아예 존재하지 않음 (DB에도 없고 UI에도 표시 안 함)
      expect(result.computed.uiStages.docembed).toBeUndefined();

      expect(result.computed.overallStatus).toBe('error');
      expect(result.computed.currentStage).toBe(4);
      expect(result.computed.progress).toBe(60);

      // ✅ uiStages에 docembed 키가 없으므로 UI에서 표시되지 않음
      expect(Object.keys(result.computed.uiStages)).toEqual([
        'upload', 'meta', 'ocr_prep', 'ocr'
      ]);

      // ❌ 버그 수정 전에는 이렇게 나왔음:
      // - docembed.status = 'pending' (마치 대기 중인 것처럼 보임)
      // - 사용자가 "처리 중"이라고 오해할 수 있음
    });

    test('김보성님운전자보험청약서.pdf 케이스 - meta_status: null, ocr: done, docembed: done', () => {
      const doc = {
        _id: '68ee01bd7b81761c98c4b48f',
        upload: {
          originalName: '김보성님운전자보험청약서.pdf',
          saveName: '251014075437_sn6k3pvy.pdf',
          destPath: '/data/files/2025/10/251014075437_sn6k3pvy.pdf',
          uploaded_at: '2025-10-14T16:54:37.127xxx',
          sourcePath: ''
        },
        meta: {
          filename: null,
          extension: null,
          mime: null,
          size_bytes: null,
          created_at: null,
          meta_status: null,  // ❌ 버그 원인: null을 error로 처리
          exif: null,
          pdf_pages: null,
          full_text: null,
          pdf_text_ratio: null,
          summary: null,
          length: null,
          truncated: null
        },
        ocr: {
          status: 'done',  // ✅ OCR 성공
          queued_at: '2025-10-14T16:54:38.062+09:00',
          started_at: '2025-10-14T16:54:39.021+09:00',
          done_at: '2025-10-14T16:54:59.303+09:00',
          confidence: '0.9751',
          full_text: '청 약 서 무배당한대해상뉴하이카운전자상해보험...'
        },
        docembed: {
          status: 'done',  // ✅ Docembed 성공
          chunks: 50,
          dims: 1536
        }
      };

      const result = prepareDocumentResponse(doc);

      // ✅ 기대값: meta skipped, OCR completed, docembed completed
      expect(result.computed.uiStages.meta.status).toBe('skipped');
      expect(result.computed.uiStages.ocr.status).toBe('completed');
      expect(result.computed.uiStages.docembed.status).toBe('completed');
      expect(result.computed.overallStatus).toBe('completed');
      expect(result.computed.progress).toBe(100);

      // ❌ 버그 수정 전에는 이렇게 나왔음:
      // - meta.status = 'error'
      // - ocr.status = 'pending' (early return으로 체크 안 됨)
      // - docembed.status = 'pending' (early return으로 체크 안 됨)
    });
  });
});
