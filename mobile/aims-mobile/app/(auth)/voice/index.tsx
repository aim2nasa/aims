import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius, fontWeight } from '../../../src/utils/theme';

export default function VoiceScreen() {
  const [isListening, setIsListening] = useState(false);
  const [recentQueries] = useState([
    '이번 달 생일 고객 알려줘',
    '만기 예정 계약 조회',
    '홍길동 고객 정보',
  ]);

  const handleMicPress = () => {
    setIsListening(!isListening);
    // TODO: 음성 인식 시작/중지
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>음성 어시스턴트</Text>
        <TouchableOpacity style={styles.settingsButton}>
          <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* 메인 콘텐츠 */}
      <View style={styles.content}>
        {/* 파형 시각화 영역 */}
        <View style={styles.waveformContainer}>
          <View style={[styles.waveformCircle, isListening && styles.waveformCircleActive]}>
            {isListening ? (
              <View style={styles.waveformBars}>
                {[0.3, 0.6, 1, 0.6, 0.3].map((height, index) => (
                  <View
                    key={index}
                    style={[
                      styles.waveformBar,
                      { height: 40 * height, opacity: 0.5 + height * 0.5 }
                    ]}
                  />
                ))}
              </View>
            ) : (
              <Ionicons name="mic" size={48} color={colors.primary} />
            )}
          </View>
          <Text style={styles.statusText}>
            {isListening ? '듣고 있습니다...' : '마이크를 눌러 말하세요'}
          </Text>
        </View>

        {/* 마이크 버튼 */}
        <TouchableOpacity
          style={[styles.micButton, isListening && styles.micButtonActive]}
          onPress={handleMicPress}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isListening ? 'stop' : 'mic'}
            size={32}
            color={colors.white}
          />
        </TouchableOpacity>
        <Text style={styles.micHint}>
          {isListening ? '누르면 중지' : '누르고 말하기'}
        </Text>

        {/* 최근 질문 */}
        <View style={styles.recentContainer}>
          <Text style={styles.recentTitle}>최근 질문</Text>
          {recentQueries.map((query, index) => (
            <TouchableOpacity key={index} style={styles.recentItem}>
              <Ionicons name="time-outline" size={16} color={colors.textMuted} />
              <Text style={styles.recentText}>{query}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
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
    alignItems: 'center',
    paddingTop: spacing.xxl,
  },
  waveformContainer: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
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
  micHint: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.xxl,
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
  },
});
