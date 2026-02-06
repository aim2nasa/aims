/**
 * sseManager.js - SSE (Server-Sent Events) 클라이언트 관리 싱글턴
 *
 * Phase 2: server.js 리팩토링 (SSE Manager 추출)
 * Node.js 모듈 캐싱을 활용한 싱글턴 패턴
 * @since 2026-02-07
 */

// ========================================
// SSE 채널별 클라이언트 Map
// ========================================
const channels = {
  customerDoc: new Map(),        // customerId(string) -> Set<response>
  ar: new Map(),                 // customerId(string) -> Set<response>
  cr: new Map(),                 // customerId(string) -> Set<response>
  customerCombined: new Map(),   // customerId(string) -> Set<response>
  personalFiles: new Map(),      // userId(string) -> Set<response>
  documentStatus: new Map(),     // documentId(string) -> Set<response>
  documentList: new Map(),       // userId(string) -> Set<response>
  userAccount: new Map(),        // userId(string) -> Set<response>
};

/**
 * SSE 이벤트 전송 헬퍼
 * @param {object} res - Express response 객체
 * @param {string} event - 이벤트 이름
 * @param {object} data - 이벤트 데이터
 */
function sendSSE(res, event, data) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch (e) {
    console.error('[SSE] 전송 실패:', e);
  }
}

/**
 * 채널에 구독자 등록
 * @param {string} channelName - 채널 이름 (channels 객체의 키)
 * @param {string} key - 구독 키 (customerId, userId, documentId 등)
 * @param {object} res - Express response 객체
 */
function subscribe(channelName, key, res) {
  const map = channels[channelName];
  if (!map) {
    console.error(`[SSE] Unknown channel: ${channelName}`);
    return;
  }
  if (!map.has(key)) {
    map.set(key, new Set());
  }
  map.get(key).add(res);
}

/**
 * 채널에서 구독자 제거
 * @param {string} channelName - 채널 이름
 * @param {string} key - 구독 키
 * @param {object} res - Express response 객체
 */
function unsubscribe(channelName, key, res) {
  const map = channels[channelName];
  if (!map) return;
  map.get(key)?.delete(res);
  if (map.get(key)?.size === 0) {
    map.delete(key);
  }
}

// ========================================
// 도메인별 notify 함수 (기존 함수명 호환)
// ========================================

/**
 * 특정 고객의 통합 SSE 구독자들에게 알림 전송
 */
function notifyCustomerCombinedSubscribers(customerId, event, data) {
  const customerIdStr = customerId.toString();
  const clients = channels.customerCombined.get(customerIdStr);
  const totalClients = Array.from(channels.customerCombined.values()).reduce((sum, set) => sum + set.size, 0);
  console.log(`[SSE-Combined] notifyCustomerCombinedSubscribers 호출 - customerId: ${customerIdStr}, event: ${event}, 해당 고객 연결: ${clients?.size || 0}, 전체 연결: ${totalClients}`);
  if (clients && clients.size > 0) {
    clients.forEach(res => sendSSE(res, event, data));
    console.log(`[SSE-Combined] ✅ 고객 ${customerIdStr}의 통합 구독자들에게 ${event} 이벤트 전송 (${clients.size} 연결)`);
  } else {
    console.log(`[SSE-Combined] 고객 ${customerIdStr}에 연결된 통합 구독자 없음 - 이벤트 미전송`);
  }
}

/**
 * 특정 고객 문서 구독자들에게 알림 전송
 */
