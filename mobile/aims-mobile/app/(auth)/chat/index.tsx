import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useChatSSE } from '../../../src/hooks/useChatSSE';
import { ChatBubble, ChatInput, ToolIndicator } from '../../../src/components/chat';
import { colors, spacing, fontSize, borderRadius, fontWeight } from '../../../src/utils/theme';

// MCP 도구 카테고리 및 목록 (18개) - 대화식 예시 (AI가 후속 질문)
const TOOL_CATEGORIES = [
  {
    name: '고객 관리',
    icon: 'people-outline' as const,
    tools: [
      { name: 'search_customers', label: '고객 검색', icon: 'search-outline' as const, example: '고객 찾아줘' },
      { name: 'get_customer', label: '고객 상세', icon: 'person-outline' as const, example: '고객 정보 알려줘' },
      { name: 'create_customer', label: '고객 등록', icon: 'person-add-outline' as const, example: '고객 등록해줘' },
      { name: 'update_customer', label: '정보 수정', icon: 'create-outline' as const, example: '연락처 수정해줘' },
    ],
  },
  {
    name: '계약 관리',
    icon: 'document-text-outline' as const,
    tools: [
      { name: 'list_contracts', label: '계약 목록', icon: 'list-outline' as const, example: '계약 목록 보여줘' },
      { name: 'get_contract_details', label: '계약 상세', icon: 'document-outline' as const, example: '계약 상세 보여줘' },
    ],
  },
  {
    name: '일정',
    icon: 'calendar-outline' as const,
    tools: [
      { name: 'find_birthday_customers', label: '생일 고객', icon: 'gift-outline' as const, example: '생일 고객 알려줘' },
      { name: 'find_expiring_contracts', label: '만기 예정', icon: 'alarm-outline' as const, example: '만기 예정 계약 알려줘' },
    ],
  },
  {
    name: '문서',
    icon: 'folder-outline' as const,
    tools: [
      { name: 'search_documents', label: 'AI 검색', icon: 'search-circle-outline' as const, example: '문서 검색해줘' },
      { name: 'get_document', label: '문서 상세', icon: 'document-attach-outline' as const, example: '문서 보여줘' },
      { name: 'list_customer_documents', label: '고객별 문서', icon: 'documents-outline' as const, example: '문서 목록 보여줘' },
    ],
  },
  {
    name: '메모',
    icon: 'create-outline' as const,
    tools: [
      { name: 'add_customer_memo', label: '메모 추가', icon: 'add-circle-outline' as const, example: '메모 추가해줘' },
      { name: 'list_customer_memos', label: '메모 조회', icon: 'reader-outline' as const, example: '메모 보여줘' },
      { name: 'delete_customer_memo', label: '메모 삭제', icon: 'trash-outline' as const, example: '메모 삭제해줘' },
    ],
  },
  {
    name: '분석',
    icon: 'analytics-outline' as const,
    tools: [
      { name: 'get_statistics', label: '통계', icon: 'bar-chart-outline' as const, example: '통계 보여줘' },
      { name: 'get_customer_network', label: '관계 조회', icon: 'git-network-outline' as const, example: '가족 관계 보여줘' },
    ],
  },
  {
    name: '상품',
    icon: 'pricetag-outline' as const,
    tools: [
      { name: 'search_products', label: '상품 검색', icon: 'search-outline' as const, example: '상품 검색해줘' },
      { name: 'get_product_details', label: '상품 상세', icon: 'information-circle-outline' as const, example: '상품 정보 보여줘' },
    ],
  },
];

