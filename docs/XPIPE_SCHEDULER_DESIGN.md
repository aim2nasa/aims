# xPipe Scheduler 설계

> 상태: **검토안** (확정 아님)
> 최종 업데이트: 2026-03-20
> 토의 원본: `XPIPE_SCHEDULER_DESIGN_ARCHIVE.md`

---

## 1. 확정 원칙

| 원칙 | 설명 |
|------|------|
| 큐잉은 xPipe 책임 | 호출자는 큐를 신경 쓰지 않는다 |
| 업로드·저장은 호출자 책임 | xPipe는 `file_path`만 받음 |
| 외부 종속성 금지 | 코어는 표준 라이브러리만 |
| 미들웨어 독립적 | 미들웨어는 코어 밖에서 어댑터로 주입 |
| Producer-Consumer | 큐에는 경로(참조)만, 파일은 디스크에 |
| 확장 가능한 구조 | Phase 0은 단일 프로세스 OK. 구조적으로 멀티 프로세스 전환 가능해야 함 |

---

## 2. 현재 문제

```python
# xPipeWeb (server.py)
asyncio.create_task(_run_pipeline(...))  # 무제한 병렬 → API rate limit
```

- 동시 10개 업로드 → 10개 파이프라인 동시 실행
- 동시성 제어 없음, 큐 없음, 재시도 없음

---

## 3. Phase 0 구현 범위

### 만드는 것

```
scheduler.py (신규):
  Job — 작업 단위 데이터클래스
  InMemoryQueue — asyncio.Queue 래핑
  Scheduler — 큐에서 꺼내 실행, 동시성 제어

server.py (수정):
  asyncio.create_task(_run_pipeline(...))
  → scheduler.submit_file(file_path, filename, config)
```

### 만들지 않는 것

| 항목 | 이유 |
|------|------|
| QueueBackend ABC | Phase 1 (AIMS 통합 시) |
| WorkerPool ABC | Phase 1 (멀티 프로세스 시) |
| FileSystemQueue | Phase 1 (영속화 필요 시) |
| ProcessWorkerPool | Phase 1 (CPU-bound 분산 시) |
| owner_id 격리 | Phase 1 (AIMS 다중 사용자) |
| 재시도 (max_retries) | Phase 1 |
| SchedulerStats dataclass | dict 반환으로 충분 |
| Stage is_idempotent | 재시도 없으면 의미 없음 |

---

## 4. Phase 0 인터페이스

```python
# --- Job ---
class JobStatus(Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

@dataclass
class Job:
    job_id: str              # Scheduler가 uuid 생성
    file_path: str
    filename: str
    status: JobStatus = JobStatus.QUEUED
    config_snapshot: dict = field(default_factory=dict)
    result: Optional[dict] = None
    error: Optional[str] = None
    error_stage: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None


# --- InMemoryQueue ---
class InMemoryQueue:
    """asyncio.Queue 래핑. 단일 프로세스 전용. 서버 재시작 시 유실."""

    def __init__(self, maxsize: int = 100): ...
    async def put(self, job: Job) -> None: ...      # QueueFull 시 예외
    async def get(self, timeout: float = 5.0) -> Optional[Job]: ...
    async def remove(self, job_id: str) -> bool: ... # 취소용
    def qsize(self) -> int: ...


# --- Scheduler ---
class Scheduler:
    """큐에서 작업을 꺼내 파이프라인 실행. 동시성 제어."""

    def __init__(self,
                 pipeline_factory: Callable,  # (job: Job) -> dict
                 queue: Optional[InMemoryQueue] = None,  # Phase 1: QueueBackend 주입
                 max_concurrency: int = 2,
                 default_config: Optional[dict] = None):
        self._queue = queue or InMemoryQueue()
        self._running: int = 0
        self._max_concurrency: int = max_concurrency

    # --- 핵심 메서드 ---
    async def submit_file(self, file_path: str, filename: str,
                          config: Optional[dict] = None) -> str:
        """파일 경로로 작업 제출. job_id 반환.
        config deepcopy는 내부에서 수행."""

    async def start(self) -> None:
        """워커 루프 시작"""

    async def shutdown(self, timeout: float = 30) -> None:
        """종료. 처리 중 작업 완료 대기 (최대 timeout초)"""

    # --- 조회 ---
    def get_job(self, job_id: str) -> Optional[Job]: ...
    def get_stats(self) -> dict: ...
        # {"queued": N, "processing": N, "completed": N, "failed": N}

    # --- 동시성 ---
    def set_max_concurrency(self, n: int) -> None: ...

    # --- 내부 ---
    def _try_acquire(self) -> bool:
        """동기 메서드 (await 없음). TOCTOU 방지."""
        if self._running < self._max_concurrency:
            self._running += 1
            return True
        return False
```

