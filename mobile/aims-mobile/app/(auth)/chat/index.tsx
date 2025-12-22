import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius, fontWeight } from '../../../src/utils/theme';

// MCP 도구 카테고리 및 목록
const TOOL_CATEGORIES = [
  {
    name: '고객 관리',
    icon: 'people-outline' as const,
    tools: [
      { name: 'search_customers', label: '고객 검색', icon: 'search-outline' as const, example: '홍길동 고객 찾아줘' },
      { name: 'get_customer', label: '고객 상세', icon: 'person-outline' as const, example: '홍길동 고객 정보 보여줘' },
      { name: 'create_customer', label: '고객 등록', icon: 'person-add-outline' as const, example: '새 고객 김철수 등록해줘' },
      { name: 'update_customer', label: '정보 수정', icon: 'create-outline' as const, example: '홍길동 연락처 변경해줘' },
    ],
  },
  {
    name: '계약 관리',
    icon: 'document-text-outline' as const,
    tools: [
      { name: 'list_contracts', label: '계약 목록', icon: 'list-outline' as const, example: '홍길동 계약 목록 보여줘' },
      { name: 'get_contract_details', label: '계약 상세', icon: 'document-outline' as const, example: '홍길동 자동차보험 상세 보여줘' },
    ],
  },
  {
    name: '일정',
    icon: 'calendar-outline' as const,
    tools: [
      { name: 'find_birthday_customers', label: '생일 고객', icon: 'gift-outline' as const, example: '이번 달 생일 고객 알려줘' },
      { name: 'find_expiring_contracts', label: '만기 예정', icon: 'alarm-outline' as const, example: '30일 내 만기 예정 계약' },
    ],
  },
  {
    name: '문서',
    icon: 'folder-outline' as const,
    tools: [
      { name: 'search_documents', label: 'AI 검색', icon: 'search-circle-outline' as const, example: '암보험 관련 문서 찾아줘' },
      { name: 'get_document', label: '문서 상세', icon: 'document-attach-outline' as const, example: '이 문서 내용 요약해줘' },
      { name: 'list_customer_documents', label: '고객별 문서', icon: 'documents-outline' as const, example: '홍길동 문서 목록 보여줘' },
    ],
  },
  {
    name: '메모',
    icon: 'create-outline' as const,
    tools: [
      { name: 'add_customer_memo', label: '메모 추가', icon: 'add-circle-outline' as const, example: '홍길동에게 상담 메모 추가해줘' },
      { name: 'list_customer_memos', label: '메모 조회', icon: 'reader-outline' as const, example: '홍길동 메모 보여줘' },
      { name: 'delete_customer_memo', label: '메모 삭제', icon: 'trash-outline' as const, example: '홍길동 마지막 메모 삭제해줘' },
    ],
  },
  {
    name: '분석',
    icon: 'analytics-outline' as const,
    tools: [
      { name: 'get_statistics', label: '통계', icon: 'bar-chart-outline' as const, example: '전체 통계 보여줘' },
      { name: 'get_customer_network', label: '관계 조회', icon: 'git-network-outline' as const, example: '홍길동 가족 관계 보여줘' },
    ],
  },
  {
    name: '상품',
    icon: 'pricetag-outline' as const,
    tools: [
      { name: 'search_products', label: '상품 검색', icon: 'search-outline' as const, example: '암보험 상품 검색해줘' },
      { name: 'get_product_details', label: '상품 상세', icon: 'information-circle-outline' as const, example: '이 상품 상세 정보 보여줘' },
    ],
  },
];

export default function ChatScreen() {
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);

  const handleToolPress = (example: string) => {
    // TODO: 채팅 입력창에 예시 텍스트 입력
    console.log('Tool selected:', example);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="chatbubble-ellipses" size={24} color={colors.primary} />
          <Text style={styles.headerTitle}>AI 어시스턴트</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerButton}>
            <Ionicons name="time-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton}>
            <Ionicons name="add" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* 메인 콘텐츠 */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* 환영 메시지 */}
        <View style={styles.welcomeContainer}>
          <Text style={styles.welcomeTitle}>무엇이든 물어보세요!</Text>
          <Text style={styles.welcomeSubtitle}>
            고객, 계약, 문서 관련 질문을 자유롭게 하세요.
          </Text>
        </View>

        {/* 바로 채팅하기 버튼 */}
        <TouchableOpacity style={styles.directChatButton}>
          <View style={styles.directChatDot} />
          <View style={styles.directChatContent}>
            <Text style={styles.directChatTitle}>바로 채팅하기</Text>
            <Text style={styles.directChatSubtitle}>기능 목록 없이 바로 대화 시작</Text>
          </View>
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
                    <Ionicons name={tool.icon} size={20} color={colors.primary} />
                    <Text style={styles.toolLabel}>{tool.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {/* 입력창 */}
      <View style={styles.inputContainer}>
        <View style={styles.inputWrapper}>
          <TouchableOpacity style={styles.inputField}>
            <Text style={styles.inputPlaceholder}>메시지를 입력하세요...</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.voiceButton}>
            <Ionicons name="mic" size={22} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.sendButton}>
            <Ionicons name="arrow-up" size={20} color={colors.white} />
          </TouchableOpacity>
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
  inputContainer: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.xxl,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    height: 48,
    gap: spacing.xs,
  },
  inputField: {
    flex: 1,
    justifyContent: 'center',
  },
  inputPlaceholder: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  voiceButton: {
    padding: spacing.sm,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
