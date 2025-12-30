"""
AIMS 바이러스 스캔 서비스 (yuri/RPi5)

ClamAV를 사용한 파일 바이러스 검사 API 서비스.
tars.giize.com의 aims_api와 통신하여 스캔 결과를 전달합니다.
"""
import os
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional, List
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, BackgroundTasks, Header
from pydantic import BaseModel

from config import settings
from scanner import scanner, ScanResult


# 전체 스캔 상태
class FullScanState:
    def __init__(self):
        self.is_running = False
        self.total_files = 0
        self.scanned_files = 0
        self.infected_files = 0
        self.started_at: Optional[datetime] = None
        self.current_file: Optional[str] = None


full_scan_state = FullScanState()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """앱 시작/종료 시 실행"""
    # 시작 시 ClamAV 상태 확인
    version = scanner.get_version()
    if version:
        print(f"ClamAV ready: {version}")
    else:
        print("WARNING: ClamAV not available")
    yield


app = FastAPI(
    title="AIMS Virus Scan Service",
    description="ClamAV 기반 바이러스 검사 서비스 (RPi5)",
    version="1.0.0",
    lifespan=lifespan
)


# === 요청/응답 모델 ===

class ScanRequest(BaseModel):
    """단일 파일 스캔 요청"""
    file_path: str  # /data/files/... 형식 (마운트 경로 기준)
    document_id: str
    collection_name: str  # "files", "personal_files", "inquiries"
    user_id: Optional[str] = None


class BatchScanRequest(BaseModel):
    """배치 스캔 요청"""
    files: List[ScanRequest]


class ScanResponse(BaseModel):
    """스캔 응답"""
    status: str
    threat_name: Optional[str] = None
    clam_version: Optional[str] = None
    scan_duration_ms: int = 0
    error_message: Optional[str] = None


class HealthResponse(BaseModel):
    """헬스체크 응답"""
    status: str
    clamd_running: bool
    clam_version: Optional[str]
    mount_available: bool
    mount_path: str


class FullScanProgress(BaseModel):
    """전체 스캔 진행 상황"""
    is_running: bool
    total_files: int
    scanned_files: int
    infected_files: int
    progress_percent: float
    started_at: Optional[str]
    current_file: Optional[str]


class FreshclamResponse(BaseModel):
    """freshclam 응답"""
    success: bool
    message: str
    output: Optional[str] = None


# === API 엔드포인트 ===

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """헬스체크 - ClamAV 및 마운트 상태 확인"""
    clamd_running = scanner.is_clamd_running()
    clam_version = scanner.get_version()
    mount_available = os.path.ismount(settings.mount_path) or os.path.isdir(settings.mount_path)

    return HealthResponse(
        status="ok" if clamd_running and mount_available else "degraded",
        clamd_running=clamd_running,
        clam_version=clam_version,
        mount_available=mount_available,
        mount_path=settings.mount_path
    )


@app.get("/system")
async def get_system_status():
    """시스템 상태 - CPU, 메모리, 디스크 사용량"""
    import subprocess

    system_info = {
        "hostname": "yuri",
        "platform": "Raspberry Pi 5",
        "cpu": {},
        "memory": {},
        "disk": {},
        "uptime": None
    }

    try:
        # CPU 사용량 (/proc/stat에서 계산)
        with open('/proc/loadavg', 'r') as f:
            load = f.read().split()
            system_info["cpu"] = {
                "load_1m": float(load[0]),
                "load_5m": float(load[1]),
                "load_15m": float(load[2]),
                "cores": os.cpu_count() or 4
            }

        # 메모리 사용량
        with open('/proc/meminfo', 'r') as f:
            meminfo = {}
            for line in f:
                parts = line.split()
                if len(parts) >= 2:
                    meminfo[parts[0].rstrip(':')] = int(parts[1]) * 1024  # KB to bytes

            total = meminfo.get('MemTotal', 0)
            available = meminfo.get('MemAvailable', 0)
            used = total - available

            system_info["memory"] = {
                "total": total,
                "used": used,
                "available": available,
                "percent": round((used / total) * 100, 1) if total > 0 else 0
            }

        # 디스크 사용량 (마운트 경로)
        stat = os.statvfs(settings.mount_path)
        total_disk = stat.f_blocks * stat.f_frsize
        free_disk = stat.f_bavail * stat.f_frsize
        used_disk = total_disk - free_disk

        system_info["disk"] = {
            "total": total_disk,
            "used": used_disk,
            "free": free_disk,
            "percent": round((used_disk / total_disk) * 100, 1) if total_disk > 0 else 0,
            "mount_path": settings.mount_path
        }

        # 업타임
        with open('/proc/uptime', 'r') as f:
            uptime_seconds = float(f.read().split()[0])
            system_info["uptime"] = int(uptime_seconds)

        # CPU 온도 (Raspberry Pi)
        try:
            with open('/sys/class/thermal/thermal_zone0/temp', 'r') as f:
                temp = int(f.read().strip()) / 1000.0
                system_info["cpu"]["temperature"] = round(temp, 1)
        except:
            pass

    except Exception as e:
        system_info["error"] = str(e)

    return system_info


