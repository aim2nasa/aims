/**
 * DocumentProcessingModule Tests
 * @since 2025-10-14
 *
 * 문서 처리 상태 관련 비즈니스 로직 테스트
 */

import { describe, it, expect } from 'vitest';
import { DocumentProcessingModule } from './DocumentProcessingModule';
import { DocumentStatusService } from '../../services/DocumentStatusService';
import type { Document, MetaData, OcrData, DocEmbedData, UploadData } from '../../types/documentStatus';

// ============================================
// 테스트 헬퍼: 문서 객체 생성
// ============================================
const createMockDocument = (overrides: Partial<Document> = {}): Document => ({
  _id: 'doc-123',
  filename: 'test.pdf',
  ...overrides,
});

// ============================================
// getProcessingStatus 테스트
// ============================================
describe('DocumentProcessingModule.getProcessingStatus', () => {
  it('overallStatus가 completed인 경우를 처리한다', () => {
    const doc = createMockDocument({ overallStatus: 'completed' });
    const status = DocumentProcessingModule.getProcessingStatus(doc);

    expect(status.status).toBe('completed');
    expect(status.icon).toBe('✓');
    expect(status.label).toBe('완료');
  });

  it('overallStatus가 processing인 경우를 처리한다', () => {
    const doc = createMockDocument({ overallStatus: 'processing' });
    const status = DocumentProcessingModule.getProcessingStatus(doc);

    expect(status.status).toBe('processing');
    expect(status.icon).toBe('⟳');
    expect(status.label).toBe('처리중');
  });

  it('overallStatus가 error인 경우를 처리한다', () => {
    const doc = createMockDocument({ overallStatus: 'error' });
    const status = DocumentProcessingModule.getProcessingStatus(doc);

    expect(status.status).toBe('error');
    expect(status.icon).toBe('✗');
    expect(status.label).toBe('오류');
  });

  it('overallStatus가 pending인 경우를 처리한다', () => {
    const doc = createMockDocument({ overallStatus: 'pending' });
    const status = DocumentProcessingModule.getProcessingStatus(doc);

    expect(status.status).toBe('pending');
    expect(status.icon).toBe('○');
    expect(status.label).toBe('대기');
  });

  it('overallStatus가 없으면 status를 확인한다', () => {
    const doc = createMockDocument({ status: 'completed' });
    const status = DocumentProcessingModule.getProcessingStatus(doc);

    expect(status.status).toBe('completed');
  });

  it('upload와 docembed가 완료되면 completed를 반환한다', () => {
    const uploadData: UploadData = { status: 'completed' };
    const docEmbedData: DocEmbedData = { status: 'completed' };

    const doc = createMockDocument({
      upload: JSON.stringify(uploadData),
      docembed: JSON.stringify(docEmbedData),
    });

    const status = DocumentProcessingModule.getProcessingStatus(doc);
    expect(status.status).toBe('completed');
  });

  it('upload와 docembed(done)가 완료되면 completed를 반환한다', () => {
    const uploadData: UploadData = { status: 'completed' };
    const docEmbedData: DocEmbedData = { status: 'done' };

    const doc = createMockDocument({
      upload: JSON.stringify(uploadData),
      docembed: JSON.stringify(docEmbedData),
    });

    const status = DocumentProcessingModule.getProcessingStatus(doc);
    expect(status.status).toBe('completed');
  });
});