function notifyCustomerDocSubscribers(customerId, event, data) {
  const customerIdStr = customerId.toString();
  const clients = channels.customerDoc.get(customerIdStr);
  const totalClients = Array.from(channels.customerDoc.values()).reduce((sum, set) => sum + set.size, 0);
  console.log(`[SSE] notifyCustomerDocSubscribers 호출 - customerId: ${customerIdStr}, 해당 고객 연결: ${clients?.size || 0}, 전체 연결: ${totalClients}`);
  if (clients && clients.size > 0) {
    clients.forEach(res => sendSSE(res, event, data));
    console.log(`[SSE] 고객 ${customerIdStr}의 구독자들에게 ${event} 이벤트 전송 (${clients.size} 연결)`);
  } else {
    console.log(`[SSE] 고객 ${customerIdStr}에 연결된 구독자 없음 - 이벤트 미전송`);
  }
  // 통합 SSE로도 전송 (HTTP/1.1 연결 제한 문제 해결용)
  notifyCustomerCombinedSubscribers(customerIdStr, event, data);
}

/**
 * 특정 고객 AR 구독자들에게 알림 전송
 */
function notifyARSubscribers(customerId, event, data) {
  const customerIdStr = customerId.toString();
  const clients = channels.ar.get(customerIdStr);
  const totalClients = Array.from(channels.ar.values()).reduce((sum, set) => sum + set.size, 0);

  // 🔍 DEBUG: 현재 등록된 모든 클라이언트 키 출력
  const allKeys = Array.from(channels.ar.keys());
  console.log(`[SSE-AR] 🔍 DEBUG - 등록된 클라이언트 키 목록: [${allKeys.join(', ')}]`);
  console.log(`[SSE-AR] 🔍 DEBUG - 조회할 키: "${customerIdStr}" (type: ${typeof customerIdStr})`);

  console.log(`[SSE-AR] notifyARSubscribers 호출 - customerId: ${customerIdStr}, 해당 고객 연결: ${clients?.size || 0}, 전체 연결: ${totalClients}`);
  if (clients && clients.size > 0) {
    clients.forEach(res => sendSSE(res, event, data));
    console.log(`[SSE-AR] ✅ 고객 ${customerIdStr}의 AR 구독자들에게 ${event} 이벤트 전송 (${clients.size} 연결)`);
  } else {
    console.log(`[SSE-AR] ⚠️ 고객 ${customerIdStr}에 연결된 AR 구독자 없음 - 이벤트 미전송`);
  }
  // 통합 SSE로도 전송 (HTTP/1.1 연결 제한 문제 해결용)
  notifyCustomerCombinedSubscribers(customerIdStr, event, data);
}

/**
 * 특정 고객 CR 구독자들에게 알림 전송
 */
function notifyCRSubscribers(customerId, event, data) {
  const customerIdStr = customerId.toString();
  const clients = channels.cr.get(customerIdStr);
  const totalClients = Array.from(channels.cr.values()).reduce((sum, set) => sum + set.size, 0);
  console.log(`[SSE-CR] notifyCRSubscribers 호출 - customerId: ${customerIdStr}, 해당 고객 연결: ${clients?.size || 0}, 전체 연결: ${totalClients}`);
  if (clients && clients.size > 0) {
    clients.forEach(res => sendSSE(res, event, data));
    console.log(`[SSE-CR] 고객 ${customerIdStr}의 CR 구독자들에게 ${event} 이벤트 전송 (${clients.size} 연결)`);
  } else {
    console.log(`[SSE-CR] 고객 ${customerIdStr}에 연결된 CR 구독자 없음 - 이벤트 미전송`);
  }
  // 통합 SSE로도 전송 (HTTP/1.1 연결 제한 문제 해결용)
  notifyCustomerCombinedSubscribers(customerIdStr, event, data);
}

/**
 * 특정 사용자 Personal Files 구독자들에게 알림 전송
 */
