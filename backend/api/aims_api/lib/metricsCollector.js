/**
 * 시스템 메트릭 수집 모듈
 * CPU, 메모리, 디스크 사용량을 수집하여 MongoDB에 저장
 */

const os = require('os');
const { execSync } = require('child_process');
const backendLogger = require('./backendLogger');

// CPU 사용률 계산을 위한 이전 값 저장
let previousCpuInfo = null;

/**
 * CPU 사용률 계산
 * @returns {Object} CPU 정보
 */
function getCpuUsage() {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  cpus.forEach(cpu => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });

  const currentInfo = { idle: totalIdle, total: totalTick };
  let usage = 0;

  if (previousCpuInfo) {
    const idleDiff = currentInfo.idle - previousCpuInfo.idle;
    const totalDiff = currentInfo.total - previousCpuInfo.total;
    usage = totalDiff > 0 ? ((1 - idleDiff / totalDiff) * 100) : 0;
  }

  previousCpuInfo = currentInfo;

  return {
    usage: parseFloat(usage.toFixed(1)),
    cores: cpus.length,
    model: cpus[0]?.model || 'Unknown',
    loadAvg: os.loadavg().map(v => parseFloat(v.toFixed(2)))
  };
}

/**
 * 메모리 사용량 조회
 * @returns {Object} 메모리 정보
 */
function getMemoryUsage() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;

  return {
    total,
    free,
    used,
    usagePercent: parseFloat(((used / total) * 100).toFixed(1))
  };
}

/**
 * 특정 마운트 포인트의 디스크 사용량 조회 (Linux)
 * @param {string} mountPoint 마운트 포인트 (예: '/', '/data')
 * @returns {Object} 디스크 정보
 */
function getDiskUsageByMount(mountPoint) {
  const defaultResult = {
    total: 0,
    used: 0,
    available: 0,
    usagePercent: 0,
    mountPoint
  };

  try {
    // Linux df 명령으로 특정 마운트 포인트 정보 조회
    const output = execSync(`df -B1 ${mountPoint} 2>/dev/null | tail -1`, { encoding: 'utf8' });
    const parts = output.trim().split(/\s+/);

    if (parts.length >= 5) {
      const total = parseInt(parts[1], 10);
      const used = parseInt(parts[2], 10);
      const available = parseInt(parts[3], 10);
      const usagePercent = parseFloat(parts[4].replace('%', ''));

      return {
        total,
        used,
        available,
        usagePercent,
        mountPoint
      };
    }
  } catch (err) {
    console.error(`[MetricsCollector] 디스크 정보 조회 실패 (${mountPoint}):`, err.message);
    backendLogger.error('MetricsCollector', `디스크 정보 조회 실패 (${mountPoint})`, err);
  }

  return defaultResult;
}

/**
 * 디스크 사용량 조회 (Linux) - 하위 호환성 유지
 * @returns {Object} 루트 파티션 디스크 정보
 */
function getDiskUsage() {
  const result = getDiskUsageByMount('/');
  // 하위 호환성: mountPoint 필드 제거
  const { mountPoint, ...diskInfo } = result;
  return diskInfo;
}

/**
 * 모든 파티션 디스크 사용량 조회
 * @returns {Object} 파티션별 디스크 정보
 */
function getAllDisksUsage() {
  return {
    root: getDiskUsageByMount('/'),
    // Docker 컨테이너에서는 /data가 /data/files로 마운트됨
    data: getDiskUsageByMount('/data/files')
  };
}

/**
 * Node.js 프로세스 메모리 사용량
 * @returns {Object} 프로세스 메모리 정보
 */
function getProcessMemory() {
  const mem = process.memoryUsage();
  return {
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    rss: mem.rss,
    external: mem.external
  };
}

/**
 * 시스템 업타임 정보
 * @returns {Object} 업타임 정보
 */
function getUptimeInfo() {
  return {
    system: os.uptime(),
    process: process.uptime()
  };
}

/**
 * 전체 시스템 메트릭 수집
 * @returns {Object} 전체 메트릭
 */
function collectMetrics() {
  return {
    timestamp: new Date(),
    cpu: getCpuUsage(),
    memory: getMemoryUsage(),
    disk: getDiskUsage(),        // 하위 호환성 (루트 파티션)
    disks: getAllDisksUsage(),   // 파티션별 디스크 정보
    process: getProcessMemory(),
    uptime: getUptimeInfo(),
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch()
  };
}

/**
 * 바이트를 사람이 읽기 쉬운 형식으로 변환
 * @param {number} bytes 바이트
 * @returns {string} 포맷된 문자열
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = {
  getCpuUsage,
  getMemoryUsage,
  getDiskUsage,
  getDiskUsageByMount,
  getAllDisksUsage,
  getProcessMemory,
  getUptimeInfo,
  collectMetrics,
  formatBytes
};