@app.get("/version")
async def get_version():
    """ClamAV 버전 정보"""
    version = scanner.get_version()
    if not version:
        raise HTTPException(status_code=503, detail="ClamAV not available")
    return {"version": version}


@app.post("/scan", response_model=ScanResponse)
async def scan_file(
    request: ScanRequest,
    background_tasks: BackgroundTasks,
    x_scan_secret: str = Header(None)
):
    """
    단일 파일 스캔

    백그라운드에서 스캔 후 aims_api로 결과 전송
    """
    # 인증 확인
    if x_scan_secret != settings.scan_secret:
        raise HTTPException(status_code=401, detail="Invalid scan secret")

    # 파일 경로 구성
    # request.file_path: /data/files/users/xxx/file.pdf
    # 실제 경로: /mnt/tars-files/users/xxx/file.pdf
    relative_path = request.file_path.lstrip("/")
    if relative_path.startswith("data/files/"):
        relative_path = relative_path[len("data/files/"):]

    full_path = Path(settings.mount_path) / relative_path

    if not full_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {full_path}")

    # 백그라운드에서 스캔 및 결과 전송
    background_tasks.add_task(
        scan_and_report,
        str(full_path),
        request.file_path,
        request.document_id,
        request.collection_name,
        request.user_id
    )

    return ScanResponse(status="scanning")


@app.post("/scan/sync", response_model=ScanResponse)
async def scan_file_sync(
    request: ScanRequest,
    x_scan_secret: str = Header(None)
):
    """
    단일 파일 동기 스캔 (결과 즉시 반환)
    """
    # 인증 확인
    if x_scan_secret != settings.scan_secret:
        raise HTTPException(status_code=401, detail="Invalid scan secret")

    # 파일 경로 구성
    relative_path = request.file_path.lstrip("/")
    if relative_path.startswith("data/files/"):
        relative_path = relative_path[len("data/files/"):]

    full_path = Path(settings.mount_path) / relative_path

    if not full_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {full_path}")

    # 스캔 실행
    result = await scanner.scan_file(str(full_path))

    return ScanResponse(
        status=result.status,
        threat_name=result.threat_name,
        clam_version=result.clam_version,
        scan_duration_ms=result.scan_duration_ms,
        error_message=result.error_message
    )


@app.post("/scan/batch")
async def scan_batch(
    request: BatchScanRequest,
    background_tasks: BackgroundTasks,
    x_scan_secret: str = Header(None)
):
    """
    여러 파일 배치 스캔

    각 파일을 순차적으로 스캔하고 결과를 aims_api로 전송
    """
    if x_scan_secret != settings.scan_secret:
        raise HTTPException(status_code=401, detail="Invalid scan secret")

    if len(request.files) > 100:
        raise HTTPException(status_code=400, detail="Too many files (max 100)")

    # 백그라운드에서 배치 스캔
    background_tasks.add_task(batch_scan_task, request.files)

    return {
        "status": "scanning",
        "file_count": len(request.files)
    }