export default function ChatScreen() {
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [showWelcome, setShowWelcome] = useState(true);
  const scrollViewRef = useRef<ScrollView>(null);

  const {
    messages,
    isStreaming,
    streamingContent,
    activeTools,
    currentTool,
    error,
    sendMessage,
    setMessages,
    setSessionId,
    abort,
    clearError,
  } = useChatSSE();

  // 에러 표시
  useEffect(() => {
    if (error) {
      Alert.alert('오류', error, [{ text: '확인', onPress: clearError }]);
    }
  }, [error]);

  // 메시지가 추가되면 스크롤
  useEffect(() => {
    if (messages.length > 0 || streamingContent) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, streamingContent]);

  // 키보드가 나타나면 스크롤
  useEffect(() => {
    const keyboardDidShow = Keyboard.addListener('keyboardDidShow', () => {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });

    return () => {
      keyboardDidShow.remove();
    };
  }, []);

  // 도구 예시 클릭
  const handleToolPress = (example: string) => {
    setShowWelcome(false);
    sendMessage(example);
  };

  // 바로 채팅하기
  const handleDirectChat = () => {
    setShowWelcome(false);
  };

  // 새 채팅
  const handleNewChat = () => {
    setMessages([]);
    setSessionId(null);
    setShowWelcome(true);
  };

  // 메시지 전송
  const handleSend = (content: string) => {
    if (showWelcome) {
      setShowWelcome(false);
    }
    sendMessage(content);
  };

  // 음성 버튼
  const handleVoice = () => {
    router.push('/(auth)/voice');
  };

  // 환영 화면 렌더링
  const renderWelcome = () => (
    <>
      {/* 환영 메시지 */}
      <View style={styles.welcomeContainer}>
        <View style={styles.welcomeIcon}>
          <Ionicons name="chatbubble-ellipses" size={48} color={colors.primary} />
        </View>
        <Text style={styles.welcomeTitle}>무엇이든 물어보세요!</Text>
        <Text style={styles.welcomeSubtitle}>
          고객, 계약, 문서 관련 질문을 자유롭게 하세요.
        </Text>
      </View>

      {/* 바로 채팅하기 버튼 */}
      <TouchableOpacity style={styles.directChatButton} onPress={handleDirectChat}>
        <View style={styles.directChatDot} />
        <View style={styles.directChatContent}>
          <Text style={styles.directChatTitle}>바로 채팅하기</Text>
          <Text style={styles.directChatSubtitle}>기능 목록 없이 바로 대화 시작</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </TouchableOpacity>

      {/* 구분선 */}
      <View style={styles.dividerContainer}>
        <View style={styles.divider} />
        <Text style={styles.dividerText}>또는 기능 선택</Text>
        <View style={styles.divider} />
      </View>

      {/* 기능 카테고리 */}
      {TOOL_CATEGORIES.map((category, categoryIndex) => (
        <View key={category.name} style={styles.categoryContainer}>
          <TouchableOpacity
            style={styles.categoryHeader}
            onPress={() => setSelectedCategory(
              selectedCategory === categoryIndex ? null : categoryIndex
            )}
          >
            <View style={styles.categoryLeft}>
              <Ionicons name={category.icon} size={18} color={colors.primary} />
              <Text style={styles.categoryName}>{category.name}</Text>
              <Text style={styles.categoryCount}>{category.tools.length}</Text>
            </View>
            <Ionicons
              name={selectedCategory === categoryIndex ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          {selectedCategory === categoryIndex && (
            <View style={styles.toolsGrid}>
              {category.tools.map((tool) => (
                <TouchableOpacity
                  key={tool.name}
                  style={styles.toolCard}
                  onPress={() => handleToolPress(tool.example)}
                >
                  <Ionicons name={tool.icon} size={18} color={colors.primary} />
                  <Text style={styles.toolLabel}>{tool.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      ))}
    </>
  );

  // 채팅 화면 렌더링
  const renderChat = () => (
    <>
      {messages.map((message, index) => (
        <ChatBubble key={index} message={message} />
      ))}

      {/* 스트리밍 중인 응답 */}
      {isStreaming && streamingContent && (
        <ChatBubble
          message={{ role: 'assistant', content: streamingContent }}
          isStreaming
        />
      )}

      {/* 도구 사용 표시 */}
      {activeTools.length > 0 && (
        <ToolIndicator tools={activeTools} currentTool={currentTool} />
      )}
    </>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* 헤더 */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="chatbubble-ellipses" size={24} color={colors.primary} />
            <Text style={styles.headerTitle}>AI 어시스턴트</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.headerButton} onPress={() => {}}>
              <Ionicons name="time-outline" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerButton} onPress={handleNewChat}>
              <Ionicons name="add" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 메인 콘텐츠 */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {showWelcome && messages.length === 0 ? renderWelcome() : renderChat()}
        </ScrollView>

        {/* 입력창 */}
        <ChatInput
          onSend={handleSend}
          onVoice={handleVoice}
          isLoading={isStreaming}
          disabled={isStreaming}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardAvoid: {
    flex: 1,
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  headerRight: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  headerButton: {
    padding: spacing.xs,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  welcomeContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    marginTop: spacing.lg,
  },
  welcomeIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  welcomeTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  welcomeSubtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  directChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  directChatDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
    marginRight: spacing.md,
  },
  directChatContent: {
    flex: 1,
  },
  directChatTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  directChatSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
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
  categoryContainer: {
    marginBottom: spacing.sm,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  categoryName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
  categoryCount: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  toolCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  toolLabel: {
    fontSize: fontSize.sm,
    color: colors.text,
  },
});
