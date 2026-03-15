/**
 * PIN 입력 컴포넌트
 * 숫자 4자리 입력 → dot 시각화 → 자동 검증
 * 설계서: docs/2026-03-14_LOGIN_UX_PROPOSAL.md Phase 2
 *
 * Android 삼성 브라우저 호환: hidden input의 커서 위치 버그로
 * onChange가 아닌 onKeyDown으로 값을 직접 조립 (prepend 방지)
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
  const valueRef = useRef('');

  // valueRef 동기화 (onKeyDown에서 최신 값 참조)
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

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

  // onKeyDown: 키 입력을 직접 캡처하여 값 조립 (Android prepend 버그 방지)
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    const current = valueRef.current;

    if (e.key >= '0' && e.key <= '9') {
      if (current.length >= length) return;
      e.preventDefault();
      const newValue = current + e.key;
      setValue(newValue);
      if (newValue.length === length) {
        onComplete(newValue);
      }
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      setValue(current.slice(0, -1));
    } else if (e.key === 'Delete' || e.key === 'Enter' || e.key === 'Tab') {
      // 허용
    } else {
      e.preventDefault();
    }
  }, [length, onComplete]);

  // onChange: Android에서 onKeyDown이 key="Unidentified"로 올 경우 fallback
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    const current = valueRef.current;

    // onKeyDown에서 이미 처리된 경우 무시 (값이 동일)
    if (raw === current) return;

    // Android fallback: 새로 추가된 문자를 찾아서 append
    if (raw.length === current.length + 1) {
      // 새 문자 = raw에서 current에 없는 것
      let newChar = '';
      for (let i = 0; i < raw.length; i++) {
        const before = current.slice(0, i) + current.slice(i + 1);
        if (raw.length - 1 === before.length) {
          // raw[i]가 새로 추가된 문자일 수 있음
          const remaining = raw.slice(0, i) + raw.slice(i + 1);
          if (remaining === current) {
            newChar = raw[i];
            break;
          }
        }
      }
      // 찾지 못하면 마지막 문자 사용
      if (!newChar) newChar = raw[raw.length - 1];

      const newValue = (current + newChar).slice(0, length);
      setValue(newValue);
      if (newValue.length === length) {
        onComplete(newValue);
      }
    } else if (raw.length < current.length) {
      // 삭제
      setValue(raw.slice(0, length));
    } else {
      // 기타: 그대로 사용 (paste 등)
      const newValue = raw.slice(0, length);
      setValue(newValue);
      if (newValue.length === length) {
        onComplete(newValue);
      }
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
          className={`pin-dot ${i < value.length ? 'pin-dot--filled' : ''} ${error && i < value.length ? 'pin-dot--error' : ''} ${i === value.length && !error ? 'pin-dot--next' : ''}`}
        />
      ))}
      <input
        ref={inputRef}
        type="tel"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        value={value}
        onKeyDown={handleKeyDown}
        onChange={handleChange}
        disabled={disabled}
        className="pin-hidden-input"
        tabIndex={0}
        aria-label="간편 비밀번호 입력"
      />
    </div>
  );
}