@app.post("/scan/full")
async def start_full_scan(
    background_tasks: BackgroundTasks,
    x_scan_secret: str = Header(None)
):
    """
    전체 파일 스캔 시작

    마운트된 모든 파일을 스캔합니다.
    """
    if x_scan_secret != settings.scan_secret:
        raise HTTPException(status_code=401, detail="Invalid scan secret")

    if full_scan_state.is_running:
        raise HTTPException(status_code=409, detail="Full scan already in progress")

    # 백그라운드에서 전체 스캔
    background_tasks.add_task(full_scan_task)

    return {"status": "started", "message": "Full scan started"}


@app.get("/scan/progress", response_model=FullScanProgress)
async def get_scan_progress():
    """전체 스캔 진행 상황 조회"""
    progress_percent = 0.0
    if full_scan_state.total_files > 0:
        progress_percent = (full_scan_state.scanned_files / full_scan_state.total_files) * 100

    return FullScanProgress(
        is_running=full_scan_state.is_running,
        total_files=full_scan_state.total_files,
        scanned_files=full_scan_state.scanned_files,
        infected_files=full_scan_state.infected_files,
        progress_percent=round(progress_percent, 1),
        started_at=full_scan_state.started_at.isoformat() if full_scan_state.started_at else None,
        current_file=full_scan_state.current_file
    )


@app.post("/scan/stop")
async def stop_full_scan(x_scan_secret: str = Header(None)):
    """전체 스캔 중지"""
    if x_scan_secret != settings.scan_secret:
        raise HTTPException(status_code=401, detail="Invalid scan secret")

    if not full_scan_state.is_running:
        raise HTTPException(status_code=400, detail="No scan in progress")

    full_scan_state.is_running = False
    return {"status": "stopped"}


