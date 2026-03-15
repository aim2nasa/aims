/**
 * PIN 입력 컴포넌트
 * 숫자 4자리 입력 → dot 시각화 → 자동 검증
 * 설계서: docs/2026-03-14_LOGIN_UX_PROPOSAL.md Phase 2
 *
 * Android 호환: hidden input 커서 위치 버그로 입력 순서가 뒤집히는 문제 해결
 * → onInput의 InputEvent.data로 새로 입력된 문자를 직접 캡처하여 append
 */

import { useRef, useState, useEffect, useCallback } from 'react';

interface PinInputProps {
  length?: number;
  onComplete: (pin: string) => void;
  error?: string | null;
  disabled?: boolean;
}

export default function PinInput({ length = 4, onComplete, error, disabled }: PinInputProps) {
  const [digits, setDigits] = useState<string[]>([]);
  const [shaking, setShaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const digitsRef = useRef<string[]>([]);

  useEffect(() => {
    digitsRef.current = digits;
  }, [digits]);

  // 에러 발생 시 흔들림 + 초기화
  useEffect(() => {
    if (!error) return;
    setShaking(true);
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }
    const timer = setTimeout(() => {
      setShaking(false);
      setDigits([]);
      // input value도 초기화
      if (inputRef.current) inputRef.current.value = '';
      inputRef.current?.focus();
    }, 400);
    return () => clearTimeout(timer);
  }, [error]);

  // 자동 포커스
  useEffect(() => {
    if (!disabled) {
      inputRef.current?.focus();
    }
  }, [disabled]);

  // onInput: InputEvent.data에 새로 입력된 문자가 담김 (Android/iOS/PC 모두 동작)
  const handleInput = useCallback((e: React.FormEvent<HTMLInputElement>) => {
    const inputEvent = e.nativeEvent as InputEvent;
    const current = digitsRef.current;

    if (inputEvent.inputType === 'deleteContentBackward' || inputEvent.inputType === 'deleteContentForward') {
      // 삭제
      const newDigits = current.slice(0, -1);
      setDigits(newDigits);
      if (inputRef.current) inputRef.current.value = newDigits.join('');
      return;
    }

    // 새로 입력된 문자
    const data = inputEvent.data;
    if (!data) return;

    // 숫자만 필터
    const numChars = data.replace(/\D/g, '').split('');
    if (numChars.length === 0) {
      // 숫자가 아닌 입력 → input value를 현재 digits로 되돌림
      if (inputRef.current) inputRef.current.value = current.join('');
      return;
    }

    // 현재 digits에 새 숫자 append
    const newDigits = [...current, ...numChars].slice(0, length);
    setDigits(newDigits);

    // input의 실제 value를 우리가 관리하는 값으로 강제 동기화
    if (inputRef.current) inputRef.current.value = newDigits.join('');

    if (newDigits.length === length) {
      onComplete(newDigits.join(''));
    }
  }, [length, onComplete]);

  // onChange는 빈 핸들러 (React 경고 방지, 실제 로직은 onInput에서 처리)
  const handleChange = useCallback(() => {
    // noop — onInput에서 모든 로직 처리
  }, []);

  const handleContainerClick = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  // 키보드 백스페이스 처리 (일부 브라우저에서 onInput에 deleteContentBackward 안 오는 경우)
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const newDigits = digitsRef.current.slice(0, -1);
      setDigits(newDigits);
      if (inputRef.current) inputRef.current.value = newDigits.join('');
    }
  }, []);

  const filledCount = digits.length;

  return (
    <div
      className={`pin-dots ${shaking ? 'pin-dots--shake' : ''}`}
      onClick={handleContainerClick}
      role="group"
      aria-label={`간편 비밀번호 입력, ${length}자리 중 ${filledCount}자리 입력됨`}
    >
      {Array.from({ length }, (_, i) => (
        <div
          key={i}
          data-testid="pin-dot"
          className={`pin-dot ${i < filledCount ? 'pin-dot--filled' : ''} ${error && i < filledCount ? 'pin-dot--error' : ''} ${i === filledCount && !error ? 'pin-dot--next' : ''}`}
        />
      ))}
      <input
        ref={inputRef}
        type="tel"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        defaultValue=""
        onInput={handleInput}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className="pin-hidden-input"
        tabIndex={0}
        aria-label="간편 비밀번호 입력"
      />
    </div>
  );
}
