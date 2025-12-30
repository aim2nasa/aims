/**
 * 바이러스 스캔 서비스
 * yuri(RPi5) 스캔 서비스와 통신
 * @since 2025-12-30
 */

const axios = require('axios');
const backendLogger = require('./backendLogger');

// yuri 스캔 서비스 설정
const VIRUS_SCAN_SERVICE_URL = process.env.VIRUS_SCAN_SERVICE_URL || 'http://100.120.196.45:8100';
const VIRUS_SCAN_SECRET = process.env.VIRUS_SCAN_SECRET || 'aims-virus-scan-secret-key';
const VIRUS_SCAN_ENABLED = process.env.VIRUS_SCAN_ENABLED !== 'false';

/**
 * 파일 스캔 요청 (비동기)
 * yuri에 스캔 요청을 보내고 결과는 webhook으로 수신
 *
 * @param {Object} params - 스캔 파라미터
 * @param {string} params.filePath - 파일 경로 (예: /data/files/users/xxx/file.pdf)
 * @param {string} params.documentId - 문서 ID
 * @param {string} params.collectionName - 컬렉션 이름 ('files', 'personal_files', 'inquiries')
 * @param {string} [params.userId] - 파일 소유자 ID
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function requestScan({ filePath, documentId, collectionName, userId }) {
  if (!VIRUS_SCAN_ENABLED) {
    console.log('[VirusScan] 바이러스 스캔 비활성화됨');
    return { success: true, message: 'Virus scan disabled' };
  }

  if (!filePath || !documentId || !collectionName) {
    console.warn('[VirusScan] 스캔 요청 실패: 필수 파라미터 누락');
    return { success: false, message: 'Missing required parameters' };
  }

  try {
    console.log(`[VirusScan] 스캔 요청: ${filePath} (${collectionName}/${documentId})`);

    const response = await axios.post(
      `${VIRUS_SCAN_SERVICE_URL}/scan`,
      {
        file_path: filePath,
        document_id: documentId,
        collection_name: collectionName,
        user_id: userId
      },
      {
        headers: { 'X-Scan-Secret': VIRUS_SCAN_SECRET },
        timeout: 10000
      }
    );

    console.log(`[VirusScan] 스캔 요청 성공: ${documentId}`);
    return { success: true, message: response.data?.message || 'Scan requested' };

  } catch (error) {
    // 스캔 서비스 오류는 로그만 남기고 문서 처리는 계속 진행
    console.error(`[VirusScan] 스캔 요청 실패: ${error.message}`);
    backendLogger.warn('VirusScan', `스캔 요청 실패: ${filePath}`, {
      error: error.message,
      documentId,
      collectionName
    });

    return { success: false, message: error.message };
  }
}

/**
 * 스캔 서비스 상태 확인
 * @returns {Promise<{available: boolean, version?: string, error?: string}>}
 */
async function checkServiceStatus() {
  if (!VIRUS_SCAN_ENABLED) {
    return { available: false, error: 'Virus scan disabled' };
  }

  try {
    const response = await axios.get(`${VIRUS_SCAN_SERVICE_URL}/health`, {
      timeout: 5000
    });

    return {
      available: response.data?.status === 'ok',
      version: response.data?.clam_version,
      clamdRunning: response.data?.clamd_running
    };

  } catch (error) {
    return { available: false, error: error.message };
  }
}

/**
 * 문서 업로드 완료 시 스캔 요청
 * 업로드 처리 흐름에서 호출
 *
 * @param {Object} db - MongoDB 인스턴스
 * @param {string} documentId - 문서 ID
 * @param {string} collectionName - 컬렉션 이름
 */
async function scanAfterUpload(db, documentId, collectionName = 'files') {
  if (!VIRUS_SCAN_ENABLED) {
    return;
  }

  try {
    const collection = db.collection(collectionName);
    const doc = await collection.findOne({ _id: documentId });

    if (!doc) {
      console.warn(`[VirusScan] 문서 찾을 수 없음: ${documentId}`);
      return;
    }

    const filePath = doc.upload?.destPath || doc.storagePath;
    if (!filePath) {
      console.warn(`[VirusScan] 파일 경로 없음: ${documentId}`);
      return;
    }

    // 스캔 상태 초기화
    await collection.updateOne(
      { _id: documentId },
      {
        $set: {
          'virusScan.status': 'pending',
          'virusScan.requestedAt': new Date()
        }
      }
    );

    // 스캔 요청
    const userId = doc.ownerId || doc.userId;
    await requestScan({
      filePath,
      documentId: documentId.toString(),
      collectionName,
      userId
    });

  } catch (error) {
    console.error(`[VirusScan] scanAfterUpload 오류:`, error);
    backendLogger.error('VirusScan', 'scanAfterUpload 오류', error);
  }
}

module.exports = {
  requestScan,
  checkServiceStatus,
  scanAfterUpload,
  VIRUS_SCAN_ENABLED,
  VIRUS_SCAN_SERVICE_URL
};
