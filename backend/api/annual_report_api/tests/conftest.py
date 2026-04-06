"""
테스트 환경 설정 — .env.shared에서 INTERNAL_API_KEY 등 공유 환경변수 로드

PM2 런타임은 ecosystem.config.cjs에서 .env.shared를 자동 로드하지만,
pytest 직접 실행 시에는 .env만 로드되므로 여기서 보충한다.
"""
import os
from pathlib import Path

# .env.shared 경로 탐색 (aims 프로젝트 루트)
_project_root = Path(__file__).parent.parent.parent.parent.parent  # aims/
_env_shared = _project_root / ".env.shared"

if _env_shared.exists():
    with open(_env_shared, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip()
                # 기존 환경변수가 없을 때만 설정 (override 방지)
                if key and not os.environ.get(key):
                    os.environ[key] = value
