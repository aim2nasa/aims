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
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useChatSSE } from '../../../src/hooks/useChatSSE';
import { ChatBubble, ChatInput, AttachedFile } from '../../../src/components/chat';
import { api, getCustomerFileHashes, filterDuplicateFiles } from '../../../src/services/api';
import { colors, spacing, fontSize, borderRadius, fontWeight } from '../../../src/utils/theme';

// 도움말 기능 목록 (MCP 도구 100% 커버리지) - aims-uix3 동기화
const HELP_FEATURES = [
  // 고객 관리
  {
    icon: '🔍', title: '고객 조회', desc: '고객 검색 및 상세 정보 조회',
    examples: [
      '최근 등록한 고객 보여줘',
      '김씨 성을 가진 고객 찾아줘',
      '서울 지역 고객 목록 보여줘',
      '법인 고객 목록 보여줘',
      '휴면 고객 목록 조회해줘',
      '고객 상세 정보 알려줘',
    ]
  },
  {
    icon: '➕', title: '고객 등록', desc: '새 고객 추가',
    examples: [
      '새 고객 등록해줘',
      '법인 고객 등록해줘',
      '개인 고객 등록해줘',
    ]
  },
  {
    icon: '📁', title: '고객별 문서', desc: '특정 고객의 문서 목록',
    examples: [
      '고객 문서 등록해줘',
      '고객 문서 목록 보여줘',
      '고객 최근 업로드 문서 보여줘',
    ]
  },
  {
    icon: '✏️', title: '고객 수정', desc: '고객 연락처, 주소 등 수정',
    examples: [
      '고객 전화번호 수정해줘',
      '고객 이메일 수정해줘',
      '고객 주소 변경해줘',
    ]
  },
  // 계약 관리
  {
    icon: '📄', title: '계약 조회', desc: '목록, 상세, 피보험자 조회',
    examples: [
      '전체 계약 목록 보여줘',
      '고객 계약 현황 알려줘',
      '종신보험 계약만 보여줘',
      '계약 상세 정보 보여줘',
    ]
  },
  // 생일
  {
    icon: '🎂', title: '생일 고객', desc: '특정 월/일의 생일 고객 조회',
    examples: [
      '이번 달 생일 고객 알려줘',
      '오늘 생일인 고객 있어?',
      '다음 주 생일인 고객 보여줘',
    ]
  },
  // 문서 검색
  {
    icon: '🔎', title: '문서 검색', desc: '키워드 + AI 의미 통합 검색',
    examples: [
      '퇴직연금 관련 서류 찾아줘',
      '자동차보험 문서 검색해줘',
      '청구서 관련 문서 찾아줘',
    ]
  },
  // 메모
  {
    icon: '📝', title: '고객 메모', desc: '메모 추가 및 조회',
    examples: [
      '고객 메모 추가해줘',
      '고객 메모 보여줘',
      '메모 삭제해줘',
    ]
  },
  // 관계
  {
    icon: '🔗', title: '고객 관계', desc: '관계 조회 및 등록',
    examples: [
      '고객 관계 보여줘',
      '가족관계 조회해줘',
      '관계 등록해줘',
    ]
  },
];

