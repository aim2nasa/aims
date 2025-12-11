/**
 * 시스템 메트릭 수집 모듈
 * CPU, 메모리, 디스크 사용량을 수집하여 MongoDB에 저장
 */

const os = require('os');
const { execSync } = require('child_process');

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
 * 디스크 사용량 조회 (Linux)
 * @returns {Object} 디스크 정보
 */
function getDiskUsage() {
  try {
    // Linux df 명령으로 루트 파티션 정보 조회
    const output = execSync("df -B1 / 2>/dev/null | tail -1", { encoding: 'utf8' });
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
        usagePercent
      };
    }
  } catch (err) {
    console.error('[MetricsCollector] 디스크 정보 조회 실패:', err.message);
  }

  return {
    total: 0,
    used: 0,
    available: 0,
    usagePercent: 0
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
    disk: getDiskUsage(),
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
  getProcessMemory,
  getUptimeInfo,
  collectMetrics,
  formatBytes
};
