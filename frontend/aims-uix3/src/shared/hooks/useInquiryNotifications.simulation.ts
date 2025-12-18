/**
 * 카카오톡 스타일 1:1 문의 알림 시뮬레이션 테스트
 * aims-uix3 (사용자) ↔ aims-admin (관리자) 간 메시지 주고받기
 * @since 2025-12-19
 */

// 시뮬레이션을 위한 상태 관리 클래스
class InquiryNotificationSimulator {
  // 사용자 측 상태
  private unreadCount = 0;
  private unreadIds = new Set<string>();
  private currentViewingInquiryId: string | null = null;
  private processedEventIds = new Set<string>();

  // 서버 측 상태 (MongoDB 시뮬레이션)
  private inquiries = new Map<string, {
    userId: string;
    messages: Array<{ _id: string; authorRole: 'user' | 'admin'; createdAt: Date }>;
    userLastReadAt: Date | null;
  }>();

  private logs: string[] = [];
  private messageCounter = 0; // 고유 messageId 생성용

  log(message: string) {
    this.logs.push(`[${new Date().toISOString().slice(11, 19)}] ${message}`);
    console.log(message);
  }

  // ========================================
  // 사용자(uix3) 액션
  // ========================================

  /** 사용자가 문의 상세 화면 열기 */
  userOpenInquiryDetail(inquiryId: string) {
    this.currentViewingInquiryId = inquiryId;
    this.log(`📱 [UIX3] 사용자가 문의 ${inquiryId} 상세 화면 열음`);

    // 열린 문의가 unread면 읽음 처리
    if (this.unreadIds.has(inquiryId)) {
      this.userMarkAsRead(inquiryId);
    }
  }

  /** 사용자가 문의 상세 화면 닫기 */
  userCloseInquiryDetail() {
    this.log(`📱 [UIX3] 사용자가 문의 상세 화면 닫음`);
    this.currentViewingInquiryId = null;
  }

  /** 사용자가 문의 읽음 처리 */
  userMarkAsRead(inquiryId: string) {
    if (!this.unreadIds.has(inquiryId)) {
      this.log(`📱 [UIX3] 이미 읽음 처리된 문의: ${inquiryId}`);
      return;
    }

    // 1. 낙관적 업데이트: unreadIds에서 제거
    this.unreadIds.delete(inquiryId);

    // 2. 서버 상태 업데이트 (markAsReadApi 시뮬레이션)
    const inquiry = this.inquiries.get(inquiryId);
    if (inquiry) {
      inquiry.userLastReadAt = new Date();
    }

    // 3. 서버에서 정확한 count 가져오기 (getUnreadCount 시뮬레이션)
    this.unreadCount = this.calculateUnreadCount();

    this.log(`📱 [UIX3] 읽음 처리 완료: ${inquiryId}, 남은 미확인: ${this.unreadCount}`);
  }

  /** 사용자가 메시지 전송 */
  userSendMessage(inquiryId: string, content: string) {
    const inquiry = this.inquiries.get(inquiryId);
    if (!inquiry) {
      this.log(`❌ [UIX3] 문의를 찾을 수 없음: ${inquiryId}`);
      return;
    }

    const messageId = `msg_user_${++this.messageCounter}`;
    inquiry.messages.push({
      _id: messageId,
      authorRole: 'user',
      createdAt: new Date()
    });

    this.log(`📱 [UIX3] 사용자가 메시지 전송: "${content}"`);

    // 관리자에게 SSE 알림 (aims-admin)
    this.notifyAdmin(inquiryId, messageId);
  }

  // ========================================
  // 관리자(admin) 액션
  // ========================================

  /** 관리자가 답변 전송 */
  adminSendReply(inquiryId: string, content: string) {
    const inquiry = this.inquiries.get(inquiryId);
    if (!inquiry) {
      this.log(`❌ [ADMIN] 문의를 찾을 수 없음: ${inquiryId}`);
      return;
    }

    const messageId = `msg_admin_${++this.messageCounter}`;
    inquiry.messages.push({
      _id: messageId,
      authorRole: 'admin',
      createdAt: new Date()
    });

    this.log(`🖥️ [ADMIN] 관리자가 답변 전송: "${content}"`);

    // 사용자에게 SSE 알림
    this.handleSSENewMessage(inquiryId, messageId);
  }