// ============================================
// extractSummary 테스트
// ============================================
describe('DocumentProcessingModule.extractSummary', () => {
  it('meta에 full_text가 있고 summary가 있으면 meta summary를 반환한다', () => {
    const metaData: MetaData = {
      full_text: '이것은 전체 텍스트입니다.',
      summary: '이것은 요약입니다.',
    };

    const doc = createMockDocument({
      meta: JSON.stringify(metaData),
    });

    expect(DocumentProcessingModule.extractSummary(doc)).toBe('이것은 요약입니다.');
  });

  it('meta에 full_text만 있으면 앞부분 200자를 반환한다', () => {
    const longText = 'a'.repeat(250);
    const metaData: MetaData = {
      full_text: longText,
    };

    const doc = createMockDocument({
      meta: JSON.stringify(metaData),
    });

    const result = DocumentProcessingModule.extractSummary(doc);
    expect(result).toBe('a'.repeat(200) + '...');
  });

  it('meta에 full_text가 200자 이하면 전체를 반환한다', () => {
    const shortText = 'a'.repeat(100);
    const metaData: MetaData = {
      full_text: shortText,
    };

    const doc = createMockDocument({
      meta: JSON.stringify(metaData),
    });

    const result = DocumentProcessingModule.extractSummary(doc);
    expect(result).toBe(shortText);
  });

  it('meta에 full_text가 없으면 ocr summary를 반환한다', () => {
    const ocrData: OcrData = {
      summary: 'OCR 요약 텍스트',
    };

    const doc = createMockDocument({
      ocr: JSON.stringify(ocrData),
    });

    expect(DocumentProcessingModule.extractSummary(doc)).toBe('OCR 요약 텍스트');
  });

  it('ocr summary가 없으면 ocr full_text 앞부분을 반환한다', () => {
    const longText = 'b'.repeat(250);
    const ocrData: OcrData = {
      full_text: longText,
    };

    const doc = createMockDocument({
      ocr: JSON.stringify(ocrData),
    });

    const result = DocumentProcessingModule.extractSummary(doc);
    expect(result).toBe('b'.repeat(200) + '...');
  });

  it('payload.summary를 마지막 fallback으로 사용한다', () => {
    const doc = createMockDocument({
      payload: {
        summary: 'Payload 요약',
      },
    });

    expect(DocumentProcessingModule.extractSummary(doc)).toBe('Payload 요약');
  });

  it('아무 summary도 없으면 null을 반환한다', () => {
    const doc = createMockDocument({});
    expect(DocumentProcessingModule.extractSummary(doc)).toBeNull();
  });

  it('summary가 "null" 문자열이면 무시한다', () => {
    const metaData: MetaData = {
      full_text: '텍스트',
      summary: 'null',
    };

    const doc = createMockDocument({
      meta: JSON.stringify(metaData),
    });

    const result = DocumentProcessingModule.extractSummary(doc);
    expect(result).not.toBe('null');
    expect(result).toBe('텍스트'); // full_text의 앞부분 대신 사용
  });
});

// ============================================
// extractFullText 테스트
// ============================================
describe('DocumentProcessingModule.extractFullText', () => {
  it('meta에서 full_text를 최우선으로 추출한다', () => {
    const metaData: MetaData = {
      full_text: 'Meta의 전체 텍스트',
    };

    const doc = createMockDocument({
      meta: JSON.stringify(metaData),
    });

    expect(DocumentProcessingModule.extractFullText(doc)).toBe('Meta의 전체 텍스트');
  });

  it('meta가 없으면 text에서 full_text를 추출한다', () => {
    const doc = createMockDocument({
      text: JSON.stringify({ full_text: 'Text의 전체 텍스트' }),
    });

    expect(DocumentProcessingModule.extractFullText(doc)).toBe('Text의 전체 텍스트');
  });

  it('text가 없으면 ocr에서 full_text를 추출한다', () => {
    const ocrData: OcrData = {
      full_text: 'OCR 전체 텍스트',
    };

    const doc = createMockDocument({
      ocr: JSON.stringify(ocrData),
    });

    expect(DocumentProcessingModule.extractFullText(doc)).toBe('OCR 전체 텍스트');
  });

  it('payload에서 full_text를 마지막 fallback으로 사용한다', () => {
    const doc = createMockDocument({
      payload: {
        full_text: 'Payload 전체 텍스트',
      },
    });

    expect(DocumentProcessingModule.extractFullText(doc)).toBe('Payload 전체 텍스트');
  });

  it('아무 full_text도 없으면 null을 반환한다', () => {
    const doc = createMockDocument({});
    expect(DocumentProcessingModule.extractFullText(doc)).toBeNull();
  });

  it('빈 문자열은 무시한다', () => {
    const metaData: MetaData = {
      full_text: '   ', // 공백만
    };

    const doc = createMockDocument({
      meta: JSON.stringify(metaData),
    });

    expect(DocumentProcessingModule.extractFullText(doc)).toBeNull();
  });
});

