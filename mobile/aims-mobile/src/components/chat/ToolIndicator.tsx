import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius, fontWeight } from '../../utils/theme';

// MCP 도구 이름 -> 한글 변환 맵
const TOOL_NAMES: Record<string, string> = {
  search_customers: '고객 검색',
  get_customer: '고객 조회',
  create_customer: '고객 등록',
  update_customer: '고객 수정',
  list_contracts: '계약 목록',
  get_contract_details: '계약 상세',
  find_birthday_customers: '생일 고객',
  find_expiring_contracts: '만기 계약',
  search_documents: '문서 검색',
  get_document: '문서 조회',
  list_customer_documents: '고객 문서',
  add_customer_memo: '메모 추가',
  list_customer_memos: '메모 조회',
  delete_customer_memo: '메모 삭제',
  get_statistics: '통계 조회',
  get_customer_network: '관계 조회',
  search_products: '상품 검색',
  get_product_details: '상품 상세',
};

interface ToolIndicatorProps {
  tools: string[];
  currentTool?: string | null;
}

export function ToolIndicator({ tools, currentTool }: ToolIndicatorProps) {
  if (tools.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="construct" size={14} color={colors.primary} />
        <Text style={styles.headerText}>도구 사용 중</Text>
      </View>
      <View style={styles.toolList}>
        {tools.map((tool) => {
          const isActive = tool === currentTool;
          const displayName = TOOL_NAMES[tool] || tool;

          return (
            <View
              key={tool}
              style={[styles.toolItem, isActive && styles.toolItemActive]}
            >
              {isActive ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
              )}
              <Text style={[styles.toolName, isActive && styles.toolNameActive]}>
                {displayName}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginVertical: spacing.sm,
    marginHorizontal: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  headerText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  toolList: {
    gap: spacing.xs,
  },
  toolItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  toolItemActive: {
    opacity: 1,
  },
  toolName: {
    fontSize: fontSize.sm,
    color: colors.text,
  },
  toolNameActive: {
    color: colors.primary,
    fontWeight: fontWeight.medium,
  },
});
