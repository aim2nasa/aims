/**
 * 바이러스 스캔 서비스
 * yuri(RPi5) 스캔 서비스와 통신
 * @since 2025-12-30
 */

const axios = require('axios');
const { ObjectId } = require('mongodb');
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
 * 실시간 스캔 설정 확인
 * @param {Object} db - MongoDB 인스턴스
 * @returns {Promise<boolean>} 실시간 스캔 활성화 여부
 */
async function isRealtimeScanEnabled(db) {
  try {
    const settings = await db.collection('virus_scan_settings').findOne({ _id: 'virus_scan_config' });
    return settings?.realtimeScan?.enabled === true;
  } catch (error) {
    console.error('[VirusScan] 설정 조회 실패:', error.message);
    return false; // 설정 조회 실패 시 기본값 false (수동 스캔)
  }
}

/**
 * 문서 업로드 완료 시 스캔 처리
 * - 실시간 스캔 ON: 즉시 yuri에 스캔 요청
 * - 실시간 스캔 OFF: pending 상태로 누적 (수동 스캔 대기)
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
    const docId = (typeof documentId === 'string') ? new ObjectId(documentId) : documentId;
    const doc = await collection.findOne({ _id: docId });

    if (!doc) {
      console.warn(`[VirusScan] 문서 찾을 수 없음: ${documentId}`);
      return;
    }

    const filePath = doc.upload?.destPath || doc.storagePath;
    if (!filePath) {
      console.warn(`[VirusScan] 파일 경로 없음: ${documentId}`);
      return;
    }

    // 🔒 이미 스캔 요청된 파일은 스킵 (중복 요청 방지)
    const currentStatus = doc.virusScan?.status;
    if (currentStatus && ['pending', 'scanning', 'clean', 'infected', 'deleted'].includes(currentStatus)) {
      console.log(`[VirusScan] 이미 스캔 처리됨 (${currentStatus}), 스킵: ${documentId}`);
      return;
    }

    // 실시간 스캔 설정 확인
    const realtimeEnabled = await isRealtimeScanEnabled(db);

    // 스캔 상태 초기화 (pending)
    await collection.updateOne(
      { _id: docId },
      {
        $set: {
          'virusScan.status': 'pending',
          'virusScan.requestedAt': new Date()
        }
      }
    );

    if (realtimeEnabled) {
      // 실시간 스캔 ON → 즉시 스캔 요청
      console.log(`[VirusScan] 실시간 스캔: ${documentId}`);
      const userId = doc.ownerId || doc.userId;
      await requestScan({
        filePath,
        documentId: documentId.toString(),
        collectionName,
        userId
      });
    } else {
      // 실시간 스캔 OFF → pending 상태로 누적 (수동 스캔 대기)
      console.log(`[VirusScan] 스캔 대기 (수동): ${documentId}`);
    }

  } catch (error) {
    console.error(`[VirusScan] scanAfterUpload 오류:`, error);
    backendLogger.error('VirusScan', 'scanAfterUpload 오류', error);
  }
}

// DB 참조 (외부에서 주입)
let db = null;

// Elastic interval 설정
const MIN_INTERVAL = 3 * 1000;   // 최소 3초
const MAX_INTERVAL = 60 * 1000;  // 최대 60초
let currentInterval = MIN_INTERVAL;
let intervalId = null;

// 스캔 진행 중 플래그 (중복 실행 방지)
let isAutoScanRunning = false;

/**
 * DB 초기화
 * @param {Object} database - MongoDB database 인스턴스
 */
function init(database) {
  db = database;
  console.log('[VirusScan] 서비스 초기화 완료');
}

/**
 * 미스캔 파일 자동 스캔 (Elastic interval)
 * 실시간 스캔 ON일 때, virusScan.status가 없는 파일을 찾아 스캔
 * @returns {Promise<{found: number, scanned: number}>} 발견/스캔 파일 수
 */