// ============================================
// getCustomerLinkStatus 테스트
// ============================================
describe('DocumentProcessingModule.getCustomerLinkStatus', () => {
  it('customer_relation이 있으면 isLinked가 true이다', () => {
    const doc = createMockDocument({
      overallStatus: 'completed',
      customer_relation: {
        customer_id: 'customer-123',
        customer_name: '홍길동',
      },
    });

    const linkStatus = DocumentProcessingModule.getCustomerLinkStatus(doc);

    expect(linkStatus.isLinked).toBe(true);
    expect(linkStatus.canLink).toBe(false); // 이미 연결됨
    expect(linkStatus.linkInfo?.customer_id).toBe('customer-123');
  });

  it('customer_relation이 없고 completed 상태이면 canLink가 true이다', () => {
    const doc = createMockDocument({
      overallStatus: 'completed',
    });

    const linkStatus = DocumentProcessingModule.getCustomerLinkStatus(doc);

    expect(linkStatus.isLinked).toBe(false);
    expect(linkStatus.canLink).toBe(true);
    expect(linkStatus.linkInfo).toBeUndefined();
  });

  it('processing 상태이면 canLink가 false이다', () => {
    const doc = createMockDocument({
      overallStatus: 'processing',
    });

    const linkStatus = DocumentProcessingModule.getCustomerLinkStatus(doc);

    expect(linkStatus.isLinked).toBe(false);
    expect(linkStatus.canLink).toBe(false);
  });

  it('error 상태이면 canLink가 false이다', () => {
    const doc = createMockDocument({
      overallStatus: 'error',
    });

    const linkStatus = DocumentProcessingModule.getCustomerLinkStatus(doc);

    expect(linkStatus.canLink).toBe(false);
  });
});

// ============================================
// getAvailableActions 테스트
// ============================================
describe('DocumentProcessingModule.getAvailableActions', () => {
  it('completed 상태에서는 모든 액션이 가능하다', () => {
    const doc = createMockDocument({
      overallStatus: 'completed',
    });

    const actions = DocumentProcessingModule.getAvailableActions(doc);

    expect(actions.canViewDetail).toBe(true);
    expect(actions.canViewSummary).toBe(true);
    expect(actions.canViewFullText).toBe(true);
    expect(actions.canLink).toBe(true);
  });

  it('processing 상태에서는 상세보기만 가능하다', () => {
    const doc = createMockDocument({
      overallStatus: 'processing',
    });

    const actions = DocumentProcessingModule.getAvailableActions(doc);

    expect(actions.canViewDetail).toBe(true);
    expect(actions.canViewSummary).toBe(false);
    expect(actions.canViewFullText).toBe(false);
    expect(actions.canLink).toBe(false);
  });

  it('이미 연결된 문서는 canLink가 false이다', () => {
    const doc = createMockDocument({
      overallStatus: 'completed',
      customer_relation: {
        customer_id: 'customer-123',
      },
    });

    const actions = DocumentProcessingModule.getAvailableActions(doc);

    expect(actions.canLink).toBe(false); // 이미 연결됨
    expect(actions.canViewSummary).toBe(true);
    expect(actions.canViewFullText).toBe(true);
  });

  it('error 상태에서도 상세보기는 가능하다', () => {
    const doc = createMockDocument({
      overallStatus: 'error',
    });

    const actions = DocumentProcessingModule.getAvailableActions(doc);

    expect(actions.canViewDetail).toBe(true);
    expect(actions.canViewSummary).toBe(false);
  });
});

