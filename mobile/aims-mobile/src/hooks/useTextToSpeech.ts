import { useState, useCallback } from 'react';
import * as Speech from 'expo-speech';

interface UseTextToSpeechOptions {
  language?: string;
  pitch?: number;
  rate?: number;
}

interface UseTextToSpeechReturn {
  isSpeaking: boolean;
  speak: (text: string) => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
}

export function useTextToSpeech(options: UseTextToSpeechOptions = {}): UseTextToSpeechReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const { language = 'ko-KR', pitch = 1.0, rate = 1.0 } = options;

  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;

    // 기존 음성 중지
    await Speech.stop();

    setIsSpeaking(true);

    return new Promise<void>((resolve) => {
      Speech.speak(text, {
        language,
        pitch,
        rate,
        onStart: () => {
          setIsSpeaking(true);
        },
        onDone: () => {
          setIsSpeaking(false);
          resolve();
        },
        onStopped: () => {
          setIsSpeaking(false);
          resolve();
        },
        onError: (error) => {
          console.error('TTS 오류:', error);
          setIsSpeaking(false);
          resolve();
        },
      });
    });
  }, [language, pitch, rate]);

  const stop = useCallback(() => {
    Speech.stop();
    setIsSpeaking(false);
  }, []);

  const pause = useCallback(() => {
    Speech.pause();
  }, []);

  const resume = useCallback(() => {
    Speech.resume();
  }, []);

  return {
    isSpeaking,
    speak,
    stop,
    pause,
    resume,
  };
}