function notifyPersonalFilesSubscribers(userId, event, data) {
  const userIdStr = userId.toString();
  const clients = channels.personalFiles.get(userIdStr);
  const totalClients = Array.from(channels.personalFiles.values()).reduce((sum, set) => sum + set.size, 0);
  console.log(`[SSE-PF] notifyPersonalFilesSubscribers 호출 - userId: ${userIdStr}, 해당 사용자 연결: ${clients?.size || 0}, 전체 연결: ${totalClients}`);
  if (clients && clients.size > 0) {
    clients.forEach(res => sendSSE(res, event, data));
    console.log(`[SSE-PF] 사용자 ${userIdStr}의 구독자들에게 ${event} 이벤트 전송 (${clients.size} 연결)`);
  } else {
    console.log(`[SSE-PF] 사용자 ${userIdStr}에 연결된 구독자 없음 - 이벤트 미전송`);
  }
}

/**
 * 특정 문서 처리 상태 구독자들에게 알림 전송
 */
function notifyDocumentStatusSubscribers(documentId, event, data) {
  const documentIdStr = documentId.toString();
  const clients = channels.documentStatus.get(documentIdStr);
  const totalClients = Array.from(channels.documentStatus.values()).reduce((sum, set) => sum + set.size, 0);
  console.log(`[SSE-DocStatus] notifyDocumentStatusSubscribers 호출 - documentId: ${documentIdStr}, 해당 문서 연결: ${clients?.size || 0}, 전체 연결: ${totalClients}`);
  if (clients && clients.size > 0) {
    clients.forEach(res => sendSSE(res, event, data));
    console.log(`[SSE-DocStatus] 문서 ${documentIdStr}의 구독자들에게 ${event} 이벤트 전송 (${clients.size} 연결)`);
  } else {
    console.log(`[SSE-DocStatus] 문서 ${documentIdStr}에 연결된 구독자 없음 - 이벤트 미전송`);
  }
}

/**
 * 특정 사용자의 문서 목록 구독자들에게 알림 전송
 */
function notifyDocumentListSubscribers(userId, event, data) {
  const userIdStr = userId.toString();
  const clients = channels.documentList.get(userIdStr);
  const totalClients = Array.from(channels.documentList.values()).reduce((sum, set) => sum + set.size, 0);
  console.log(`[SSE-DocList] notifyDocumentListSubscribers 호출 - userId: ${userIdStr}, 해당 사용자 연결: ${clients?.size || 0}, 전체 연결: ${totalClients}`);
  if (clients && clients.size > 0) {
    clients.forEach(res => sendSSE(res, event, data));
    console.log(`[SSE-DocList] 사용자 ${userIdStr}의 구독자들에게 ${event} 이벤트 전송 (${clients.size} 연결)`);
  } else {
    console.log(`[SSE-DocList] 사용자 ${userIdStr}에 연결된 구독자 없음 - 이벤트 미전송`);
  }
}

/**
 * 특정 사용자의 계정 정보 구독자들에게 알림 전송
 */
function notifyUserAccountSubscribers(userId, event, data) {
  const userIdStr = userId.toString();
  const clients = channels.userAccount.get(userIdStr);
  const totalClients = Array.from(channels.userAccount.values()).reduce((sum, set) => sum + set.size, 0);
  console.log(`[SSE-UserAccount] notifyUserAccountSubscribers 호출 - userId: ${userIdStr}, 해당 사용자 연결: ${clients?.size || 0}, 전체 연결: ${totalClients}`);
  if (clients && clients.size > 0) {
    clients.forEach(res => sendSSE(res, event, data));
    console.log(`[SSE-UserAccount] 사용자 ${userIdStr}의 구독자들에게 ${event} 이벤트 전송 (${clients.size} 연결)`);
  } else {
    console.log(`[SSE-UserAccount] 사용자 ${userIdStr}에 연결된 구독자 없음 - 이벤트 미전송`);
  }
}

module.exports = {
  channels,
  sendSSE,
  subscribe,
  unsubscribe,
  notifyCustomerDocSubscribers,
  notifyARSubscribers,
  notifyCRSubscribers,
  notifyCustomerCombinedSubscribers,
  notifyPersonalFilesSubscribers,
  notifyDocumentStatusSubscribers,
  notifyDocumentListSubscribers,
  notifyUserAccountSubscribers,
};