  // ========================================
  // SSE 이벤트 처리 (카카오톡 스타일 핵심 로직)
  // ========================================

  /** SSE new-message 이벤트 처리 (사용자 측) */
  private handleSSENewMessage(inquiryId: string, messageId: string) {
    this.log(`📡 [SSE] new-message 이벤트 수신: inquiryId=${inquiryId}, messageId=${messageId}`);

    // 중복 체크
    if (this.processedEventIds.has(messageId)) {
      this.log(`⏭️ [SSE] 이미 처리된 이벤트 무시: ${messageId}`);
      return;
    }
    this.processedEventIds.add(messageId);

    // ⭐ 카카오톡 스타일 핵심 로직 ⭐
    const isCurrentlyViewing = this.currentViewingInquiryId === inquiryId;

    if (isCurrentlyViewing) {
      // 현재 보고 있는 문의 → 카운트 증가 안함, 즉시 읽음 처리
      this.log(`✅ [카카오톡 스타일] 현재 보고 있는 문의 - 카운트 증가 안함, 즉시 읽음 처리`);

      // 서버에 읽음 처리
      const inquiry = this.inquiries.get(inquiryId);
      if (inquiry) {
        inquiry.userLastReadAt = new Date();
      }
    } else {
      // 다른 문의 보고 있거나 목록 화면 → 카운트 증가
      this.log(`🔔 [카카오톡 스타일] 다른 화면에서 메시지 수신 - 카운트 증가!`);
      this.unreadIds.add(inquiryId);
      this.unreadCount++;
    }

    this.log(`📊 현재 상태: unreadCount=${this.unreadCount}, viewing=${this.currentViewingInquiryId}`);
  }

  /** 관리자에게 알림 (aims-admin SSE) */
  private notifyAdmin(inquiryId: string, messageId: string) {
    this.log(`📡 [SSE→ADMIN] new-message 이벤트 전송: inquiryId=${inquiryId}`);
  }

  // ========================================
  // 헬퍼 함수
  // ========================================

  /** 미확인 메시지 개수 계산 (서버 로직 시뮬레이션) */
  private calculateUnreadCount(): number {
    let count = 0;
    for (const [, inquiry] of this.inquiries) {
      const lastReadAt = inquiry.userLastReadAt || new Date(0);
      for (const msg of inquiry.messages) {
        if (msg.authorRole === 'admin' && msg.createdAt > lastReadAt) {
          count++;
        }
      }
    }
    return count;
  }

  /** 문의 생성 */
  createInquiry(inquiryId: string, userId: string) {
    this.inquiries.set(inquiryId, {
      userId,
      messages: [],
      userLastReadAt: null
    });
    this.log(`📝 문의 생성: ${inquiryId}`);
  }

  /** 현재 상태 반환 */
  getState() {
    return {
      unreadCount: this.unreadCount,
      unreadIds: Array.from(this.unreadIds),
      currentViewingInquiryId: this.currentViewingInquiryId
    };
  }