// ============================================
// 엣지 케이스 및 통합 테스트
// ============================================
describe('DocumentProcessingModule 통합 테스트', () => {
  it('meta.full_text가 있고 OCR pending인 문서는 completed로 처리한다', () => {
    const metaData: MetaData = {
      full_text: '메타에서 추출한 텍스트',
      status: 'completed',
    };

    const ocrData: OcrData = {
      status: 'pending',
    };

    const uploadData: UploadData = {
      status: 'completed',
    };

    const doc = createMockDocument({
      upload: JSON.stringify(uploadData),
      meta: JSON.stringify(metaData),
      ocr: JSON.stringify(ocrData),
      stages: {
        upload: JSON.stringify(uploadData),
        meta: JSON.stringify(metaData),
        ocr: JSON.stringify(ocrData),
      },
    });

    const status = DocumentProcessingModule.getProcessingStatus(doc);
    expect(status.status).toBe('completed');
  });

  it('stages 객체만 있으면 null을 반환한다 (stages는 별도 처리)', () => {
    const metaData: MetaData = {
      full_text: 'Stages에서 추출한 텍스트',
    };

    const doc = createMockDocument({
      stages: {
        meta: JSON.stringify(metaData),
      },
    });

    // extractFullText는 document.meta, document.text, document.ocr, document.payload만 확인
    // stages는 getProcessingStatus 내부에서만 사용됨
    expect(DocumentProcessingModule.extractFullText(doc)).toBeNull();
  });

  it('JSON 파싱 실패 시 gracefully 처리한다', () => {
    const doc = createMockDocument({
      meta: 'invalid json',
      ocr: 'also invalid',
    });

    // 예외가 발생하지 않아야 함
    expect(() => DocumentProcessingModule.extractSummary(doc)).not.toThrow();
    expect(() => DocumentProcessingModule.extractFullText(doc)).not.toThrow();
    expect(DocumentProcessingModule.extractSummary(doc)).toBeNull();
  });

  it('문서 객체가 이미 파싱된 객체인 경우도 처리한다', () => {
    const metaData: MetaData = {
      full_text: '파싱된 객체',
    };

    const doc = createMockDocument({
      meta: metaData as any, // 문자열이 아닌 객체
    });

    expect(DocumentProcessingModule.extractFullText(doc)).toBe('파싱된 객체');
  });
});

