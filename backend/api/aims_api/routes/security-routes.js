/**
 * Security Routes - 바이러스 검사 API
 * @since 2025-12-13
 * @version 1.0.0
 *
 * ClamAV 데몬을 사용한 파일 바이러스 검사 API
 *
 * 사전 요구사항:
 * - ClamAV 설치: sudo apt-get install clamav clamav-daemon
 * - 데몬 실행: sudo systemctl start clamav-daemon
 */

const express = require('express');
const router = express.Router();
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');
const multer = require('multer');

const execAsync = promisify(exec);

// Multer 설정 (메모리 저장)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB 제한
  }
});

// 환경변수로 ClamAV 활성화 제어 (기본값: true)
const CLAMAV_ENABLED = process.env.CLAMAV_ENABLED !== 'false';

// ClamAV 타임아웃 (밀리초)
const SCAN_TIMEOUT = parseInt(process.env.CLAMAV_TIMEOUT) || 60000; // 기본 60초

/**
 * ClamAV 데몬 연결 확인
 * @returns {Promise<boolean>}
 */
async function checkClamavStatus() {
  try {
    const { stdout } = await execAsync('clamscan --version', { timeout: 5000 });
    // 출력 예: ClamAV 1.4.3/27848/Fri Dec 12 18:26:04 2025
    const match = stdout.match(/ClamAV\s+([\d.]+)\/([\d]+)/);
    if (match) {
      return {
        available: true,
        version: match[1],
        dbVersion: parseInt(match[2]),
        fullVersion: stdout.trim()
      };
    }
    return { available: false, error: 'ClamAV version parse failed' };
  } catch (error) {
    return { available: false, error: error.message };
  }
}

/**
 * 단일 파일 바이러스 검사 (clamdscan 사용)
 * @param {string} filePath - 검사할 파일 경로
 * @returns {Promise<{infected: boolean, virusName?: string, error?: string}>}
 */
async function scanFile(filePath) {
  return new Promise((resolve) => {
    // clamdscan은 clamd 데몬 사용 (빠름)
    // clamscan은 직접 스캔 (느림, 데몬 불필요)
    const child = spawn('clamdscan', ['--no-summary', '--infected', filePath], {
      timeout: SCAN_TIMEOUT
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      // 종료 코드:
      // 0 = 감염 없음
      // 1 = 바이러스 발견
      // 2 = 에러 발생

      if (code === 0) {
        resolve({ infected: false });
      } else if (code === 1) {
        // 출력 예: /tmp/test.txt: Eicar-Signature FOUND
        const match = stdout.match(/:\s*(.+)\s+FOUND/);
        resolve({
          infected: true,
          virusName: match ? match[1].trim() : 'Unknown'
        });
      } else {
        // clamdscan 실패 시 clamscan 폴백
        execAsync(`clamscan --no-summary --infected "${filePath}"`, { timeout: SCAN_TIMEOUT })
          .then(({ stdout: fallbackStdout }) => {
            resolve({ infected: false });
          })
          .catch((fallbackError) => {
            if (fallbackError.code === 1) {
              const match = fallbackError.stdout?.match(/:\s*(.+)\s+FOUND/);
              resolve({
                infected: true,
                virusName: match ? match[1].trim() : 'Unknown'
              });
            } else {
              resolve({ infected: false, error: stderr || fallbackError.message });
            }
          });
      }
    });

    child.on('error', (error) => {
      // clamdscan 없으면 clamscan 사용
      execAsync(`clamscan --no-summary --infected "${filePath}"`, { timeout: SCAN_TIMEOUT })
        .then(() => resolve({ infected: false }))
        .catch((fallbackError) => {
          if (fallbackError.code === 1) {
            const match = fallbackError.stdout?.match(/:\s*(.+)\s+FOUND/);
            resolve({
              infected: true,
              virusName: match ? match[1].trim() : 'Unknown'
            });
          } else {
            resolve({ infected: false, error: error.message });
          }
        });
    });
  });
}

/**
 * 라우트 설정 함수
 * @param {Db} db - MongoDB 인스턴스 (미사용, 확장성 위해 유지)
 * @param {Function} authenticateJWT - JWT 인증 미들웨어
 */
