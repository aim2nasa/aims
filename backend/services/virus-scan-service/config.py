"""
바이러스 스캔 서비스 설정
"""
import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # 서비스 설정
    host: str = "0.0.0.0"
    port: int = 8100

    # AIMS API 설정 (tars Tailscale IP - yuri에서 본 tars IP)
    aims_api_url: str = "http://100.110.215.65:3010"
    scan_secret: str = os.environ.get("VIRUS_SCAN_SECRET", "aims-virus-scan-secret-key")

    # 파일 경로
    mount_path: str = "/mnt/tars-files"

    # ClamAV 설정
    clamd_socket: str = "/var/run/clamav/clamd.ctl"
    scan_timeout: int = 300  # 초

    # 스캔 설정
    max_file_size: int = 100 * 1024 * 1024  # 100MB
    batch_size: int = 10

    class Config:
        env_prefix = "VIRUS_SCAN_"


settings = Settings()
