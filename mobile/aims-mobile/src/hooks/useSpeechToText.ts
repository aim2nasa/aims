import { useState, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import { Platform } from 'react-native';
import { API_BASE_URL } from '../services/api';
import { useAuthStore } from '../stores';

interface UseSpeechToTextReturn {
  isRecording: boolean;
  isTranscribing: boolean;
  error: string | null;
  transcript: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  clearTranscript: () => void;
  clearError: () => void;
}

export function useSpeechToText(): UseSpeechToTextReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const { token } = useAuthStore();

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setTranscript(null);

      // 권한 요청
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        setError('마이크 권한이 필요합니다.');
        return;
      }

      // 오디오 모드 설정
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // 녹음 시작
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = recording;
      setIsRecording(true);
    } catch (err) {
      console.error('녹음 시작 실패:', err);
      setError('녹음을 시작할 수 없습니다.');
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (!recordingRef.current) {
      return null;
    }

    try {
      setIsRecording(false);
      setIsTranscribing(true);

      // 녹음 중지
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) {
        setError('녹음 파일을 찾을 수 없습니다.');
        setIsTranscribing(false);
        return null;
      }

      // 파일을 서버로 전송하여 변환
      const formData = new FormData();
      formData.append('file', {
        uri,
        type: Platform.OS === 'ios' ? 'audio/m4a' : 'audio/mp4',
        name: 'recording.m4a',
      } as unknown as Blob);

      const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || '음성 변환에 실패했습니다.');
      }

      const data = await response.json();
      const text = data.text || '';

      setTranscript(text);
      setIsTranscribing(false);

      return text;
    } catch (err) {
      console.error('녹음 중지/변환 실패:', err);
      setError(err instanceof Error ? err.message : '음성 변환에 실패했습니다.');
      setIsTranscribing(false);
      return null;
    }
  }, [token]);

  const clearTranscript = useCallback(() => {
    setTranscript(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isRecording,
    isTranscribing,
    error,
    transcript,
    startRecording,
    stopRecording,
    clearTranscript,
    clearError,
  };
}