async function autoScanUnscannedFiles() {
  if (!VIRUS_SCAN_ENABLED || !db) {
    return { found: 0, scanned: 0 };
  }

  // 이전 스캔이 진행 중이면 interval 증가 (백오프)
  if (isAutoScanRunning) {
    currentInterval = Math.min(currentInterval * 2, MAX_INTERVAL);
    return { found: 0, scanned: 0 };
  }

  try {
    // 실시간 스캔 설정 확인
    const realtimeEnabled = await isRealtimeScanEnabled(db);
    if (!realtimeEnabled) {
      currentInterval = MAX_INTERVAL; // 실시간 OFF면 최대 간격
      return { found: 0, scanned: 0 };
    }

    // yuri 서비스 상태 확인
    const serviceStatus = await checkServiceStatus();
    if (!serviceStatus.available) {
      currentInterval = Math.min(currentInterval * 1.5, MAX_INTERVAL);
      return { found: 0, scanned: 0 };
    }

    isAutoScanRunning = true;

    // 미스캔 파일 조회 (virusScan 필드가 없거나 status가 없는 파일)
    const unscannedFiles = await db.collection('files').find({
      $or: [
        { virusScan: { $exists: false } },
        { 'virusScan.status': { $exists: false } }
      ],
      'upload.destPath': { $exists: true }
    }).limit(10).toArray();

    if (unscannedFiles.length > 0) {
      console.log(`[VirusScan] 미스캔 파일 ${unscannedFiles.length}개 발견, 자동 스캔 시작 (interval: ${currentInterval/1000}s)`);

      for (const doc of unscannedFiles) {
        const filePath = doc.upload?.destPath || doc.storagePath;
        if (!filePath) continue;

        // pending 상태로 업데이트
        await db.collection('files').updateOne(
          { _id: doc._id },
          {
            $set: {
              'virusScan.status': 'pending',
              'virusScan.requestedAt': new Date()
            }
          }
        );

        // yuri에 스캔 요청
        const userId = doc.ownerId || doc.userId;
        await requestScan({
          filePath,
          documentId: doc._id.toString(),
          collectionName: 'files',
          userId
        });

        // 요청 간 약간의 딜레이 (yuri 부하 방지)
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // 파일 있으면 interval 리셋 (빠르게 다음 체크)
      currentInterval = MIN_INTERVAL;
      return { found: unscannedFiles.length, scanned: unscannedFiles.length };
    } else {
      // 파일 없으면 interval 증가
      currentInterval = Math.min(currentInterval * 1.5, MAX_INTERVAL);
      return { found: 0, scanned: 0 };
    }

  } catch (error) {
    console.error('[VirusScan] 자동 스캔 오류:', error.message);
    currentInterval = Math.min(currentInterval * 1.5, MAX_INTERVAL);
    return { found: 0, scanned: 0 };
  } finally {
    isAutoScanRunning = false;
  }
}

/**
 * 다음 스캔 스케줄링 (Elastic interval)
 */
function scheduleNextScan() {
  intervalId = setTimeout(async () => {
    await autoScanUnscannedFiles();
    scheduleNextScan(); // 재귀적으로 다음 스캔 예약
  }, currentInterval);
}

/**
 * 주기적 자동 스캔 시작 (Elastic interval)
 */
function startAutoScan() {
  console.log(`[VirusScan] 자동 스캔 모니터링 시작 (elastic: ${MIN_INTERVAL/1000}s ~ ${MAX_INTERVAL/1000}s)`);

  // 초기 실행 (3초 후)
  setTimeout(() => {
    autoScanUnscannedFiles();
    scheduleNextScan();
  }, 3000);
}

module.exports = {
  init,
  requestScan,
  checkServiceStatus,
  scanAfterUpload,
  startAutoScan,
  autoScanUnscannedFiles,
  VIRUS_SCAN_ENABLED,
  VIRUS_SCAN_SERVICE_URL
};