### server.py 변경 (Before → After)

```python
# Before
asyncio.create_task(_run_pipeline(doc_id, file_path, filename))

# After
job_id = await scheduler.submit_file(file_path, filename, config=current_config)
```

**전환 대상 3곳:** 단건 업로드 (L519), 배치 업로드 (L554), 재처리 (L1068)

**QueueFull 처리:** `submit_file()` 내부에서 `QueueFull` 예외 발생 시 호출자에 전파. server.py에서 HTTP 429 (Too Many Requests) 반환.

**서버 lifecycle 연동:**
```python
@app.on_event("startup")
async def on_startup():
    await scheduler.start()

@app.on_event("shutdown")
async def on_shutdown():
    await scheduler.shutdown(timeout=30)
```

### 핵심 설계 결정

| 결정 | 근거 |
|------|------|
| Semaphore 대신 정수 카운터 | Semaphore는 런타임 변경 불가. `_try_acquire()` 동기 메서드로 TOCTOU 방지 |
| config deepcopy는 Scheduler 내부 | 호출자가 빠뜨리면 격리 깨짐. 캡슐화 원칙 |
| WorkerPool 분리 안 함 | Phase 0은 asyncio 코루틴만. 분리는 멀티 프로세스 전환 시 |
| InMemoryQueue에 ABC 없음 | Phase 1에서 QueueBackend ABC 도입 시 시그니처만 맞으면 됨 |
| queue 파라미터 optional 주입 | Phase 1에서 큐 백엔드 교체 시 생성자 변경 없음 |
| shutdown timeout 30초 | 전체 파이프라인 최대 ~25초 + 여유 5초 |

---

## 5. Phase 1~2 예약 (구현 안 함, 방향만)

### Phase 1: AIMS 통합

- QueueBackend ABC 도입 → InMemoryQueue가 구현체가 됨
- MongoDBBackend(QueueBackend) — AIMS 측 구현체 (코어 밖)
- WorkerPool ABC 도입 → ProcessWorkerPool 추가
- owner_id 격리: `cancel(job_id, owner_id)`, `get_job(job_id, owner_id)`
- 재시도 정책 (max_retries, retry_delay)
- Stage is_idempotent 속성

### Phase 2: AIMS 자체 큐 제거

- UploadQueueService → Scheduler로 완전 전환
- FileSystemQueue (표준 라이브러리, 영속화)
- Graceful shutdown 상세 (interrupted 상태, 자동 복구)

### 인터페이스 확장 시 원칙

Phase 0의 `InMemoryQueue`와 `Scheduler`는 ABC 없이 구현하되, **Phase 1에서 ABC를 끼워넣을 수 있도록 메서드 시그니처를 맞춰둔다.** 기존 코드를 깨지 않고 ABC를 상속하게 변경 가능.

---

## 6. 스케일업 설계 — 추후 검토

Phase 0은 **단일 프로세스 + asyncio**로 현재 문제(무제한 병렬)를 해결한다.
멀티 프로세스, 분산 큐, 영속화 등 스케일업 설계는 ARCHIVE 문서에 검토안이 보존되어 있으며, 확장이 필요한 시점(Phase 1+)에 재검토한다.

스케일업 검토 항목:
- WorkerPool ABC + ProcessWorkerPool (멀티 프로세스)
- QueueBackend ABC + FileSystemQueue/MongoDBBackend (영속화)
- 동시성 카운터 프로세스 간 공유 (multiprocessing.Value, IPC)
- Graceful shutdown 상세, Stage 멱등성, owner_id 격리

---

## 7. 참고

- 토의 원본 (813줄): `docs/XPIPE_SCHEDULER_DESIGN_ARCHIVE.md`
  - 시나리오별 병목 분석, Gini 품질 검증, 교차 검증 결과, 메모리 최적화, 스케일업 설계 등
- 참여: Alex (기술), PM (기획), Gini (품질), Claude (종합)
