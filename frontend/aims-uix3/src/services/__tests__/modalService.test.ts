/**
 * ModalService 테스트
 */

import { describe, it, expect } from 'vitest';
import { ModalService, type ModalServiceParams } from '../modalService';

describe('ModalService', () => {
  describe('validateMessage', () => {
    it('유효한 메시지를 검증해야 함', () => {
      const message = '테스트 메시지';
      const result = ModalService.validateMessage(message);

      expect(result).toBe('테스트 메시지');
    });

    it('메시지 앞뒤 공백을 제거해야 함', () => {
      const message = '  테스트 메시지  ';
      const result = ModalService.validateMessage(message);

      expect(result).toBe('테스트 메시지');
    });

    it('빈 메시지는 에러를 발생시켜야 함', () => {
      expect(() => ModalService.validateMessage('')).toThrow('Modal message cannot be empty');
    });

    it('공백만 있는 메시지는 에러를 발생시켜야 함', () => {
      expect(() => ModalService.validateMessage('   ')).toThrow('Modal message cannot be empty');
    });

    it('200자 초과 메시지는 잘라야 함', () => {
      const longMessage = 'a'.repeat(250);
      const result = ModalService.validateMessage(longMessage);

      expect(result).toBe('a'.repeat(200) + '...');
      expect(result.length).toBe(203); // 200 + '...'
    });

    it('정확히 200자 메시지는 그대로 반환해야 함', () => {
      const message = 'a'.repeat(200);
      const result = ModalService.validateMessage(message);

      expect(result).toBe(message);
    });
  });

  describe('validateTitle', () => {
    it('유효한 타이틀을 검증해야 함', () => {
      const title = '타이틀';
      const result = ModalService.validateTitle(title);

      expect(result).toBe('타이틀');
    });

    it('타이틀 앞뒤 공백을 제거해야 함', () => {
      const title = '  타이틀  ';
      const result = ModalService.validateTitle(title);

      expect(result).toBe('타이틀');
    });

    it('타이틀이 없으면 "확인"을 반환해야 함', () => {
      const result = ModalService.validateTitle();

      expect(result).toBe('확인');
    });

    it('빈 문자열 타이틀은 "확인"을 반환해야 함', () => {
      const result = ModalService.validateTitle('');

      expect(result).toBe('확인');
    });

    it('50자 초과 타이틀은 잘라야 함', () => {
      const longTitle = 'a'.repeat(60);
      const result = ModalService.validateTitle(longTitle);

      expect(result).toBe('a'.repeat(50) + '...');
      expect(result.length).toBe(53); // 50 + '...'
    });

    it('정확히 50자 타이틀은 그대로 반환해야 함', () => {
      const title = 'a'.repeat(50);
      const result = ModalService.validateTitle(title);

      expect(result).toBe(title);
    });
  });

  describe('validateParams', () => {
    it('기본 파라미터를 검증해야 함', () => {
      const params: ModalServiceParams = {
        message: '테스트 메시지',
      };

      const result = ModalService.validateParams(params);

      expect(result).toEqual({
        title: '확인',
        message: '테스트 메시지',
        confirmText: '확인',
        cancelText: '취소',
        confirmStyle: 'primary',
        showCancel: true,
        iconType: 'warning',
      });
    });

    it('모든 파라미터를 검증해야 함', () => {
      const params: ModalServiceParams = {
        title: '커스텀 타이틀',
        message: '커스텀 메시지',
        confirmText: '확인하기',
        cancelText: '취소하기',
        confirmStyle: 'destructive',
        showCancel: false,
        iconType: 'error',
      };

      const result = ModalService.validateParams(params);

      expect(result).toEqual({
        title: '커스텀 타이틀',
        message: '커스텀 메시지',
        confirmText: '확인하기',
        cancelText: '취소하기',
        confirmStyle: 'destructive',
        showCancel: false,
        iconType: 'error',
      });
    });

    it('showCancel이 false일 때 올바르게 처리해야 함', () => {
      const params: ModalServiceParams = {
        message: '테스트',
        showCancel: false,
      };

      const result = ModalService.validateParams(params);

      expect(result.showCancel).toBe(false);
    });
  });

  describe('getFileDeleteMessage', () => {
    it('파일 삭제 메시지를 생성해야 함', () => {
      const fileName = 'test.pdf';
      const result = ModalService.getFileDeleteMessage(fileName);

      expect(result).toContain('test.pdf');
      expect(result).toContain('삭제하시겠습니까');
      expect(result).toContain('되돌릴 수 없습니다');
    });

    it('긴 파일명도 처리해야 함', () => {
      const fileName = 'a'.repeat(100) + '.pdf';
      const result = ModalService.getFileDeleteMessage(fileName);

      expect(result.length).toBeLessThanOrEqual(203); // 200 + '...'
    });
  });

  describe('getFileClearMessage', () => {
    it('파일 전체 삭제 메시지를 생성해야 함', () => {
      const result = ModalService.getFileClearMessage(10);

      expect(result).toContain('10개의 파일');
      expect(result).toContain('모두 삭제하시겠습니까');
      expect(result).toContain('되돌릴 수 없습니다');
    });

    it('0개 파일도 처리해야 함', () => {
      const result = ModalService.getFileClearMessage(0);

      expect(result).toContain('0개의 파일');
    });

    it('1개 파일도 처리해야 함', () => {
      const result = ModalService.getFileClearMessage(1);

      expect(result).toContain('1개의 파일');
    });
  });

  describe('getUploadCancelMessage', () => {
    it('업로드 취소 메시지를 생성해야 함', () => {
      const result = ModalService.getUploadCancelMessage();

      expect(result).toContain('업로드를 취소하시겠습니까');
      expect(result).toContain('진행 중인 업로드가 중단됩니다');
    });
  });

  describe('getFileSizeWarningMessage', () => {
    it('파일 크기 경고 메시지를 생성해야 함', () => {
      const maxSize = '10MB';
      const result = ModalService.getFileSizeWarningMessage(maxSize);

      expect(result).toContain('10MB');
      expect(result).toContain('크기 제한을 초과합니다');
      expect(result).toContain('계속 진행하시겠습니까');
    });

    it('다양한 크기 단위를 처리해야 함', () => {
      const result1 = ModalService.getFileSizeWarningMessage('5KB');
      const result2 = ModalService.getFileSizeWarningMessage('100GB');

      expect(result1).toContain('5KB');
      expect(result2).toContain('100GB');
    });
  });

  describe('getDestructiveConfig', () => {
    it('삭제 모달 설정을 반환해야 함', () => {
      const config = ModalService.getDestructiveConfig();

      expect(config).toEqual({
        confirmStyle: 'destructive',
        confirmText: '삭제',
        cancelText: '취소',
      });
    });
  });

  describe('getWarningConfig', () => {
    it('경고 모달 설정을 반환해야 함', () => {
      const config = ModalService.getWarningConfig();

      expect(config).toEqual({
        confirmStyle: 'primary',
        confirmText: '계속 진행',
        cancelText: '취소',
        title: '주의',
      });
    });
  });

  describe('getCancelConfig', () => {
    it('취소 모달 설정을 반환해야 함', () => {
      const config = ModalService.getCancelConfig();

      expect(config).toEqual({
        confirmStyle: 'destructive',
        confirmText: '중단',
        cancelText: '계속',
        title: '작업 중단',
      });
    });
  });
});