module.exports = function(db, authenticateJWT) {

  /**
   * GET /api/security/scan-status
   * ClamAV 바이러스 검사 활성화 상태 확인
   */
  router.get('/security/scan-status', authenticateJWT, async (req, res) => {
    try {
      if (!CLAMAV_ENABLED) {
        return res.json({
          success: true,
          data: {
            enabled: false,
            available: false,
            message: 'ClamAV가 비활성화되어 있습니다.'
          }
        });
      }

      const status = await checkClamavStatus();

      res.json({
        success: true,
        data: {
          enabled: CLAMAV_ENABLED,
          available: status.available,
          version: status.version,
          dbVersion: status.dbVersion,
          fullVersion: status.fullVersion,
          error: status.error
        }
      });

    } catch (error) {
      console.error('ClamAV 상태 확인 오류:', error);
      res.status(500).json({
        success: false,
        error: 'ClamAV 상태 확인에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * POST /api/security/scan-file
   * 업로드된 파일 바이러스 검사
   *
   * 사용법: multipart/form-data로 'file' 필드에 파일 전송
   *
   * 응답:
   * - infected: true/false
   * - virusName: 감염 시 바이러스명
   * - skipped: ClamAV 비활성화 시 true
   */
  router.post('/security/scan-file', authenticateJWT, upload.single('file'), async (req, res) => {
    // 파일은 req.file에 있음

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '파일이 필요합니다.'
      });
    }

    try {
      // ClamAV 비활성화 시 스킵
      if (!CLAMAV_ENABLED) {
        return res.json({
          success: true,
          data: {
            infected: false,
            skipped: true,
            message: 'ClamAV가 비활성화되어 검사를 건너뛰었습니다.'
          }
        });
      }

      // 임시 파일로 저장 후 검사
      const tempDir = os.tmpdir();
      const tempFileName = `aims_scan_${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const tempFilePath = path.join(tempDir, tempFileName);

      // 파일 저장
      fs.writeFileSync(tempFilePath, req.file.buffer);

      try {
        // 바이러스 검사 실행
        const result = await scanFile(tempFilePath);

        // 임시 파일 삭제
        fs.unlinkSync(tempFilePath);

        if (result.infected) {
          console.warn(`⚠️ 바이러스 감지: ${req.file.originalname} - ${result.virusName}`);
        }

        res.json({
          success: true,
          data: {
            infected: result.infected,
            virusName: result.virusName,
            fileName: req.file.originalname,
            fileSize: req.file.size,
            error: result.error
          }
        });

      } finally {
        // 임시 파일 정리 (에러 발생 시에도)
        try {
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
        } catch (cleanupError) {
          console.error('임시 파일 삭제 실패:', cleanupError);
        }
      }

    } catch (error) {
      console.error('바이러스 검사 오류:', error);
      res.status(500).json({
        success: false,
        error: '바이러스 검사에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * POST /api/security/scan-buffer
   * Base64 인코딩된 파일 바이러스 검사
   *
   * Body:
   * - data: Base64 인코딩된 파일 데이터
   * - fileName: 파일명 (선택)
   */
  router.post('/security/scan-buffer', authenticateJWT, async (req, res) => {
    const { data, fileName } = req.body;

    if (!data) {
      return res.status(400).json({
        success: false,
        error: 'data 필드가 필요합니다. (Base64 인코딩된 파일)'
      });
    }

    try {
      // ClamAV 비활성화 시 스킵
      if (!CLAMAV_ENABLED) {
        return res.json({
          success: true,
          data: {
            infected: false,
            skipped: true,
            message: 'ClamAV가 비활성화되어 검사를 건너뛰었습니다.'
          }
        });
      }

      // Base64 디코딩
      const buffer = Buffer.from(data, 'base64');

      // 임시 파일로 저장
      const tempDir = os.tmpdir();
      const safeName = (fileName || 'unknown').replace(/[^a-zA-Z0-9.-]/g, '_');
      const tempFileName = `aims_scan_${Date.now()}_${safeName}`;
      const tempFilePath = path.join(tempDir, tempFileName);

      fs.writeFileSync(tempFilePath, buffer);

      try {
        const result = await scanFile(tempFilePath);

        fs.unlinkSync(tempFilePath);

        if (result.infected) {
          console.warn(`⚠️ 바이러스 감지: ${fileName || 'unknown'} - ${result.virusName}`);
        }

        res.json({
          success: true,
          data: {
            infected: result.infected,
            virusName: result.virusName,
            fileName: fileName || 'unknown',
            fileSize: buffer.length,
            error: result.error
          }
        });

      } finally {
        try {
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
        } catch (cleanupError) {
          console.error('임시 파일 삭제 실패:', cleanupError);
        }
      }

    } catch (error) {
      console.error('바이러스 검사 오류:', error);
      res.status(500).json({
        success: false,
        error: '바이러스 검사에 실패했습니다.',
        details: error.message
      });
    }
  });

  return router;
};
