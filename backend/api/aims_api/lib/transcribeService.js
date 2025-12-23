/**
 * 음성 텍스트 변환 서비스 (Whisper API)
 * 모바일 앱 음성 인식용
 */

const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const os = require('os');
const backendLogger = require('./backendLogger');

// OpenAI 클라이언트 초기화
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * 음성 파일을 텍스트로 변환
 * @param {Buffer} fileBuffer - 음성 파일 버퍼
 * @param {string} fileName - 원본 파일명
 * @param {string} mimeType - 파일 MIME 타입
 * @returns {Promise<{text: string}>}
 */
async function transcribeAudio(fileBuffer, fileName, mimeType) {
  // 임시 파일로 저장 (OpenAI SDK는 파일 경로 또는 스트림을 필요로 함)
  const tempDir = os.tmpdir();
  const tempFilePath = path.join(tempDir, `transcribe_${Date.now()}_${fileName}`);

  try {
    // 버퍼를 임시 파일로 저장
    fs.writeFileSync(tempFilePath, fileBuffer);

    // Whisper API 호출
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: 'whisper-1',
      language: 'ko',  // 한국어
      response_format: 'text'
    });

    return { text: transcription };
  } finally {
    // 임시 파일 삭제
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch (cleanupError) {
      console.error('[Transcribe] 임시 파일 삭제 실패:', cleanupError.message);
      backendLogger.warn('Transcribe', '임시 파일 삭제 실패', cleanupError);
    }
  }
}

module.exports = {
  transcribeAudio
};
