/**
 * sse-channels.js - SSE 채널 별칭 (공유 참조)
 *
 * customers-routes.js에서 추출된 공유 모듈
 * sseManager.channels의 Map을 직접 참조
 * @since 2026-04-04
 */

const sseManager = require('../lib/sseManager');

module.exports = {
  customerDoc: sseManager.channels.customerDoc,
  customerCombined: sseManager.channels.customerCombined,
  ar: sseManager.channels.ar,
  cr: sseManager.channels.cr,
  personalFiles: sseManager.channels.personalFiles,
  documentStatus: sseManager.channels.documentStatus,
  documentList: sseManager.channels.documentList,
  userAccount: sseManager.channels.userAccount,
};