export default function ChatScreen() {
  const [showWelcome, setShowWelcome] = useState(true);
  // 각 기능별 현재 예시 인덱스 (페이지네이션용)
  const [exampleIndices, setExampleIndices] = useState<number[]>(
    () => HELP_FEATURES.map(() => 0)
  );
  const scrollViewRef = useRef<ScrollView>(null);

  const {
    messages,
    isStreaming,
    streamingContent,
    error,
    sendMessage,
    setMessages,
    setSessionId,
    clearError,
  } = useChatSSE();

  // 에러 표시
  useEffect(() => {
    if (error) {
      Alert.alert('오류', error, [{ text: '확인', onPress: clearError }]);
    }
  }, [error]);

  // 콘텐츠 크기 변경 시 스크롤
  const handleContentSizeChange = () => {
    if (messages.length > 0 || streamingContent) {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }
  };

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

  // 예시 클릭 - 메시지 전송
  const handleExamplePress = (example: string) => {
    setShowWelcome(false);
    sendMessage(example);
  };

  // 예시 넘기기 (페이지네이션)
  const handleNextExample = (featureIdx: number) => {
    setExampleIndices(prev => {
      const newIndices = [...prev];
      const feature = HELP_FEATURES[featureIdx];
      newIndices[featureIdx] = (newIndices[featureIdx] + 1) % feature.examples.length;
      return newIndices;
    });
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

  // 파일 업로드 상태
  const [isUploading, setIsUploading] = useState(false);
  // 대기 중인 파일 (고객명 입력 대기)
  const [pendingFiles, setPendingFiles] = useState<AttachedFile[]>([]);
  // 고객명 입력 실패 횟수 (3번 실패 시 취소)
  const [customerSearchAttempts, setCustomerSearchAttempts] = useState(0);
  const MAX_SEARCH_ATTEMPTS = 3;

  // 최근 메시지에서 고객명 자동 추출
  // 사용자 메시지에서 "XXX 고객에게 문서 등록" 패턴 추출
  const extractCustomerFromMessages = async (): Promise<{
    customer: { id: string; name: string } | null;
    extractedName: string | null;
  }> => {
    // 1. 사용자 메시지에서 고객명 추출 (최근 메시지부터)
    const userMsgs = [...messages].reverse().filter(m => m.role === 'user');
    for (const msg of userMsgs) {
      // "XXX 고객에게 문서", "XXX에게 문서", "XXX 문서 등록" 등의 패턴
      const patterns = [
        /([가-힣a-zA-Z0-9]{2,20})\s*(고객에게|에게)\s*(문서|파일)/,
        /([가-힣a-zA-Z0-9]{2,20})\s*(문서|파일)\s*(등록|업로드)/,
      ];
      for (const pattern of patterns) {
        const match = msg.content.match(pattern);
        if (match) {
          const customerName = match[1];
          console.log('[Chat] 사용자 메시지에서 고객명 추출:', customerName);
          const customer = await api.findCustomerByName(customerName);
          return { customer, extractedName: customerName };
        }
      }
    }
    return { customer: null, extractedName: null };
  };

  // 파일 업로드 실행 (중복 파일 필터링 포함 - aims-uix3 동일)
  const uploadFilesToCustomer = async (files: AttachedFile[], customer: { id: string; name: string }) => {
    setIsUploading(true);
    try {
      // 🔥 1. 고객의 기존 문서 해시 조회
      console.log('[Chat] 중복 검사 시작:', customer.name);
      const existingHashes = await getCustomerFileHashes(customer.id);
      console.log('[Chat] 기존 문서 수:', existingHashes.length);

      // 🔥 2. 중복 파일 필터링
      const { duplicates, nonDuplicates } = await filterDuplicateFiles(
        files.map(f => ({ uri: f.uri, name: f.name, mimeType: f.mimeType })),
        existingHashes
      );

      console.log('[Chat] 중복 파일:', duplicates);
      console.log('[Chat] 신규 파일:', nonDuplicates.map(f => f.name));

      // 🔥 3. 모두 중복인 경우
      if (nonDuplicates.length === 0) {
        const duplicateList = duplicates.join(', ');
        setMessages(prev => [...prev, {
          role: 'assistant' as const,
          content: `⚠️ **${customer.name}** 고객에게 이미 등록된 파일입니다.\n\n중복 파일: ${duplicateList}`
        }]);
        return;
      }

      // 🔥 4. 중복 아닌 파일만 업로드
      const uploadResults = await Promise.all(
        nonDuplicates.map(file => api.uploadDocument(
          { uri: file.uri, name: file.name, mimeType: file.mimeType },
          customer.id
        ))
      );

      const successFiles = uploadResults.filter(r => r.success);
      const failedFiles = uploadResults.filter(r => !r.success);

      if (successFiles.length === 0) {
        // 업로드 실패 메시지
        setMessages(prev => [...prev, {
          role: 'assistant' as const,
          content: `❌ 파일 업로드에 실패했습니다.\n\n다시 시도해주세요.`
        }]);
        return;
      }

      // 🔥 5. 성공 메시지 (중복 파일 정보 포함)
      const uploadedNames = nonDuplicates.map(f => f.name).join(', ');
      let successContent = `✅ **${customer.name}** 고객에게 문서가 업로드되었습니다.\n\n📎 ${uploadedNames}`;

      if (duplicates.length > 0) {
        successContent += `\n\n⚠️ 중복 제외: ${duplicates.join(', ')}`;
      }
      if (failedFiles.length > 0) {
        successContent += `\n\n❌ 업로드 실패: ${failedFiles.length}개`;
      }
      setMessages(prev => [...prev, {
        role: 'assistant' as const,
        content: successContent
      }]);
    } catch (error) {
      console.error('[Chat] 파일 업로드 오류:', error);
      setMessages(prev => [...prev, {
        role: 'assistant' as const,
        content: `❌ 파일 업로드 중 오류가 발생했습니다.`
      }]);
    } finally {
      setIsUploading(false);
      setPendingFiles([]);
    }
  };

  // 🔥 파일 선택 즉시 업로드 시작 (aims-uix3 동일 - handleFileSelect)
  const handleFilesSelected = async (files: AttachedFile[]) => {
    if (showWelcome) {
      setShowWelcome(false);
    }

    const fileNames = files.map(f => f.name).join(', ');
    console.log('[Chat] 🚀 파일 선택 즉시 업로드 시작:', fileNames);

    // 먼저 최근 메시지에서 고객 자동 추출 시도
    const { customer, extractedName } = await extractCustomerFromMessages();
    if (customer) {
      // AI 응답에서 고객명 추출 성공 + 고객 검색도 성공
      console.log('[Chat] 자동 추출된 고객:', customer.name);
      await uploadFilesToCustomer(files, customer);
      return;
    }

    if (extractedName) {
      // AI 응답에서 고객명은 추출했지만 검색 실패
      console.log('[Chat] AI가 언급한 고객을 찾을 수 없음:', extractedName);
      setPendingFiles(files);
      setMessages(prev => [...prev, {
        role: 'assistant' as const,
        content: `📎 **첨부 파일:** ${fileNames}\n\n❌ **"${extractedName}"** 고객을 찾을 수 없습니다.\n\n정확한 고객명을 입력해주세요. (${MAX_SEARCH_ATTEMPTS}회 남음)`
      }]);
      return;
    }

    // AI 응답에 고객명 패턴 없음 - 파일 대기 상태로 전환하고 질문
    console.log('[Chat] AI 응답에 고객명 없음, 파일 대기 상태로 전환');
    setPendingFiles(files);
    setMessages(prev => [...prev, {
      role: 'assistant' as const,
      content: `📎 **첨부 파일:** ${fileNames}\n\n어떤 고객에게 업로드할까요? 고객명을 입력해주세요.\n\n예: "홍길동", "라이콘코리아"`
    }]);
  };

  // 메시지 전송 - aims-uix3 동일 로직
  const handleSend = async (content: string) => {
    if (showWelcome) {
      setShowWelcome(false);
    }

    // 🔥 Case 1: 대기 중인 파일이 있고 사용자가 고객명 입력
    if (pendingFiles.length > 0 && content.trim()) {
      const customerName = content.trim();
      console.log('[Chat] 대기 파일 있음, 고객명 검색:', customerName, '시도:', customerSearchAttempts + 1);

      // 사용자 메시지 표시
      setMessages(prev => [...prev, { role: 'user' as const, content: customerName }]);

      const customer = await api.findCustomerByName(customerName);
      if (customer) {
        // 성공 - 업로드 후 카운터 초기화
        setCustomerSearchAttempts(0);
        await uploadFilesToCustomer(pendingFiles, customer);
      } else {
        // 고객 못 찾음
        const newAttempts = customerSearchAttempts + 1;
        setCustomerSearchAttempts(newAttempts);

        if (newAttempts >= MAX_SEARCH_ATTEMPTS) {
          // 3번 실패 - 등록 취소
          console.log('[Chat] 고객 검색 3회 실패, 등록 취소');
          setPendingFiles([]);
          setCustomerSearchAttempts(0);
          setMessages(prev => [...prev, {
            role: 'assistant' as const,
            content: `❌ 고객을 찾을 수 없어 문서 등록을 취소합니다.\n\n등록된 고객명을 확인 후 다시 시도해주세요.`
          }]);
        } else {
          // 다시 질문 (남은 시도 횟수 표시)
          const remaining = MAX_SEARCH_ATTEMPTS - newAttempts;
          setMessages(prev => [...prev, {
            role: 'assistant' as const,
            content: `❌ **"${customerName}"** 고객을 찾을 수 없습니다.\n\n정확한 고객명을 입력해주세요. (${remaining}회 남음)\n\n예: "홍길동", "라이콘코리아"`
          }]);
        }
      }
      return;
    }

    // 🔥 Case 2: 일반 메시지 (파일 없음)
    if (content.trim()) {
      sendMessage(content);
    }
  };

  // 음성 버튼
  const handleVoice = () => {
    router.push('/(auth)/voice');
  };

  // 환영 화면 렌더링 (aims-uix3 스타일)
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

      {/* 기능 카드 그리드 (aims-uix3 스타일) */}
      <View style={styles.featuresGrid}>
        {HELP_FEATURES.map((feature, featureIdx) => {
          const currentExampleIdx = exampleIndices[featureIdx];
          const currentExample = feature.examples[currentExampleIdx];
          const hasMultipleExamples = feature.examples.length > 1;

          return (
            <View key={feature.title} style={styles.featureCard}>
              {/* 헤더: 아이콘 + 제목 */}
              <View style={styles.featureHeader}>
                <Text style={styles.featureIcon}>{feature.icon}</Text>
                <View style={styles.featureTitleWrap}>
                  <Text style={styles.featureTitle}>{feature.title}</Text>
                  <Text style={styles.featureDesc}>{feature.desc}</Text>
                </View>
              </View>

              {/* 예시 버튼 */}
              <TouchableOpacity
                style={styles.exampleButton}
                onPress={() => handleExamplePress(currentExample)}
              >
                <Text style={styles.exampleText} numberOfLines={1}>
                  "{currentExample}"
                </Text>
              </TouchableOpacity>

              {/* 예시 넘기기 버튼 */}
              {hasMultipleExamples && (
                <TouchableOpacity
                  style={styles.nextExampleButton}
                  onPress={() => handleNextExample(featureIdx)}
                >
                  <Text style={styles.nextExampleText}>
                    다른 예시 ({currentExampleIdx + 1}/{feature.examples.length})
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.primary} />
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>
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

      {/* 로딩 인디케이터 (도구 사용 시 표시하지 않음 - aims-uix3 스타일) */}
      {isStreaming && !streamingContent && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      )}

      {/* 업로드 중 표시 */}
      {isUploading && (
        <View style={styles.uploadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.uploadingText}>파일 업로드 중...</Text>
        </View>
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
          {/* 타이틀 클릭 시 홈으로 */}
          <TouchableOpacity style={styles.headerLeft} onPress={handleNewChat}>
            <Ionicons name="chatbubble-ellipses" size={24} color={colors.primary} />
            <Text style={styles.headerTitle}>AI 어시스턴트</Text>
          </TouchableOpacity>
          <View style={styles.headerRight}>
            {/* 홈 버튼 (채팅 중일 때만 표시) */}
            {(messages.length > 0 || !showWelcome) && (
              <TouchableOpacity style={styles.headerButton} onPress={handleNewChat}>
                <Ionicons name="home-outline" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
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
          showsVerticalScrollIndicator={true}
          bounces={true}
          overScrollMode="always"
          onContentSizeChange={handleContentSizeChange}
        >
          {showWelcome && messages.length === 0 ? renderWelcome() : renderChat()}
        </ScrollView>

        {/* 대기 중인 파일 배너 */}
        {pendingFiles.length > 0 && (
          <View style={styles.pendingFilesBanner}>
            <View style={styles.pendingFilesInfo}>
              <Ionicons name="document-attach" size={18} color={colors.primary} />
              <Text style={styles.pendingFilesText}>
                {pendingFiles.length}개 파일 대기 중
              </Text>
            </View>
            <TouchableOpacity
              style={styles.pendingFilesCancelButton}
              onPress={() => {
                setPendingFiles([]);
                setCustomerSearchAttempts(0);
                setMessages(prev => [...prev, {
                  role: 'assistant' as const,
                  content: '📎 파일 첨부가 취소되었습니다.'
                }]);
              }}
            >
              <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              <Text style={styles.pendingFilesCancelText}>취소</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 입력창 */}
        <ChatInput
          onSend={handleSend}
          onFilesSelected={handleFilesSelected}
          onVoice={handleVoice}
          isLoading={isStreaming || isUploading}
          disabled={isStreaming || isUploading}
          placeholder={
            isUploading
              ? '업로드 중...'
              : pendingFiles.length > 0
                ? '고객명을 입력하세요 (예: 홍길동)'
                : undefined
          }
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
    paddingBottom: 120, // 입력창 높이 + 여유 공간
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
  // 기능 카드 그리드 (aims-uix3 스타일)
  featuresGrid: {
    gap: spacing.sm,
  },
  featureCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  featureHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  featureIcon: {
    fontSize: 24,
    marginRight: spacing.sm,
  },
  featureTitleWrap: {
    flex: 1,
  },
  featureTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  featureDesc: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  exampleButton: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  exampleText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontStyle: 'italic',
  },
  nextExampleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
  },
  nextExampleText: {
    fontSize: fontSize.xs,
    color: colors.primary,
  },
  // 로딩 인디케이터
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  // 업로드 중 표시
  uploadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    marginVertical: spacing.sm,
    gap: spacing.sm,
  },
  uploadingText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  // 대기 중인 파일 배너
  pendingFilesBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.backgroundSecondary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pendingFilesInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  pendingFilesText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: fontWeight.medium,
  },
  pendingFilesCancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    padding: spacing.xs,
  },
  pendingFilesCancelText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
