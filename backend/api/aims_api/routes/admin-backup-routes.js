/**
 * admin-backup-routes.js - Backup 관리 라우트
 *
 * Phase 8: server.js 리팩토링
 * @since 2026-02-07
 */

const express = require('express');
const backendLogger = require('../lib/backendLogger');

module.exports = function(db, authenticateJWT, requireRole) {
  const router = express.Router();

// ==================== Backup Management APIs ====================
/**
 * 백업 관리 API
 * - 백업 목록 조회
 * - 백업 생성 (수동)
 * - 백업 삭제
 * - 백업 복원
 */

const BACKUP_DIR = '/data/backup';
const BACKUP_SCRIPT = '/home/rossi/aims/backend/scripts/backup_aims.sh';
const BACKUP_SETTINGS_FILE = '/data/backup/.backup_settings.json';

// 백업 설정 기본값
const DEFAULT_BACKUP_SETTINGS = {
  retentionDays: 7,
  autoBackup: false,
  autoBackupTime: '03:00',
};

// 백업 설정 읽기 헬퍼
function readBackupSettings() {
  const fs = require('fs');
  try {
    if (fs.existsSync(BACKUP_SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(BACKUP_SETTINGS_FILE, 'utf8'));
      return { ...DEFAULT_BACKUP_SETTINGS, ...data };
    }
  } catch (e) {
    console.error('백업 설정 읽기 실패:', e.message);
  }
  return { ...DEFAULT_BACKUP_SETTINGS };
}

// 백업 설정 조회
router.get('/admin/backups/settings', authenticateJWT, requireRole('admin'), async (req, res) => {
  try {
    const settings = readBackupSettings();
    res.json({ success: true, settings });
  } catch (error) {
    console.error('❌ [백업 설정 조회] 실패:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 백업 설정 업데이트
router.put('/admin/backups/settings', authenticateJWT, requireRole('admin'), async (req, res) => {
  try {
    const fs = require('fs');
    const { retentionDays, autoBackup, autoBackupTime } = req.body;

    // 유효성 검사
    if (retentionDays !== undefined && (typeof retentionDays !== 'number' || retentionDays < 1 || retentionDays > 365)) {
      return res.status(400).json({ success: false, error: '보관 기간은 1~365일 사이여야 합니다.' });
    }
    if (autoBackupTime !== undefined && !/^\d{2}:\d{2}$/.test(autoBackupTime)) {
      return res.status(400).json({ success: false, error: '시간 형식이 올바르지 않습니다. (HH:mm)' });
    }

    // 현재 설정 읽기
    const currentSettings = readBackupSettings();

    // 설정 업데이트
    const newSettings = {
      ...currentSettings,
      ...(retentionDays !== undefined && { retentionDays }),
      ...(autoBackup !== undefined && { autoBackup }),
      ...(autoBackupTime !== undefined && { autoBackupTime }),
      updatedAt: new Date().toISOString(),
    };

    // 파일에 저장
    fs.writeFileSync(BACKUP_SETTINGS_FILE, JSON.stringify(newSettings, null, 2), 'utf8');

    console.log('✅ [백업 설정] 업데이트 완료:', newSettings);
    res.json({ success: true, settings: newSettings, message: '백업 설정이 업데이트되었습니다.' });
  } catch (error) {
    console.error('❌ [백업 설정 업데이트] 실패:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 백업 목록 조회
router.get('/admin/backups', authenticateJWT, requireRole('admin'), async (req, res) => {
  try {
    const { execSync } = require('child_process');
    const fs = require('fs');
    const path = require('path');

    // 백업 디렉토리 확인
    if (!fs.existsSync(BACKUP_DIR)) {
      return res.json({ success: true, backups: [], message: '백업 디렉토리가 없습니다.' });
    }

    // 백업 파일 목록 조회
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('aims_backup_') && f.endsWith('.tar.gz'))
      .sort()
      .reverse(); // 최신순

    const backups = files.map(filename => {
      const filePath = path.join(BACKUP_DIR, filename);
      const stats = fs.statSync(filePath);

      // 파일명에서 날짜 추출: aims_backup_20251219_041228.tar.gz
      const match = filename.match(/aims_backup_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.tar\.gz/);
      let createdAt = stats.mtime.toISOString();
      if (match) {
        const [, year, month, day, hour, min, sec] = match;
        createdAt = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}+09:00`).toISOString();
      }

      // 로그 파일 확인
      const logFilename = filename.replace('aims_backup_', 'backup_').replace('.tar.gz', '.log');
      const logPath = path.join(BACKUP_DIR, logFilename);
      const hasLog = fs.existsSync(logPath);

      return {
        filename,
        size: stats.size,
        createdAt,
        hasLog,
        logFilename: hasLog ? logFilename : null,
      };
    });

    // 디스크 사용량 조회
    let diskInfo = null;
    try {
      const dfOutput = execSync(`df -B1 ${BACKUP_DIR} | tail -1`, { encoding: 'utf8' });
      const parts = dfOutput.trim().split(/\s+/);
      if (parts.length >= 4) {
        diskInfo = {
          total: parseInt(parts[1], 10),
          used: parseInt(parts[2], 10),
          available: parseInt(parts[3], 10),
        };
      }
    } catch (e) {
      console.error('디스크 정보 조회 실패:', e.message);
    }

    res.json({
      success: true,
      backups,
      totalCount: backups.length,
      diskInfo,
    });
  } catch (error) {
    console.error('❌ [백업 목록 조회] 실패:', error.message);
    backendLogger.error('Backup', '백업 목록 조회 실패', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 백업 생성 (수동) - 트리거 파일 + 폴링 방식
// 백업 스크립트는 호스트에서 실행되어야 함 (mongodump, python3 등 필요)
const BACKUP_TRIGGER_FILE = '/data/backup/.create_backup';
const BACKUP_RESULT_FILE = '/data/backup/.backup_result';

router.post('/admin/backups', authenticateJWT, requireRole('admin'), async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');

    console.log('📦 [백업 생성] 시작...');

    // 이미 진행 중인 백업이 있는지 확인 (트리거 파일 존재)
    if (fs.existsSync(BACKUP_TRIGGER_FILE)) {
      return res.status(409).json({
        success: false,
        error: '이미 백업이 진행 중입니다. 잠시 후 다시 시도해주세요.',
      });
    }

    // 이전 결과 파일 삭제
    if (fs.existsSync(BACKUP_RESULT_FILE)) {
      fs.unlinkSync(BACKUP_RESULT_FILE);
    }

    // 트리거 파일 생성 (호스트의 watcher가 감지하여 백업 실행)
    fs.writeFileSync(BACKUP_TRIGGER_FILE, JSON.stringify({
      requestedAt: new Date().toISOString(),
      requestedBy: req.user?.name || 'admin',
    }));

    console.log('📦 [백업 생성] 트리거 파일 생성, 결과 대기 중...');

    // 결과 파일 폴링 (최대 10분 대기, 2초 간격)
    const maxWaitTime = 600000; // 10분
    const pollInterval = 2000; // 2초
    const startTime = Date.now();

    const waitForResult = () => {
      return new Promise((resolve, reject) => {
        const checkResult = () => {
          // 결과 파일 확인
          if (fs.existsSync(BACKUP_RESULT_FILE)) {
            try {
              const result = JSON.parse(fs.readFileSync(BACKUP_RESULT_FILE, 'utf8'));
              fs.unlinkSync(BACKUP_RESULT_FILE); // 결과 파일 삭제
              resolve(result);
            } catch (e) {
              reject(new Error('결과 파일 파싱 실패'));
            }
            return;
          }

          // 타임아웃 확인
          if (Date.now() - startTime > maxWaitTime) {
            // 트리거 파일도 삭제
            if (fs.existsSync(BACKUP_TRIGGER_FILE)) {
              fs.unlinkSync(BACKUP_TRIGGER_FILE);
            }
            reject(new Error('백업 타임아웃 - watcher가 실행 중인지 확인하세요'));
            return;
          }

          // 다시 확인
          setTimeout(checkResult, pollInterval);
        };

        checkResult();
      });
    };

    const result = await waitForResult();

    if (!result.success) {
      throw new Error(result.error || '백업 실패');
    }

    console.log('📦 [백업 생성] 완료');

    // 최신 백업 정보 조회
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('aims_backup_') && f.endsWith('.tar.gz'))
      .sort()
      .reverse();

    let backupInfo = null;
    if (files.length > 0) {
      const latestBackup = files[0];
      const filePath = path.join(BACKUP_DIR, latestBackup);
      const stats = fs.statSync(filePath);
      backupInfo = {
        filename: latestBackup,
        size: stats.size,
        createdAt: stats.mtime.toISOString(),
      };
    }

    res.json({
      success: true,
      message: '백업이 완료되었습니다.',
      backup: backupInfo,
    });
  } catch (error) {
    console.error('❌ [백업 생성] 실패:', error.message);
    backendLogger.error('Backup', '백업 생성 실패', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 백업 삭제
router.delete('/admin/backups/:filename', authenticateJWT, requireRole('admin'), async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const { filename } = req.params;

    // 보안: 파일명 검증
    if (!filename.match(/^aims_backup_\d{8}_\d{6}\.tar\.gz$/)) {
      return res.status(400).json({ success: false, error: '잘못된 파일명입니다.' });
    }

    const filePath = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: '백업 파일을 찾을 수 없습니다.' });
    }

    // 백업 파일 삭제
    fs.unlinkSync(filePath);

    // 로그 파일도 삭제
    const logFilename = filename.replace('aims_backup_', 'backup_').replace('.tar.gz', '.log');
    const logPath = path.join(BACKUP_DIR, logFilename);
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath);
    }

    console.log(`🗑️ [백업 삭제] ${filename} 삭제됨`);

    res.json({ success: true, message: '백업이 삭제되었습니다.' });
  } catch (error) {
    console.error('❌ [백업 삭제] 실패:', error.message);
    backendLogger.error('Backup', '백업 삭제 실패', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 백업 로그 조회
router.get('/admin/backups/:filename/log', authenticateJWT, requireRole('admin'), async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const { filename } = req.params;

    // 보안: 파일명 검증
    if (!filename.match(/^backup_\d{8}_\d{6}\.log$/)) {
      return res.status(400).json({ success: false, error: '잘못된 로그 파일명입니다.' });
    }

    const logPath = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(logPath)) {
      return res.status(404).json({ success: false, error: '로그 파일을 찾을 수 없습니다.' });
    }

    const content = fs.readFileSync(logPath, 'utf8');
    res.json({ success: true, content });
  } catch (error) {
    console.error('❌ [백업 로그 조회] 실패:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 백업 복원
router.post('/admin/backups/:filename/restore', authenticateJWT, requireRole('admin'), async (req, res) => {
  try {
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);
    const fs = require('fs');
    const path = require('path');
    const { filename } = req.params;
    const { components = ['all'] } = req.body; // 복원할 컴포넌트: env, mongodb, qdrant, files, all

    // 보안: 파일명 검증
    if (!filename.match(/^aims_backup_\d{8}_\d{6}\.tar\.gz$/)) {
      return res.status(400).json({ success: false, error: '잘못된 파일명입니다.' });
    }

    const backupPath = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ success: false, error: '백업 파일을 찾을 수 없습니다.' });
    }

    console.log(`🔄 [백업 복원] 시작: ${filename}, 컴포넌트: ${components.join(', ')}`);

    // 임시 디렉토리에 압축 해제
    const tempDir = `/tmp/aims_restore_${Date.now()}`;
    await execPromise(`mkdir -p ${tempDir}`);
    await execPromise(`tar -xzf ${backupPath} -C ${tempDir}`);

    // 압축 해제된 디렉토리 찾기
    const extractedDirs = fs.readdirSync(tempDir);
    if (extractedDirs.length === 0) {
      await execPromise(`rm -rf ${tempDir}`);
      return res.status(500).json({ success: false, error: '백업 파일 압축 해제 실패' });
    }
    const extractedDir = path.join(tempDir, extractedDirs[0]);

    const results = [];
    const shouldRestore = (comp) => components.includes('all') || components.includes(comp);

    // 1. 환경 파일 복원
    if (shouldRestore('env')) {
      try {
        const envDir = path.join(extractedDir, 'env');
        if (fs.existsSync(envDir)) {
          if (fs.existsSync(path.join(envDir, 'aims_api.env'))) {
            await execPromise(`cp ${path.join(envDir, 'aims_api.env')} /home/rossi/aims/backend/api/aims_api/.env`);
            results.push({ component: 'env', status: 'success', message: 'aims_api.env 복원됨' });
          }
          if (fs.existsSync(path.join(envDir, 'annual_report_api.env'))) {
            await execPromise(`cp ${path.join(envDir, 'annual_report_api.env')} /home/rossi/aims/backend/api/annual_report_api/.env`);
            results.push({ component: 'env', status: 'success', message: 'annual_report_api.env 복원됨' });
          }
        } else {
          results.push({ component: 'env', status: 'skipped', message: 'env 디렉토리 없음' });
        }
      } catch (e) {
        results.push({ component: 'env', status: 'error', message: e.message });
      }
    }

    // 2. MongoDB 복원
    if (shouldRestore('mongodb')) {
      try {
        const mongoDir = path.join(extractedDir, 'mongodb');
        if (fs.existsSync(mongoDir)) {
          await execPromise(`mongorestore --drop ${mongoDir}`, { timeout: 300000 });
          results.push({ component: 'mongodb', status: 'success', message: 'MongoDB 복원됨' });
        } else {
          results.push({ component: 'mongodb', status: 'skipped', message: 'mongodb 디렉토리 없음' });
        }
      } catch (e) {
        results.push({ component: 'mongodb', status: 'error', message: e.message });
      }
    }

    // 3. Qdrant 복원
    if (shouldRestore('qdrant')) {
      try {
        const qdrantDir = path.join(extractedDir, 'qdrant');
        if (fs.existsSync(qdrantDir)) {
          // Qdrant 컨테이너 중지
          await execPromise('docker stop qdrant || true');
          // 기존 데이터 백업
          await execPromise('mv /home/rossi/qdrant/qdrant_storage /home/rossi/qdrant/qdrant_storage_backup_' + Date.now() + ' || true');
          // 복원
          await execPromise(`cp -r ${qdrantDir} /home/rossi/qdrant/qdrant_storage`);
          await execPromise('sudo chown -R root:root /home/rossi/qdrant/qdrant_storage');
          // Qdrant 재시작
          await execPromise('docker start qdrant');
          results.push({ component: 'qdrant', status: 'success', message: 'Qdrant 복원됨' });
        } else {
          results.push({ component: 'qdrant', status: 'skipped', message: 'qdrant 디렉토리 없음' });
        }
      } catch (e) {
        results.push({ component: 'qdrant', status: 'error', message: e.message });
      }
    }

    // 4. 업로드 파일 복원
    if (shouldRestore('files')) {
      try {
        const filesDir = path.join(extractedDir, 'files');
        if (fs.existsSync(filesDir)) {
          // 기존 파일 백업
          await execPromise('mv /data/files /data/files_backup_' + Date.now() + ' || true');
          // 복원
          await execPromise(`cp -r ${filesDir} /data/files`);
          await execPromise('sudo chown -R rossi:rossi /data/files/users || true');
          await execPromise('sudo chown -R root:root /data/files/inquiries || true');
          results.push({ component: 'files', status: 'success', message: '업로드 파일 복원됨' });
        } else {
          results.push({ component: 'files', status: 'skipped', message: 'files 디렉토리 없음' });
        }
      } catch (e) {
        results.push({ component: 'files', status: 'error', message: e.message });
      }
    }

    // 임시 디렉토리 정리
    await execPromise(`rm -rf ${tempDir}`);

    console.log(`🔄 [백업 복원] 완료:`, results);

    const hasError = results.some(r => r.status === 'error');
    res.json({
      success: !hasError,
      message: hasError ? '일부 복원 중 오류가 발생했습니다.' : '복원이 완료되었습니다.',
      results,
      note: '서비스 재시작이 필요할 수 있습니다.',
    });
  } catch (error) {
    console.error('❌ [백업 복원] 실패:', error.message);
    backendLogger.error('Backup', '백업 복원 실패', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 백업 파일 다운로드
router.get('/admin/backups/:filename/download', authenticateJWT, requireRole('admin'), async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const { filename } = req.params;

    // 보안: 파일명 검증
    if (!filename.match(/^aims_backup_\d{8}_\d{6}\.tar\.gz$/)) {
      return res.status(400).json({ success: false, error: '잘못된 파일명입니다.' });
    }

    const filePath = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: '백업 파일을 찾을 수 없습니다.' });
    }

    res.download(filePath, filename);
  } catch (error) {
    console.error('❌ [백업 다운로드] 실패:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});


  return router;
};
