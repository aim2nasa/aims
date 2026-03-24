"""
xPipeWeb 서버 큐잉 통합 테스트

- 업로드 → 큐 → FIFO 처리 확인
- 동시성 제한 확인
- 배치 업로드 FIFO
"""
from __future__ import annotations

import asyncio
import io

import pytest
from httpx import AsyncClient, ASGITransport

import xpipe.console.web.server as srv
from xpipe.scheduler import InMemoryQueue


def _make_file(name: str, content: str = "test content") -> tuple[str, io.BytesIO, str]:
    return (name, io.BytesIO(content.encode()), "text/plain")


async def _wait_all_done(timeout: float = 10.0) -> None:
    """모든 큐 작업 완료 대기"""
    for _ in range(int(timeout / 0.1)):
        if srv.state.pipeline_queue.qsize() == 0 and srv.state._running_count == 0:
            return
        await asyncio.sleep(0.1)


@pytest.mark.asyncio
async def test_server_queue_integration():
    """서버 큐잉 통합 테스트 — 단일 세션에서 모든 시나리오 검증"""
    # --- 초기화 ---
    srv.state.pipeline_queue = InMemoryQueue(maxsize=100)
    srv.state._running_count = 0
    await srv.on_startup()

    transport = ASGITransport(app=srv.app)

    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # === 1. 단일 업로드 → queued 반환 ===
            resp = await client.post(
                "/api/upload",
                files={"file": _make_file("single.txt")},
            )
            assert resp.status_code == 200
            assert resp.json()["status"] == "queued"
            single_id = resp.json()["doc_id"]

            # 완료 대기
            for _ in range(50):
                sr = await client.get(f"/api/status/{single_id}")
                if sr.json()["status"] in ("completed", "error"):
                    break
                await asyncio.sleep(0.1)
            assert sr.json()["status"] == "completed", "단일 업로드 완료 실패"

            await _wait_all_done()

            # === 2. 배치 업로드 → FIFO 순서 처리 ===
            files = [
                ("files", _make_file(f"batch_{i}.txt", f"content {i}"))
                for i in range(5)
            ]
            resp = await client.post("/api/upload/batch", files=files)
            assert resp.status_code == 200
            assert resp.json()["total"] == 5
            batch_ids = [f["doc_id"] for f in resp.json()["files"]]

            # 모두 완료 대기
            for did in batch_ids:
                for _ in range(50):
                    sr = await client.get(f"/api/status/{did}")
                    if sr.json()["status"] in ("completed", "error"):
                        break
                    await asyncio.sleep(0.1)

            # FIFO 순서 확인 — 시작 시간(started_at)이 제출 순서와 일치해야 함
            start_times = [srv.documents[did].get("started_at", float("inf")) for did in batch_ids]
            for i in range(len(start_times) - 1):
                assert start_times[i] <= start_times[i + 1], \
                    f"FIFO 위반: batch_{i} started ({start_times[i]:.3f}) > batch_{i+1} started ({start_times[i+1]:.3f})"

            await _wait_all_done()

            # === 3. 동시성=1 → 순차 처리 ===
            original_concurrency = srv.MAX_CONCURRENCY
            srv.MAX_CONCURRENCY = 1

            files = [
                ("files", _make_file(f"seq_{i}.txt", f"seq content {i}"))
                for i in range(3)
            ]
            resp = await client.post("/api/upload/batch", files=files)
            seq_ids = [f["doc_id"] for f in resp.json()["files"]]

            for did in seq_ids:
                for _ in range(50):
                    sr = await client.get(f"/api/status/{did}")
                    if sr.json()["status"] in ("completed", "error"):
                        break
                    await asyncio.sleep(0.1)

            # 순차 확인
            for i in range(len(seq_ids) - 1):
                curr = srv.documents[seq_ids[i]]
                nxt = srv.documents[seq_ids[i + 1]]
                if curr.get("completed_at") and nxt.get("started_at"):
                    assert curr["completed_at"] <= nxt["started_at"] + 0.15, \
                        f"동시성=1 위반: seq_{i} completed > seq_{i+1} started"

            srv.MAX_CONCURRENCY = original_concurrency

    finally:
        srv.documents.clear()
        await srv.on_shutdown()
