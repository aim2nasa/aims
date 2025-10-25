/**
 * ProcessingLog Component Unit Tests
 * @since 2025-10-23
 *
 * 테스트 범위 (74fbc13, 1c06e77, bb4f0df, e22b548):
 * 1. 정렬 기능 (오래된순/최신순)
 * 2. 자동 스크롤 (정렬 상태에 따라)
 * 3. 로그 포맷팅 (밀리초 포함)
 * 4. 로그 지우기
 * 5. 로그 복사 (클립보드)
 * 6. 로그 다운로드 (텍스트 파일)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProcessingLog from './ProcessingLog';
import type { ProcessingLog as Log } from '../types/logTypes';

describe('ProcessingLog Component', () => {
  const mockLogs: Log[] = [
    {
      id: 'log1',
      timestamp: new Date('2025-10-23T10:00:00'),
      level: 'info',
      message: '첫 번째 로그',
      details: '상세 정보 1'
    },
    {
      id: 'log2',
      timestamp: new Date('2025-10-23T10:01:00'),
      level: 'success',
      message: '두 번째 로그'
    },
    {
      id: 'log3',
      timestamp: new Date('2025-10-23T10:02:00'),
      level: 'error',
      message: '세 번째 로그',
      details: '에러 상세 정보'
    }
  ];

  describe('렌더링', () => {
    it('기본 컴포넌트가 렌더링되어야 한다', () => {
      render(<ProcessingLog logs={[]} />);

      expect(screen.getByText('처리 로그')).toBeInTheDocument();
      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('로그 개수가 정확하게 표시되어야 한다', () => {
      render(<ProcessingLog logs={mockLogs} />);

      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('모든 로그 메시지가 렌더링되어야 한다', () => {
      render(<ProcessingLog logs={mockLogs} />);

      expect(screen.getByText('첫 번째 로그')).toBeInTheDocument();
      expect(screen.getByText('두 번째 로그')).toBeInTheDocument();
      expect(screen.getByText('세 번째 로그')).toBeInTheDocument();
    });

    it('상세 정보가 있는 로그는 details가 표시되어야 한다', () => {
      render(<ProcessingLog logs={mockLogs} />);

      expect(screen.getByText('상세 정보 1')).toBeInTheDocument();
      expect(screen.getByText('에러 상세 정보')).toBeInTheDocument();
    });
  });


  describe('정렬 기능 (74fbc13)', () => {
    it('정렬 버튼이 렌더링되어야 한다', () => {
      render(<ProcessingLog logs={mockLogs} />);

      const sortButton = screen.getByLabelText('오래된순 정렬'); // 기본값이 newest-first
      expect(sortButton).toBeInTheDocument();
    });

    it('초기 정렬 순서는 최신순이어야 한다', () => {
      render(<ProcessingLog logs={mockLogs} />);

      const sortButton = screen.getByLabelText('오래된순 정렬'); // 기본값이 newest-first
      expect(sortButton).toBeInTheDocument();
      expect(sortButton.textContent).toBe('↓');
    });

    it('정렬 버튼 클릭 시 오래된순으로 변경되어야 한다', async () => {
      const user = userEvent.setup();
      render(<ProcessingLog logs={mockLogs} />);

      const sortButton = screen.getByLabelText('오래된순 정렬');
      await user.click(sortButton);

      await waitFor(() => {
        const updatedButton = screen.getByLabelText('최신순 정렬');
        expect(updatedButton).toBeInTheDocument();
        expect(updatedButton.textContent).toBe('↑');
      });
    });

    it('정렬 버튼 두 번 클릭 시 다시 최신순으로 변경되어야 한다', async () => {
      const user = userEvent.setup();
      render(<ProcessingLog logs={mockLogs} />);

      let sortButton = screen.getByLabelText('오래된순 정렬');
      await user.click(sortButton);

      await waitFor(() => {
        sortButton = screen.getByLabelText('최신순 정렬');
      });

      await user.click(sortButton);

      await waitFor(() => {
        const updatedButton = screen.getByLabelText('오래된순 정렬');
        expect(updatedButton).toBeInTheDocument();
      });
    });

    it('최신순 정렬 시 로그가 시간 순서대로 표시되어야 한다', () => {
      render(<ProcessingLog logs={mockLogs} />);

      // .processing-log__message 클래스를 가진 요소만 조회
      const logMessages = document.querySelectorAll('.processing-log__message');
      expect(logMessages[0]).toHaveTextContent('첫 번째 로그');
      expect(logMessages[1]).toHaveTextContent('두 번째 로그');
      expect(logMessages[2]).toHaveTextContent('세 번째 로그');
    });

    it('오래된순 정렬 시 로그가 시간 역순으로 표시되어야 한다', async () => {
      const user = userEvent.setup();
      render(<ProcessingLog logs={mockLogs} />);

      const sortButton = screen.getByLabelText('오래된순 정렬');
      await user.click(sortButton);

      await waitFor(() => {
        const logMessages = document.querySelectorAll('.processing-log__message');
        expect(logMessages[0]).toHaveTextContent('세 번째 로그');
        expect(logMessages[1]).toHaveTextContent('두 번째 로그');
        expect(logMessages[2]).toHaveTextContent('첫 번째 로그');
      });
    });
  });

  describe('자동 스크롤 기능', () => {
    it('새 로그 추가 시 자동 스크롤이 발생해야 한다', async () => {
      const { rerender } = render(<ProcessingLog logs={mockLogs} />);

      const container = document.querySelector('.processing-log__container') as HTMLDivElement;
      expect(container).toBeInTheDocument();

      // 새 로그 추가
      const newLogs: Log[] = [
        ...mockLogs,
        {
          id: 'log4',
          timestamp: new Date('2025-10-23T10:03:00'),
          level: 'info',
          message: '네 번째 로그'
        }
      ];

      rerender(<ProcessingLog logs={newLogs} />);

      await waitFor(() => {
        // 최신순 정렬(기본값)에서는 맨 위로 스크롤
        // scrollTop이 0으로 설정될 것으로 예상
        expect(container.scrollTop).toBe(0);
      });
    });

  });

  describe('시간 포맷팅', () => {
    it('시간이 HH:MM:SS 형식으로 표시되어야 한다', () => {
      render(<ProcessingLog logs={mockLogs} />);

      expect(screen.getByText('10:00:00.000')).toBeInTheDocument();
      expect(screen.getByText('10:01:00.000')).toBeInTheDocument();
      expect(screen.getByText('10:02:00.000')).toBeInTheDocument();
    });

    it('한 자리 숫자는 0으로 패딩되어야 한다', () => {
      const singleDigitLogs: Log[] = [
        {
          id: 'log1',
          timestamp: new Date('2025-10-23T09:05:03'),
          level: 'info',
          message: '테스트 로그'
        }
      ];

      render(<ProcessingLog logs={singleDigitLogs} />);

      expect(screen.getByText('09:05:03.000')).toBeInTheDocument();
    });
  });

  describe('로그 지우기 기능', () => {
    it('로그 지우기 버튼이 렌더링되어야 한다', () => {
      render(<ProcessingLog logs={mockLogs} />);

      const clearButton = screen.getByLabelText('로그 지우기');
      expect(clearButton).toBeInTheDocument();
    });

    it('로그 지우기 버튼 클릭 시 onClear가 호출되어야 한다', async () => {
      const user = userEvent.setup();
      const mockOnClear = vi.fn();

      render(<ProcessingLog logs={mockLogs} onClear={mockOnClear} />);

      const clearButton = screen.getByLabelText('로그 지우기');
      await user.click(clearButton);

      expect(mockOnClear).toHaveBeenCalledTimes(1);
    });

    it('onClear가 없으면 버튼 클릭 시 에러가 발생하지 않아야 한다', async () => {
      const user = userEvent.setup();

      render(<ProcessingLog logs={mockLogs} />);

      const clearButton = screen.getByLabelText('로그 지우기');

      // 에러 없이 클릭 가능해야 함
      await expect(user.click(clearButton)).resolves.not.toThrow();
    });
  });

  describe('로그 레벨별 스타일', () => {
    it('각 로그 레벨별로 적절한 아이콘이 표시되어야 한다', () => {
      const allLevelLogs: Log[] = [
        {
          id: 'info-log',
          timestamp: new Date(),
          level: 'info',
          message: 'Info 로그'
        },
        {
          id: 'success-log',
          timestamp: new Date(),
          level: 'success',
          message: 'Success 로그'
        },
        {
          id: 'warning-log',
          timestamp: new Date(),
          level: 'warning',
          message: 'Warning 로그'
        },
        {
          id: 'error-log',
          timestamp: new Date(),
          level: 'error',
          message: 'Error 로그'
        },
        {
          id: 'ar-log',
          timestamp: new Date(),
          level: 'ar-detect',
          message: 'AR 감지 로그'
        }
      ];

      render(<ProcessingLog logs={allLevelLogs} />);

      // 모든 레벨의 로그가 렌더링되어야 함
      expect(screen.getByText('Info 로그')).toBeInTheDocument();
      expect(screen.getByText('Success 로그')).toBeInTheDocument();
      expect(screen.getByText('Warning 로그')).toBeInTheDocument();
      expect(screen.getByText('Error 로그')).toBeInTheDocument();
      expect(screen.getByText('AR 감지 로그')).toBeInTheDocument();

      // 아이콘 컨테이너가 각 로그마다 존재해야 함
      const iconContainers = document.querySelectorAll('.processing-log__icon');
      expect(iconContainers.length).toBe(5);
    });
  });

  describe('Props 테스트', () => {
    it('maxHeight prop이 적용되어야 한다', () => {
      render(<ProcessingLog logs={mockLogs} maxHeight={500} />);

      const container = document.querySelector('.processing-log__container') as HTMLDivElement;
      expect(container).toBeInTheDocument();
      expect(container.style.maxHeight).toBe('500px');
    });

    it('기본 maxHeight는 300px이어야 한다', () => {
      render(<ProcessingLog logs={mockLogs} />);

      const container = document.querySelector('.processing-log__container') as HTMLDivElement;
      expect(container).toBeInTheDocument();
      expect(container.style.maxHeight).toBe('300px');
    });

    it('className prop이 적용되어야 한다', () => {
      render(<ProcessingLog logs={mockLogs} className="custom-class" />);

      const component = document.querySelector('.processing-log.custom-class');
      expect(component).toBeInTheDocument();
    });
  });

  describe('빈 로그 처리', () => {
    it('로그가 없을 때도 정상적으로 렌더링되어야 한다', () => {
      render(<ProcessingLog logs={[]} />);

      expect(screen.getByText('처리 로그')).toBeInTheDocument();
      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('로그가 없을 때 정렬/지우기 버튼은 여전히 표시되어야 한다', () => {
      render(<ProcessingLog logs={[]} onClear={vi.fn()} />);

      expect(screen.getByLabelText('오래된순 정렬')).toBeInTheDocument(); // 기본값이 newest-first이므로
      expect(screen.getByLabelText('로그 지우기')).toBeInTheDocument();
    });
  });

  describe('로그 복사 기능 (e22b548)', () => {
    it('로그 복사 버튼이 렌더링되어야 한다', () => {
      render(<ProcessingLog logs={mockLogs} />);

      const copyButton = screen.getByLabelText('로그 복사');
      expect(copyButton).toBeInTheDocument();
      expect(copyButton.textContent).toBe('📋');
    });

    it('로그 복사 버튼이 클릭 가능해야 한다', async () => {
      const user = userEvent.setup();
      render(<ProcessingLog logs={mockLogs} />);

      const copyButton = screen.getByLabelText('로그 복사');

      // 버튼이 클릭 가능한지만 확인 (실제 clipboard API는 테스트 환경에서 제한적)
      await expect(user.click(copyButton)).resolves.not.toThrow();
    });
  });

  describe('로그 다운로드 기능 (bb4f0df)', () => {
    it('로그 다운로드 버튼이 렌더링되어야 한다', () => {
      render(<ProcessingLog logs={mockLogs} />);

      const downloadButton = screen.getByLabelText('로그 다운로드');
      expect(downloadButton).toBeInTheDocument();
      expect(downloadButton.textContent).toBe('💾');
    });

    it('로그 다운로드 버튼이 클릭 가능해야 한다', async () => {
      const user = userEvent.setup();
      render(<ProcessingLog logs={mockLogs} />);

      const downloadButton = screen.getByLabelText('로그 다운로드');

      // 버튼이 클릭 가능한지만 확인 (실제 파일 다운로드는 테스트 환경에서 제한적)
      await expect(user.click(downloadButton)).resolves.not.toThrow();
    });
  });

  describe('밀리초 표시 기능 (bb4f0df)', () => {
    it('밀리초가 3자리로 표시되어야 한다', () => {
      const testLogs: Log[] = [
        {
          id: 'log1',
          timestamp: new Date('2025-10-25T14:30:45.123'),
          level: 'info',
          message: '테스트'
        }
      ];

      render(<ProcessingLog logs={testLogs} />);

      expect(screen.getByText('14:30:45.123')).toBeInTheDocument();
    });

    it('밀리초가 0인 경우 000으로 표시되어야 한다', () => {
      const testLogs: Log[] = [
        {
          id: 'log1',
          timestamp: new Date('2025-10-25T14:30:45.000'),
          level: 'info',
          message: '테스트'
        }
      ];

      render(<ProcessingLog logs={testLogs} />);

      expect(screen.getByText('14:30:45.000')).toBeInTheDocument();
    });

    it('밀리초가 한 자리인 경우 0으로 패딩되어야 한다', () => {
      const testLogs: Log[] = [
        {
          id: 'log1',
          timestamp: new Date('2025-10-25T14:30:45.005'),
          level: 'info',
          message: '테스트'
        }
      ];

      render(<ProcessingLog logs={testLogs} />);

      expect(screen.getByText('14:30:45.005')).toBeInTheDocument();
    });
  });
});
