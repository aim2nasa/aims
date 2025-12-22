import { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../src/stores/authStore';
import { colors, spacing, fontSize, borderRadius, fontWeight } from '../src/utils/theme';

export default function LoginScreen() {
  const { isAuthenticated, isLoading, error, devLogin, clearError } = useAuthStore();

  // 이미 로그인된 경우 메인 화면으로 이동
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(auth)/chat');
    }
  }, [isAuthenticated]);

  // 에러 표시
  useEffect(() => {
    if (error) {
      Alert.alert('로그인 실패', error, [
        { text: '확인', onPress: clearError }
      ]);
    }
  }, [error]);

  const handleDevLogin = async () => {
    const success = await devLogin();
    if (success) {
      router.replace('/(auth)/chat');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* 로고 영역 */}
        <View style={styles.logoContainer}>
          <View style={styles.logoIcon}>
            <Ionicons name="chatbubble-ellipses" size={48} color={colors.primary} />
          </View>
          <Text style={styles.title}>AIMS</Text>
          <Text style={styles.subtitle}>보험 설계사를 위한{'\n'}지능형 고객 관리 시스템</Text>
        </View>

        {/* 개발자 로그인 버튼 */}
        <View style={styles.form}>
          <Text style={styles.devModeText}>개발 모드</Text>
          <TouchableOpacity
            style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
            onPress={handleDevLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.loginButtonText}>개발자 로그인</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* 하단 정보 */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            AIMS Mobile v1.0.0
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logoIcon: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.xxxl,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  form: {
    gap: spacing.md,
    alignItems: 'center',
  },
  devModeText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  loginButton: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },
  footer: {
    position: 'absolute',
    bottom: spacing.xxl,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  footerText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