// ============================================
// _hasMetaText/_hasOcrText 플래그 테스트 (Phase 1 경량화 API 호환)
// — 목록 API에서 full_text가 제거되고 boolean 플래그만 전달되는 시나리오
// ============================================
describe('_hasMetaText/_hasOcrText 플래그 기반 동작', () => {
  describe('getProcessingStatus — 플래그 기반 상태 판정', () => {
    it('_hasMetaText=true, full_text 없음 → upload completed + meta completed + ocr pending이면 completed', () => {
      const uploadData: UploadData = { status: 'completed' };
      const metaData: MetaData = { meta_status: 'ok' };
      const doc = createMockDocument({
        upload: JSON.stringify(uploadData),
        meta: JSON.stringify(metaData),
        stages: {
          meta: JSON.stringify({ status: 'completed' } as MetaData),
          ocr: JSON.stringify({ status: 'pending' } as OcrData),
        },
        _hasMetaText: true,
      } as any);

      const status = DocumentProcessingModule.getProcessingStatus(doc);
      expect(status.status).toBe('completed');
    });

    it('_hasMetaText=false, full_text 없음 → meta completed지만 ocrStatus=pending이면 completed 아님', () => {
      const uploadData: UploadData = { status: 'completed' };
      const metaData: MetaData = { meta_status: 'ok' };
      const doc = createMockDocument({
        upload: JSON.stringify(uploadData),
        meta: JSON.stringify(metaData),
        stages: {
          meta: JSON.stringify({ status: 'completed' } as MetaData),
          ocr: JSON.stringify({ status: 'pending' } as OcrData),
        },
        _hasMetaText: false,
      } as any);

      const status = DocumentProcessingModule.getProcessingStatus(doc);
      // _hasMetaText=false이므로 meta_fulltext 경로로 completed 판정 안 됨
      expect(status.status).not.toBe('completed');
    });

    it('_hasOcrText=true → hasMetaFullText 경로에서 hasOcrText가 true이면 completed 아님 (OCR 미완료)', () => {
      // upload processing (upload completed 블록 스킵) → meta ok → hasMetaFullText + hasOcrText
      const uploadData: UploadData = { status: 'processing' };
      const metaData: MetaData = { meta_status: 'ok' };
      const doc = createMockDocument({
        upload: JSON.stringify(uploadData),
        meta: JSON.stringify(metaData),
        _hasMetaText: true,
        _hasOcrText: true,
      } as any);

      const status = DocumentProcessingModule.getProcessingStatus(doc);
      // _hasOcrText=true이므로 meta_fulltext만으로 completed 아님 (OCR 경로 대기)
      expect(status.status).toBe('processing');
    });

    it('_hasMetaText=true, _hasOcrText=false → OCR 불필요, meta_fulltext만으로 completed', () => {
      // upload processing → meta ok → hasMetaFullText=true, hasOcrText=false → completed
      const uploadData: UploadData = { status: 'processing' };
      const metaData: MetaData = { meta_status: 'ok' };
      const doc = createMockDocument({
        upload: JSON.stringify(uploadData),
        meta: JSON.stringify(metaData),
        _hasMetaText: true,
        _hasOcrText: false,
      } as any);

      const status = DocumentProcessingModule.getProcessingStatus(doc);
      expect(status.status).toBe('completed');
    });
  });

  describe('extractProgress (DocumentStatusService) — 플래그 기반 75% 판정', () => {
    it('_hasMetaText=true, progress=50 → embed 미완료지만 meta stage completed이면 100', () => {
      const uploadData: UploadData = { status: 'completed' };
      const metaData: MetaData = { meta_status: 'ok' };
      const doc = createMockDocument({
        upload: JSON.stringify(uploadData),
        meta: JSON.stringify(metaData),
        stages: {
          meta: JSON.stringify({ status: 'completed' } as MetaData),
        },
        progress: 50,
        _hasMetaText: true,
      } as any);

      const progress = DocumentStatusService.extractProgress(doc);
      // _hasMetaText + meta stage completed → 100
      expect(progress).toBe(100);
    });

    it('_hasMetaText=false, progress=50 → 50 그대로 반환', () => {
      const uploadData: UploadData = { status: 'completed' };
      const metaData: MetaData = { meta_status: 'ok' };
      const doc = createMockDocument({
        upload: JSON.stringify(uploadData),
        meta: JSON.stringify(metaData),
        stages: {
          meta: JSON.stringify({ status: 'completed' } as MetaData),
        },
        progress: 50,
        _hasMetaText: false,
      } as any);

      const progress = DocumentStatusService.extractProgress(doc);
      // _hasMetaText=false → 100이 아님
      expect(progress).toBe(50);
    });
  });

  describe('extractSummary — _hasMetaText 플래그 기반 경로 선택', () => {
    it('_hasMetaText=true, full_text 없음, summary 있음 → meta summary 반환', () => {
      const metaData: MetaData = {
        meta_status: 'ok',
        summary: '이것은 요약입니다.',
      };
      const doc = createMockDocument({
        meta: JSON.stringify(metaData),
        _hasMetaText: true,
      } as any);

      const result = DocumentProcessingModule.extractSummary(doc);
      expect(result).toBe('이것은 요약입니다.');
    });

    it('_hasMetaText=true, full_text 없음, summary 없음 → null (full_text fallback 불가)', () => {
      const metaData: MetaData = {
        meta_status: 'ok',
      };
      const doc = createMockDocument({
        meta: JSON.stringify(metaData),
        _hasMetaText: true,
      } as any);

      // full_text가 없으므로 200자 fallback 불가. ocr도 없으므로 null
      const result = DocumentProcessingModule.extractSummary(doc);
      expect(result).toBeNull();
    });
  });
});
