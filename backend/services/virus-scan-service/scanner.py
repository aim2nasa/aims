"""
ClamAV 스캐너 래퍼
"""
import subprocess
import time
import os
import asyncio
from pathlib import Path
from typing import Optional
from dataclasses import dataclass
from config import settings


@dataclass
class ScanResult:
    """스캔 결과"""
    status: str  # "clean", "infected", "error"
    threat_name: Optional[str] = None
    clam_version: Optional[str] = None
    scan_duration_ms: int = 0
    error_message: Optional[str] = None


class ClamAVScanner:
    """ClamAV 스캐너"""

    def __init__(self):
        self._version_cache: Optional[str] = None
        self._version_cache_time: float = 0
        self._version_cache_ttl: float = 3600  # 1시간

    def get_version(self) -> Optional[str]:
        """ClamAV 버전 조회 (캐싱)"""
        now = time.time()
        if self._version_cache and (now - self._version_cache_time) < self._version_cache_ttl:
            return self._version_cache

        try:
            result = subprocess.run(
                ["clamdscan", "--version"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                self._version_cache = result.stdout.strip()
                self._version_cache_time = now
                return self._version_cache
        except Exception:
            pass

        # clamdscan 실패 시 clamscan 시도
        try:
            result = subprocess.run(
                ["clamscan", "--version"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                self._version_cache = result.stdout.strip()
                self._version_cache_time = now
                return self._version_cache
        except Exception:
            pass

        return None

    def is_clamd_running(self) -> bool:
        """clamd 데몬 실행 여부 확인"""
        try:
            result = subprocess.run(
                ["clamdscan", "--version"],
                capture_output=True,
                text=True,
                timeout=5
            )
            return result.returncode == 0
        except Exception:
            return False

    async def scan_file(self, file_path: str) -> ScanResult:
        """단일 파일 스캔"""
        start_time = time.time()

        # 파일 존재 확인
        if not os.path.exists(file_path):
            return ScanResult(
                status="error",
                error_message=f"File not found: {file_path}",
                scan_duration_ms=int((time.time() - start_time) * 1000)
            )

        # 파일 크기 확인
        file_size = os.path.getsize(file_path)
        if file_size > settings.max_file_size:
            return ScanResult(
                status="error",
                error_message=f"File too large: {file_size} bytes (max: {settings.max_file_size})",
                scan_duration_ms=int((time.time() - start_time) * 1000)
            )

        clam_version = self.get_version()

        # clamdscan 실행 (비동기)
        try:
            process = await asyncio.create_subprocess_exec(
                "clamdscan",
                "--no-summary",
                "--infected",
                file_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=settings.scan_timeout
                )
            except asyncio.TimeoutError:
                process.kill()
                return ScanResult(
                    status="error",
                    clam_version=clam_version,
                    error_message="Scan timeout",
                    scan_duration_ms=int((time.time() - start_time) * 1000)
                )

            duration_ms = int((time.time() - start_time) * 1000)

            # 종료 코드 분석
            # 0 = clean, 1 = infected, 2 = error
            if process.returncode == 0:
                return ScanResult(
                    status="clean",
                    clam_version=clam_version,
                    scan_duration_ms=duration_ms
                )
            elif process.returncode == 1:
                # 바이러스 이름 파싱
                stdout_text = stdout.decode("utf-8", errors="ignore")
                threat_name = self._parse_threat_name(stdout_text)
                return ScanResult(
                    status="infected",
                    threat_name=threat_name or "Unknown",
                    clam_version=clam_version,
                    scan_duration_ms=duration_ms
                )
            else:
                # clamdscan 실패 시 clamscan 폴백
                return await self._scan_with_clamscan(file_path, clam_version, start_time)

        except FileNotFoundError:
            # clamdscan이 없으면 clamscan 사용
            return await self._scan_with_clamscan(file_path, clam_version, start_time)
        except Exception as e:
            return ScanResult(
                status="error",
                clam_version=clam_version,
                error_message=str(e),
                scan_duration_ms=int((time.time() - start_time) * 1000)
            )

    async def _scan_with_clamscan(
        self,
        file_path: str,
        clam_version: Optional[str],
        start_time: float
    ) -> ScanResult:
        """clamscan으로 폴백 스캔"""
        try:
            process = await asyncio.create_subprocess_exec(
                "clamscan",
                "--no-summary",
                "--infected",
                file_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=settings.scan_timeout
                )
            except asyncio.TimeoutError:
                process.kill()
                return ScanResult(
                    status="error",
                    clam_version=clam_version,
                    error_message="Scan timeout (clamscan)",
                    scan_duration_ms=int((time.time() - start_time) * 1000)
                )

            duration_ms = int((time.time() - start_time) * 1000)

            if process.returncode == 0:
                return ScanResult(
                    status="clean",
                    clam_version=clam_version,
                    scan_duration_ms=duration_ms
                )
            elif process.returncode == 1:
                stdout_text = stdout.decode("utf-8", errors="ignore")
                threat_name = self._parse_threat_name(stdout_text)
                return ScanResult(
                    status="infected",
                    threat_name=threat_name or "Unknown",
                    clam_version=clam_version,
                    scan_duration_ms=duration_ms
                )
            else:
                stderr_text = stderr.decode("utf-8", errors="ignore")
                return ScanResult(
                    status="error",
                    clam_version=clam_version,
                    error_message=stderr_text or "Unknown error",
                    scan_duration_ms=duration_ms
                )

        except Exception as e:
            return ScanResult(
                status="error",
                clam_version=clam_version,
                error_message=str(e),
                scan_duration_ms=int((time.time() - start_time) * 1000)
            )

    def _parse_threat_name(self, output: str) -> Optional[str]:
        """스캔 출력에서 바이러스 이름 파싱"""
        # 출력 예: /path/to/file: Eicar-Signature FOUND
        import re
        match = re.search(r":\s*(.+?)\s+FOUND", output)
        if match:
            return match.group(1).strip()
        return None


# 전역 스캐너 인스턴스
scanner = ClamAVScanner()
