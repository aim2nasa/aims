/**
 * chat-routes.js - Chat, Audio, Internal API 라우트
 *
 * Phase 7: server.js 리팩토링
 * @since 2026-02-07
 */

const express = require('express');
const backendLogger = require('../lib/backendLogger');

module.exports = function(db, analyticsDb, authenticateJWT, upload, creditPolicy) {
  const router = express.Router();

  // Services
  const chatHistoryService = require('../lib/chatHistoryService');
  const { transcribeAudio } = require('../lib/transcribeService');

// ==================== AI 채팅 API ====================

/**
 * AI 채팅 SSE 엔드포인트
 * OpenAI GPT-4o + MCP 연동 + 히스토리 저장
 * @route POST /api/chat
 */
router.post('/chat', authenticateJWT, async (req, res) => {
  const userId = req.user.id;
  const { messages, session_id: requestSessionId } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({
      success: false,
      error: 'messages 배열이 필요합니다.'
    });
  }

  // SSE 헤더 설정
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // 세션 관리: 없으면 새로 생성
  let sessionId = requestSessionId;
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');

  try {
    if (!sessionId && lastUserMessage) {
      // 새 세션 생성
      const newSession = await chatHistoryService.createSession(userId, lastUserMessage.content);
      sessionId = newSession.session_id;
      // 세션 ID 전송
      res.write(`data: ${JSON.stringify({ type: 'session', session_id: sessionId })}\n\n`);
    }

    // 사용자 메시지 저장
    if (sessionId && lastUserMessage) {
      await chatHistoryService.addMessage(
        sessionId,
        userId,
        'user',
        lastUserMessage.content
      );
    }
  } catch (historyError) {
    console.error('[Chat] 히스토리 저장 오류:', historyError.message);
    backendLogger.error('Chat', '히스토리 저장 오류', historyError);
    // 히스토리 저장 실패해도 채팅은 계속
  }

  console.log(`[Chat] 채팅 시작 - userId: ${userId}, sessionId: ${sessionId || 'none'}, messages: ${messages.length}개`);

  try {
    // 크레딧 한도 체크 (AI 호출 전) - 월정액 + 추가 크레딧 합산
    const creditCheck = await creditPolicy.checkWithBonus(userId, 5);

    if (!creditCheck.allowed) {
      // 상세 정보를 위해 기본 체크도 수행
      const basicCheck = await creditPolicy.checkBeforeAI(userId, 5);
      console.log(`[Chat] 크레딧 부족 - userId: ${userId}, monthly: ${creditCheck.monthly_remaining}, bonus: ${creditCheck.bonus_balance}, total: ${creditCheck.total_available}`);

      // 크레딧 부족 SSE 이벤트 전송
      res.write(`data: ${JSON.stringify({
        type: 'credit_exceeded',
        credits_used: basicCheck.credits_used ?? 0,
        credits_remaining: creditCheck.monthly_remaining ?? 0,
        credit_quota: basicCheck.credit_quota ?? 0,
        credit_usage_percent: basicCheck.credit_usage_percent ?? 100,
        days_until_reset: basicCheck.days_until_reset ?? 0,
        tier: basicCheck.tier,
        tier_name: basicCheck.tier_name,
        bonus_balance: creditCheck.bonus_balance ?? 0,
        total_available: creditCheck.total_available ?? 0
      })}\n\n`);

      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
      return;
    }

    const { streamChatResponse } = require('../lib/chatService');

    let fullResponse = '';
    let usage = null;
    const toolsUsed = [];

    for await (const event of streamChatResponse(messages, userId, analyticsDb)) {
      // 응답 내용 수집
      if (event.type === 'content') {
        fullResponse += event.content;
      }
      if (event.type === 'tool_calling') {
        toolsUsed.push(event.name);
      }
      if (event.type === 'done') {
        usage = event.usage;
      }

      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    // 어시스턴트 응답 저장
    if (sessionId && fullResponse) {
      try {
        await chatHistoryService.addMessage(
          sessionId,
          userId,
          'assistant',
          fullResponse,
          {
            tokens: usage ? {
              prompt: usage.prompt_tokens,
              completion: usage.completion_tokens,
              total: usage.total_tokens
            } : null,
            tools_used: toolsUsed
          }
        );
      } catch (saveError) {
        console.error('[Chat] 응답 저장 오류:', saveError.message);
        backendLogger.error('Chat', '응답 저장 오류', saveError);
      }
    }

    res.end();
  } catch (error) {
    console.error('[Chat] 스트리밍 오류:', error);
    backendLogger.error('Chat', '스트리밍 오류', error);
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.end();
  }
});

/**
 * MCP Tools 목록 조회 (디버깅용)
 * @route GET /api/chat/tools
 */
router.get('/chat/tools', authenticateJWT, async (req, res) => {
  try {
    const { getMCPToolsAsOpenAIFunctions } = require('../lib/chatService');
    const tools = await getMCPToolsAsOpenAIFunctions();
    res.json({ success: true, tools, count: tools.length });
  } catch (error) {
    console.error('[Chat] Tools 조회 오류:', error);
    backendLogger.error('Chat', 'Tools 조회 오류', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== 채팅 히스토리 API ====================

/**
 * 채팅 세션 목록 조회
 * @route GET /api/chat/sessions
 */
router.get('/chat/sessions', authenticateJWT, async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

  try {
    const result = await chatHistoryService.getSessionList(userId, page, limit);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Chat] 세션 목록 조회 오류:', error);
    backendLogger.error('Chat', '세션 목록 조회 오류', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 채팅 세션 메시지 조회
 * @route GET /api/chat/sessions/:sessionId
 */
router.get('/chat/sessions/:sessionId', authenticateJWT, async (req, res) => {
  const userId = req.user.id;
  const { sessionId } = req.params;

  try {
    const result = await chatHistoryService.getSessionMessages(sessionId, userId);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: '세션을 찾을 수 없습니다.'
      });
    }

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Chat] 세션 메시지 조회 오류:', error);
    backendLogger.error('Chat', '세션 메시지 조회 오류', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 채팅 세션 삭제
 * @route DELETE /api/chat/sessions/:sessionId
 */
router.delete('/chat/sessions/:sessionId', authenticateJWT, async (req, res) => {
  const userId = req.user.id;
  const { sessionId } = req.params;

  try {
    const deleted = await chatHistoryService.deleteSession(sessionId, userId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: '세션을 찾을 수 없습니다.'
      });
    }

    res.json({ success: true, message: '세션이 삭제되었습니다.' });
  } catch (error) {
    console.error('[Chat] 세션 삭제 오류:', error);
    backendLogger.error('Chat', '세션 삭제 오류', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 채팅 세션 제목 수정
 * @route PATCH /api/chat/sessions/:sessionId
 */
router.patch('/chat/sessions/:sessionId', authenticateJWT, async (req, res) => {
  const userId = req.user.id;
  const { sessionId } = req.params;
  const { title } = req.body;

  if (!title || typeof title !== 'string') {
    return res.status(400).json({
      success: false,
      error: '제목(title)이 필요합니다.'
    });
  }

  try {
    const updated = await chatHistoryService.updateSessionTitle(sessionId, userId, title);

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: '세션을 찾을 수 없습니다.'
      });
    }

    res.json({ success: true, message: '제목이 수정되었습니다.' });
  } catch (error) {
    console.error('[Chat] 세션 제목 수정 오류:', error);
    backendLogger.error('Chat', '세션 제목 수정 오류', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 사용자 채팅 통계 조회
 * @route GET /api/chat/stats
 */
router.get('/chat/stats', authenticateJWT, async (req, res) => {
  const userId = req.user.id;

  try {
    const stats = await chatHistoryService.getUserStats(userId);
    res.json({ success: true, stats });
  } catch (error) {
    console.error('[Chat] 통계 조회 오류:', error);
    backendLogger.error('Chat', '통계 조회 오류', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 음성 변환 API (모바일 앱용)
// ============================================================

/**
 * 음성을 텍스트로 변환 (Whisper API)
 * @route POST /api/transcribe
 * @description 모바일 앱에서 녹음한 음성을 텍스트로 변환
 */
router.post('/transcribe', authenticateJWT, upload.single('file'), async (req, res) => {
  const startTime = Date.now();
  const userId = req.user.id;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '음성 파일이 필요합니다.'
      });
    }

    console.log(`[Transcribe] 요청: userId=${userId}, fileName=${req.file.originalname}, size=${req.file.size}, mimeType=${req.file.mimetype}`);

    const result = await transcribeAudio(
      req.file.buffer,
      req.file.originalname || 'recording.m4a',
      req.file.mimetype || 'audio/m4a'
    );

    const elapsed = Date.now() - startTime;
    console.log(`[Transcribe] 완료: userId=${userId}, text="${result.text?.substring(0, 50)}...", elapsed=${elapsed}ms`);

    res.json({
      success: true,
      text: result.text
    });
  } catch (error) {
    console.error('[Transcribe] 오류:', error);
    backendLogger.error('Transcribe', '음성 변환 오류', error);
    res.status(500).json({
      success: false,
      error: error.message || '음성 변환에 실패했습니다.'
    });
  }
});


  return router;
};
