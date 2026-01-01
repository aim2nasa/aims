import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../src/stores/authStore';
import { useKakaoAuth } from '../src/hooks/useKakaoAuth';
import { colors, spacing, fontSize, borderRadius, fontWeight } from '../src/utils/theme';

export default function LoginScreen() {
  const { isAuthenticated, isLoading: isDevLoading, error: devError, devLogin, clearError, setAuth } = useAuthStore();
  const [showDevLogin, setShowDevLogin] = useState(false);

  // 카카오 로그인 훅
  const { isLoading: isKakaoLoading, error: kakaoError, login: kakaoLogin, clearError: clearKakaoError } = useKakaoAuth(
    (token, user) => {
      // 로그인 성공 시 auth store 업데이트
      setAuth(token, user);
      router.replace('/(auth)/chat');
    }
  );

  const isLoading = isDevLoading || isKakaoLoading;
  const error = devError || kakaoError;

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
        { text: '확인', onPress: () => {
          clearError();
          clearKakaoError();
        }}
      ]);
    }
  }, [error]);

  const handleKakaoLogin = async () => {
    await kakaoLogin();
  };

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

        {/* 로그인 버튼들 */}
        <View style={styles.form}>
          {/* 카카오 로그인 버튼 */}
          <TouchableOpacity
            testID="kakao-login-button"
            style={[styles.kakaoButton, isLoading && styles.buttonDisabled]}
            onPress={handleKakaoLogin}
            disabled={isLoading}
          >
            {isKakaoLoading ? (
              <ActivityIndicator color="#000000" />
            ) : (
              <>
                <View style={styles.kakaoIconContainer}>
                  <Text style={styles.kakaoIcon}>💬</Text>
                </View>
                <Text style={styles.kakaoButtonText}>카카오 로그인</Text>
              </>
            )}
          </TouchableOpacity>

          {/* 구분선 */}
          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>또는</Text>
            <View style={styles.divider} />
          </View>

          {/* 개발 모드 토글 */}
          {!showDevLogin ? (
            <TouchableOpacity
              testID="dev-mode-toggle"
              style={styles.devModeToggle}
              onPress={() => setShowDevLogin(true)}
            >
              <Ionicons name="code-slash-outline" size={16} color={colors.textMuted} />
              <Text style={styles.devModeToggleText}>개발자 모드</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              testID="dev-login-button"
              style={[styles.devButton, isLoading && styles.buttonDisabled]}
              onPress={handleDevLogin}
              disabled={isLoading}
            >
              {isDevLoading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Ionicons name="code-slash" size={20} color={colors.white} />
                  <Text style={styles.devButtonText}>개발자 로그인</Text>
                </>
              )}
            </TouchableOpacity>
          )}
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
  // 카카오 버튼 스타일
  kakaoButton: {
    width: '100%',
    backgroundColor: '#FEE500',
    borderRadius: borderRadius.lg,
    height: 52,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  kakaoIconContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kakaoIcon: {
    fontSize: 18,
  },
  kakaoButtonText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: '#000000',
  },
  // 구분선
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: spacing.md,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginHorizontal: spacing.md,
  },
  // 개발자 모드 토글
  devModeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  devModeToggleText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  // 개발자 로그인 버튼
  devButton: {
    width: '100%',
    backgroundColor: colors.textSecondary,
    borderRadius: borderRadius.lg,
    height: 48,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  devButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.white,
  },
  buttonDisabled: {
    opacity: 0.6,
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