@app.post("/freshclam/update", response_model=FreshclamResponse)
async def update_virus_db(x_scan_secret: str = Header(None)):
    """
    바이러스 DB 업데이트 (freshclam 실행)
    """
    if x_scan_secret != settings.scan_secret:
        raise HTTPException(status_code=401, detail="Invalid scan secret")

    try:
        process = await asyncio.create_subprocess_exec(
            "sudo", "freshclam",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        stdout, stderr = await asyncio.wait_for(
            process.communicate(),
            timeout=300  # 5분 타임아웃
        )

        output = stdout.decode("utf-8", errors="ignore")
        error = stderr.decode("utf-8", errors="ignore")

        if process.returncode == 0:
            # 버전 캐시 무효화
            scanner._version_cache = None
            return FreshclamResponse(
                success=True,
                message="Virus database updated successfully",
                output=output
            )
        else:
            return FreshclamResponse(
                success=False,
                message=f"freshclam failed with code {process.returncode}",
                output=error or output
            )

    except asyncio.TimeoutError:
        return FreshclamResponse(
            success=False,
            message="freshclam timeout (5 minutes)"
        )
    except Exception as e:
        return FreshclamResponse(
            success=False,
            message=str(e)
        )


@app.get("/freshclam/status")
async def get_freshclam_status():
    """바이러스 DB 상태 조회"""
    version = scanner.get_version()

    # DB 파일 정보
    db_path = Path("/var/lib/clamav")
    db_files = []
    if db_path.exists():
        for f in db_path.glob("*.c?d"):
            stat = f.stat()
            db_files.append({
                "name": f.name,
                "size": stat.st_size,
                "modified": datetime.fromtimestamp(stat.st_mtime).isoformat()
            })

    return {
        "version": version,
        "db_path": str(db_path),
        "db_files": db_files
    }


# === 백그라운드 태스크 ===

async def scan_and_report(
    full_path: str,
    original_path: str,
    document_id: str,
    collection_name: str,
    user_id: Optional[str]
):
    """파일 스캔 후 aims_api로 결과 전송"""
    result = await scanner.scan_file(full_path)

    # aims_api로 결과 전송
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            await client.post(
                f"{settings.aims_api_url}/api/admin/virus-scan/result",
                json={
                    "documentId": document_id,
                    "collectionName": collection_name,
                    "filePath": original_path,
                    "userId": user_id,
                    "status": result.status,
                    "threatName": result.threat_name,
                    "clamVersion": result.clam_version,
                    "scanDurationMs": result.scan_duration_ms,
                    "errorMessage": result.error_message
                },
                headers={"X-Scan-Secret": settings.scan_secret}
            )
    except Exception as e:
        print(f"Failed to report scan result: {e}")


async def batch_scan_task(files: List[ScanRequest]):
    """배치 스캔 태스크"""
    for file_req in files:
        relative_path = file_req.file_path.lstrip("/")
        if relative_path.startswith("data/files/"):
            relative_path = relative_path[len("data/files/"):]

        full_path = Path(settings.mount_path) / relative_path

        if full_path.exists():
            await scan_and_report(
                str(full_path),
                file_req.file_path,
                file_req.document_id,
                file_req.collection_name,
                file_req.user_id
            )

        # 부하 분산을 위한 짧은 딜레이
        await asyncio.sleep(0.1)


async def full_scan_task():
    """전체 파일 스캔 태스크"""
    global full_scan_state

    full_scan_state.is_running = True
    full_scan_state.started_at = datetime.now()
    full_scan_state.scanned_files = 0
    full_scan_state.infected_files = 0

    mount_path = Path(settings.mount_path)

    # 파일 목록 수집
    all_files = []
    for ext in ["*.pdf", "*.doc", "*.docx", "*.xls", "*.xlsx", "*.ppt", "*.pptx",
                "*.jpg", "*.jpeg", "*.png", "*.gif", "*.bmp", "*.tiff",
                "*.zip", "*.rar", "*.7z", "*.tar", "*.gz",
                "*.exe", "*.dll", "*.bat", "*.cmd", "*.ps1",
                "*.html", "*.htm", "*.js", "*.json", "*.xml",
                "*"]:  # 모든 파일
        all_files.extend(mount_path.rglob(ext))

    # 중복 제거
    all_files = list(set(all_files))
    full_scan_state.total_files = len(all_files)

    print(f"Full scan started: {len(all_files)} files")

    for file_path in all_files:
        if not full_scan_state.is_running:
            print("Full scan stopped by user")
            break

        if not file_path.is_file():
            continue

        full_scan_state.current_file = str(file_path)

        try:
            result = await scanner.scan_file(str(file_path))
            full_scan_state.scanned_files += 1

            if result.status == "infected":
                full_scan_state.infected_files += 1
                print(f"INFECTED: {file_path} - {result.threat_name}")

                # aims_api에 감염 보고 (document_id 없이)
                try:
                    relative_path = str(file_path).replace(settings.mount_path, "/data/files")
                    async with httpx.AsyncClient(timeout=30.0) as client:
                        await client.post(
                            f"{settings.aims_api_url}/api/admin/virus-scan/result",
                            json={
                                "documentId": None,
                                "collectionName": None,
                                "filePath": relative_path,
                                "userId": None,
                                "status": result.status,
                                "threatName": result.threat_name,
                                "clamVersion": result.clam_version,
                                "scanDurationMs": result.scan_duration_ms,
                                "scanType": "full"
                            },
                            headers={"X-Scan-Secret": settings.scan_secret}
                        )
                except Exception as e:
                    print(f"Failed to report infection: {e}")

        except Exception as e:
            print(f"Error scanning {file_path}: {e}")

        # 부하 분산
        await asyncio.sleep(0.05)

    full_scan_state.is_running = False
    full_scan_state.current_file = None

    print(f"Full scan completed: {full_scan_state.scanned_files} scanned, "
          f"{full_scan_state.infected_files} infected")

    # 완료 보고
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            await client.post(
                f"{settings.aims_api_url}/api/admin/virus-scan/full-scan-complete",
                json={
                    "totalFiles": full_scan_state.total_files,
                    "scannedFiles": full_scan_state.scanned_files,
                    "infectedFiles": full_scan_state.infected_files,
                    "startedAt": full_scan_state.started_at.isoformat() if full_scan_state.started_at else None,
                    "completedAt": datetime.now().isoformat()
                },
                headers={"X-Scan-Secret": settings.scan_secret}
            )
    except Exception as e:
        print(f"Failed to report full scan completion: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=settings.host, port=settings.port)
