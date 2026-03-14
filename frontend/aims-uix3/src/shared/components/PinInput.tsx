/**
 * PIN 입력 컴포넌트
 * 숫자 4자리 입력 → dot 시각화 → 자동 검증
 * 설계서: docs/2026-03-14_LOGIN_UX_PROPOSAL.md Phase 2
 */

import { useRef, useState, useEffect, useCallback } from 'react';

interface PinInputProps {
  length?: number;
  onComplete: (pin: string) => void;
  error?: string | null;
  disabled?: boolean;
}

export default function PinInput({ length = 4, onComplete, error, disabled }: PinInputProps) {
  const [value, setValue] = useState('');
  const [shaking, setShaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 에러 발생 시 흔들림 + 초기화
  useEffect(() => {
    if (!error) return;
    setShaking(true);
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }
    const timer = setTimeout(() => {
      setShaking(false);
      setValue('');
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

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.replace(/\D/g, '').slice(0, length);
    setValue(newValue);
    if (newValue.length === length) {
      onComplete(newValue);
    }
  }, [length, onComplete]);

  const handleContainerClick = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      className={`pin-dots ${shaking ? 'pin-dots--shake' : ''}`}
      onClick={handleContainerClick}
      role="group"
      aria-label={`간편 비밀번호 입력, ${length}자리 중 ${value.length}자리 입력됨`}
    >
      {Array.from({ length }, (_, i) => (
        <div
          key={i}
          data-testid="pin-dot"
          // pin-dot--error: 에러 발생 직후 shake 애니메이션(400ms) 동안 value가 아직 남아있으므로
          // 이 시점에 error dot 색상이 표시됨. 400ms 후 setValue('')로 초기화되면 자동 해제.
          className={`pin-dot ${i < value.length ? 'pin-dot--filled' : ''} ${error && i < value.length ? 'pin-dot--error' : ''}`}
        />
      ))}
      <input
        ref={inputRef}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        value={value}
        onChange={handleChange}
        disabled={disabled}
        className="pin-hidden-input"
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
}
