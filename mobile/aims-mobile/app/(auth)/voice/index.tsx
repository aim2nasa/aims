import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSpeechToText, useTextToSpeech, useChatSSE } from '../../../src/hooks';
import { colors, spacing, fontSize, borderRadius, fontWeight } from '../../../src/utils/theme';

export default function VoiceScreen() {
  const [recentQueries, setRecentQueries] = useState<string[]>([
    '이번 달 생일 고객 알려줘',
    '만기 예정 계약 조회',
    '홍길동 고객 정보',
  ]);
  const [lastResponse, setLastResponse] = useState<string | null>(null);

  // 파형 애니메이션
  const waveAnims = useRef([
    new Animated.Value(0.3),
    new Animated.Value(0.6),
    new Animated.Value(1),
    new Animated.Value(0.6),
    new Animated.Value(0.3),
  ]).current;

  // STT 훅
  const {
    isRecording,
    isTranscribing,
    error: sttError,
    transcript,
    startRecording,
    stopRecording,
    clearError: clearSttError,
  } = useSpeechToText();

  // TTS 훅
  const { isSpeaking, speak, stop: stopSpeaking } = useTextToSpeech();

  // 채팅 SSE 훅
  const {
    messages,
    isStreaming,
    streamingContent,
    error: chatError,
    sendMessage,
    clearError: clearChatError,
  } = useChatSSE();

  // 파형 애니메이션 효과
  useEffect(() => {
    if (isRecording) {
      const animations = waveAnims.map((anim, index) => {
        return Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue: 1,
              duration: 300 + index * 100,
              useNativeDriver: false,
            }),
            Animated.timing(anim, {
              toValue: 0.3,
              duration: 300 + index * 100,
              useNativeDriver: false,
            }),
          ])
        );
      });
      Animated.parallel(animations).start();
    } else {
      waveAnims.forEach((anim, index) => {
        anim.setValue([0.3, 0.6, 1, 0.6, 0.3][index]);
      });
    }
  }, [isRecording]);

  // STT 에러 표시
  useEffect(() => {
    if (sttError) {
      Alert.alert('음성 인식 오류', sttError, [{ text: '확인', onPress: clearSttError }]);
    }
  }, [sttError]);

  // 채팅 에러 표시
  useEffect(() => {
    if (chatError) {
      Alert.alert('응답 오류', chatError, [{ text: '확인', onPress: clearChatError }]);
    }
  }, [chatError]);

  // 변환된 텍스트로 채팅 전송
  useEffect(() => {
    if (transcript) {
      // 최근 질문 목록에 추가
      setRecentQueries((prev) => {
        const newQueries = [transcript, ...prev.filter((q) => q !== transcript)].slice(0, 5);
        return newQueries;
      });

      // 채팅 전송
      sendMessage(transcript);
    }
  }, [transcript]);

  // AI 응답 완료 시 TTS로 읽기
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant' && lastMessage.content !== lastResponse) {
        setLastResponse(lastMessage.content);
        // AI 응답 읽기 (스트리밍 완료 후)
        if (!isStreaming) {
          speak(lastMessage.content);
        }
      }
    }
  }, [messages, isStreaming]);

  // 마이크 버튼 핸들러
  const handleMicPress = async () => {
    if (isRecording) {
      // 녹음 중지 및 변환
      await stopRecording();
    } else {
      // TTS 중지 (녹음 시작 전)
      if (isSpeaking) {
        stopSpeaking();
      }
      // 녹음 시작
      await startRecording();
    }
  };

  // 최근 질문 선택
  const handleRecentQuery = (query: string) => {
    if (isSpeaking) {
      stopSpeaking();
    }
    sendMessage(query);
  };

  // 채팅 화면으로 이동
  const goToChat = () => {
    router.replace('/(auth)/chat');
  };

  // 상태 텍스트
  const getStatusText = () => {
    if (isRecording) return '듣고 있습니다...';
    if (isTranscribing) return '변환 중...';
    if (isStreaming) return '응답 중...';
    if (isSpeaking) return '읽는 중...';
    return '마이크를 눌러 말하세요';
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={goToChat} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>음성 어시스턴트</Text>
        <TouchableOpacity style={styles.settingsButton}>
          <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* 메인 콘텐츠 */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* 파형 시각화 영역 */}
        <View style={styles.waveformContainer}>
          <View style={[styles.waveformCircle, (isRecording || isStreaming || isSpeaking) && styles.waveformCircleActive]}>
            {isRecording ? (
              <View style={styles.waveformBars}>
                {waveAnims.map((anim, index) => (
                  <Animated.View
                    key={index}
                    style={[
                      styles.waveformBar,
                      {
                        height: anim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [15, 50],
                        }),
                      },
                    ]}
                  />
                ))}
              </View>
            ) : isTranscribing || isStreaming ? (
              <Ionicons name="hourglass" size={48} color={colors.primary} />
            ) : isSpeaking ? (
              <Ionicons name="volume-high" size={48} color={colors.primary} />
            ) : (
              <Ionicons name="mic" size={48} color={colors.primary} />
            )}
          </View>
          <Text style={styles.statusText}>{getStatusText()}</Text>
        </View>

        {/* 변환된 텍스트 표시 */}
        {transcript && (
          <View style={styles.transcriptContainer}>
            <Text style={styles.transcriptLabel}>인식된 텍스트:</Text>
            <Text style={styles.transcriptText}>{transcript}</Text>
          </View>
        )}

        {/* 스트리밍 응답 표시 */}
        {(streamingContent || (messages.length > 0 && messages[messages.length - 1].role === 'assistant')) && (
          <View style={styles.responseContainer}>
            <Text style={styles.responseLabel}>AI 응답:</Text>
            <Text style={styles.responseText}>
              {streamingContent || messages[messages.length - 1]?.content || ''}
            </Text>
          </View>
        )}

        {/* 마이크 버튼 */}
        <TouchableOpacity
          style={[
            styles.micButton,
            isRecording && styles.micButtonActive,
            (isTranscribing || isStreaming) && styles.micButtonDisabled,
          ]}
          onPress={handleMicPress}
          activeOpacity={0.8}
          disabled={isTranscribing || isStreaming}
        >
          <Ionicons
            name={isRecording ? 'stop' : 'mic'}
            size={32}
            color={colors.white}
          />
        </TouchableOpacity>
        <Text style={styles.micHint}>
          {isRecording ? '누르면 중지' : '누르고 말하기'}
        </Text>

        {/* TTS 중지 버튼 */}
        {isSpeaking && (
          <TouchableOpacity style={styles.stopTtsButton} onPress={stopSpeaking}>
            <Ionicons name="volume-mute" size={20} color={colors.white} />
            <Text style={styles.stopTtsText}>읽기 중지</Text>
          </TouchableOpacity>
        )}

        {/* 최근 질문 */}
        <View style={styles.recentContainer}>
          <Text style={styles.recentTitle}>최근 질문</Text>
          {recentQueries.map((query, index) => (
            <TouchableOpacity
              key={index}
              style={styles.recentItem}
              onPress={() => handleRecentQuery(query)}
            >
              <Ionicons name="time-outline" size={16} color={colors.textMuted} />
              <Text style={styles.recentText}>{query}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  settingsButton: {
    padding: spacing.xs,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  waveformContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  waveformCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  waveformCircleActive: {
    backgroundColor: colors.backgroundTertiary,
  },
  waveformBars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  waveformBar: {
    width: 6,
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  statusText: {
    fontSize: fontSize.lg,
    color: colors.textSecondary,
  },
  transcriptContainer: {
    width: '90%',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  transcriptLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  transcriptText: {
    fontSize: fontSize.md,
    color: colors.text,
  },
  responseContainer: {
    width: '90%',
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    maxHeight: 200,
  },
  responseLabel: {
    fontSize: fontSize.sm,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  responseText: {
    fontSize: fontSize.md,
    color: colors.text,
    lineHeight: 22,
  },
  micButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  micButtonActive: {
    backgroundColor: colors.error,
  },
  micButtonDisabled: {
    backgroundColor: colors.textMuted,
  },
  micHint: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  stopTtsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.warning,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    marginBottom: spacing.lg,
  },
  stopTtsText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.white,
  },
  recentContainer: {
    width: '100%',
    paddingHorizontal: spacing.lg,
  },
  recentTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  recentText: {
    fontSize: fontSize.md,
    color: colors.text,
    flex: 1,
  },
});