  /** 테스트 결과 검증 */
  assert(condition: boolean, message: string) {
    if (condition) {
      this.log(`✅ PASS: ${message}`);
    } else {
      this.log(`❌ FAIL: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }
}

// ========================================
// 테스트 시나리오 실행
// ========================================

function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('카카오톡 스타일 1:1 문의 알림 시뮬레이션 테스트');
  console.log('='.repeat(60) + '\n');

  const results: { name: string; passed: boolean; error?: string }[] = [];

  // 테스트 1: 문의 상세 화면 열고 있을 때 메시지 수신
  try {
    console.log('\n--- 테스트 1: 문의 열고 있을 때 메시지 수신 ---\n');
    const sim = new InquiryNotificationSimulator();

    sim.createInquiry('INQ001', 'user123');
    sim.userOpenInquiryDetail('INQ001');

    // 관리자가 답변 전송
    sim.adminSendReply('INQ001', '안녕하세요, 문의 감사합니다.');

    const state = sim.getState();
    sim.assert(state.unreadCount === 0, '열린 문의에 메시지 오면 카운트 0 유지');
    sim.assert(state.unreadIds.length === 0, 'unreadIds도 비어있어야 함');

    results.push({ name: '테스트 1: 열린 문의 메시지 수신', passed: true });
  } catch (e) {
    results.push({ name: '테스트 1: 열린 문의 메시지 수신', passed: false, error: String(e) });
  }

  // 테스트 2: 문의 목록 화면에서 메시지 수신
  try {
    console.log('\n--- 테스트 2: 목록 화면에서 메시지 수신 ---\n');
    const sim = new InquiryNotificationSimulator();

    sim.createInquiry('INQ002', 'user123');
    // 목록 화면에 있음 (currentViewingInquiryId = null)

    sim.adminSendReply('INQ002', '답변드립니다.');

    const state = sim.getState();
    sim.assert(state.unreadCount === 1, '목록 화면에서 메시지 오면 카운트 1');
    sim.assert(state.unreadIds.includes('INQ002'), 'unreadIds에 문의 ID 포함');

    results.push({ name: '테스트 2: 목록 화면 메시지 수신', passed: true });
  } catch (e) {
    results.push({ name: '테스트 2: 목록 화면 메시지 수신', passed: false, error: String(e) });
  }

  // 테스트 3: 다른 문의 보고 있을 때 메시지 수신
  try {
    console.log('\n--- 테스트 3: 다른 문의 보고 있을 때 메시지 수신 ---\n');
    const sim = new InquiryNotificationSimulator();

    sim.createInquiry('INQ003', 'user123');
    sim.createInquiry('INQ004', 'user123');
    sim.userOpenInquiryDetail('INQ003'); // INQ003 보고 있음

    sim.adminSendReply('INQ004', 'INQ004에 답변'); // INQ004에 메시지 옴

    const state = sim.getState();
    sim.assert(state.unreadCount === 1, '다른 문의 메시지는 카운트 증가');
    sim.assert(state.unreadIds.includes('INQ004'), 'unreadIds에 INQ004 포함');
    sim.assert(!state.unreadIds.includes('INQ003'), 'INQ003은 포함 안됨');

    results.push({ name: '테스트 3: 다른 문의 메시지 수신', passed: true });
  } catch (e) {
    results.push({ name: '테스트 3: 다른 문의 메시지 수신', passed: false, error: String(e) });
  }

  // 테스트 4: 연속 메시지 수신 (열린 상태)
  try {
    console.log('\n--- 테스트 4: 열린 문의에 연속 메시지 ---\n');
    const sim = new InquiryNotificationSimulator();

    sim.createInquiry('INQ005', 'user123');
    sim.userOpenInquiryDetail('INQ005');

    sim.adminSendReply('INQ005', '첫 번째 메시지');
    sim.adminSendReply('INQ005', '두 번째 메시지');
    sim.adminSendReply('INQ005', '세 번째 메시지');

    const state = sim.getState();
    sim.assert(state.unreadCount === 0, '열린 상태에서 연속 메시지도 카운트 0');

    results.push({ name: '테스트 4: 열린 문의 연속 메시지', passed: true });
  } catch (e) {
    results.push({ name: '테스트 4: 열린 문의 연속 메시지', passed: false, error: String(e) });
  }

  // 테스트 5: 열기 → 닫기 → 메시지 수신
  try {
    console.log('\n--- 테스트 5: 열기 → 닫기 → 메시지 수신 ---\n');
    const sim = new InquiryNotificationSimulator();

    sim.createInquiry('INQ006', 'user123');
    sim.userOpenInquiryDetail('INQ006');
    sim.userCloseInquiryDetail(); // 닫음

    sim.adminSendReply('INQ006', '닫은 후 메시지');

    const state = sim.getState();
    sim.assert(state.unreadCount === 1, '닫은 후 메시지는 카운트 증가');

    results.push({ name: '테스트 5: 닫은 후 메시지 수신', passed: true });
  } catch (e) {
    results.push({ name: '테스트 5: 닫은 후 메시지 수신', passed: false, error: String(e) });
  }

  // 테스트 6: 목록 → 메시지 수신 → 열기 → 읽음 처리
  try {
    console.log('\n--- 테스트 6: 전체 플로우 테스트 ---\n');
    const sim = new InquiryNotificationSimulator();

    sim.createInquiry('INQ007', 'user123');

    // 1. 목록에서 메시지 수신 → 카운트 1
    sim.adminSendReply('INQ007', '첫 번째 답변');
    let state = sim.getState();
    sim.assert(state.unreadCount === 1, '스텝1: 카운트 1');

    // 2. 문의 열기 → 읽음 처리 → 카운트 0
    sim.userOpenInquiryDetail('INQ007');
    state = sim.getState();
    sim.assert(state.unreadCount === 0, '스텝2: 열면 카운트 0');

    // 3. 열린 상태에서 추가 메시지 → 카운트 0 유지
    sim.adminSendReply('INQ007', '두 번째 답변');
    state = sim.getState();
    sim.assert(state.unreadCount === 0, '스텝3: 열린 상태 메시지도 카운트 0');

    // 4. 닫기 → 카운트 0 유지 (이미 읽음 처리됨)
    sim.userCloseInquiryDetail();
    state = sim.getState();
    sim.assert(state.unreadCount === 0, '스텝4: 닫아도 카운트 0');

    // 5. 닫은 후 메시지 → 카운트 1
    sim.adminSendReply('INQ007', '세 번째 답변');
    state = sim.getState();
    sim.assert(state.unreadCount === 1, '스텝5: 닫은 후 메시지 카운트 1');

    results.push({ name: '테스트 6: 전체 플로우', passed: true });
  } catch (e) {
    results.push({ name: '테스트 6: 전체 플로우', passed: false, error: String(e) });
  }

  // 테스트 7: 여러 문의 동시 처리
  try {
    console.log('\n--- 테스트 7: 여러 문의 동시 처리 ---\n');
    const sim = new InquiryNotificationSimulator();

    sim.createInquiry('INQ-A', 'user123');
    sim.createInquiry('INQ-B', 'user123');
    sim.createInquiry('INQ-C', 'user123');

    // INQ-A 열고 있음
    sim.userOpenInquiryDetail('INQ-A');

    // 모든 문의에 메시지 전송
    sim.adminSendReply('INQ-A', 'A 답변'); // 열려있음 → 카운트 0
    sim.adminSendReply('INQ-B', 'B 답변'); // 닫혀있음 → 카운트 1
    sim.adminSendReply('INQ-C', 'C 답변'); // 닫혀있음 → 카운트 2

    let state = sim.getState();
    sim.assert(state.unreadCount === 2, '열린 문의 제외 카운트 2');
    sim.assert(!state.unreadIds.includes('INQ-A'), 'INQ-A는 unread 아님');
    sim.assert(state.unreadIds.includes('INQ-B'), 'INQ-B는 unread');
    sim.assert(state.unreadIds.includes('INQ-C'), 'INQ-C는 unread');

    // INQ-B로 이동
    sim.userOpenInquiryDetail('INQ-B');
    state = sim.getState();
    sim.assert(state.unreadCount === 1, 'INQ-B 열면 카운트 1');

    results.push({ name: '테스트 7: 여러 문의 동시 처리', passed: true });
  } catch (e) {
    results.push({ name: '테스트 7: 여러 문의 동시 처리', passed: false, error: String(e) });
  }

  // 결과 출력
  console.log('\n' + '='.repeat(60));
  console.log('테스트 결과 요약');
  console.log('='.repeat(60));

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    if (result.passed) {
      console.log(`✅ ${result.name}`);
      passed++;
    } else {
      console.log(`❌ ${result.name}`);
      console.log(`   에러: ${result.error}`);
      failed++;
    }
  }

  console.log('\n' + '-'.repeat(60));
  console.log(`총 ${results.length}개 테스트: ${passed}개 성공, ${failed}개 실패`);
  console.log('='.repeat(60) + '\n');

  return failed === 0;
}

// 테스트 실행
const success = runTests();
process.exit(success ? 0 : 1);
