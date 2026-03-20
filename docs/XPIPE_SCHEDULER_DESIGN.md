# xPipe Scheduler 설계 문서

> 최종 업데이트: 2026-03-20
> 상태: **설계 토의 중** (구현 미착수)

---

## 1. 확정된 원칙

| 원칙 | 설명 |
|------|------|
| **큐잉은 xPipe 엔진의 책임** | 호출자(AIMS, xPipeWeb, CLI)는 큐를 신경 쓰지 않는다 |
| **업로드·저장은 호출자의 책임** | 파일 수집, 디스크/S3/GridFS 저장 모두 호출자가 처리. xPipe는 `file_path`만 받음 |
| **외부 종속성 금지** | xPipe 코어는 표준 라이브러리만. MongoDB/Redis/Celery 금지 |
| **미들웨어 독립적** | 특정 미들웨어에 종속되지 않음. 미들웨어는 코어 밖에서 어댑터로 주입 |
| **Producer-Consumer 패턴** | 호출자(Producer)가 파일을 저장하고 file_path를 전달, xPipe Worker(Consumer)가 큐에서 경로를 꺼내 처리. 파일시스템이 공유 저장소, 큐에는 경로(참조)만 흐름 |
| **단일 프로세스만으로는 안 됨** | 처리 용량 증설이 가능한 구조여야 함 |
| **AIMS MongoDB 큐는 최종 제거 대상** | xPipe 통합 과정에서 일시적 공존 허용 |

---

## 2. 현재 상태 (Phase 0)

### xPipeWeb
- `asyncio.create_task(_run_pipeline(...))` — 큐 없이 무제한 병렬
- 인메모리 documents dict — 서버 재시작 시 초기화
- 동시 10개 업로드 → 10개 파이프라인 동시 실행 → API rate limit 위험

### xPipe 코어
- `queue.py`: JobQueue ABC 정의됨. 구현체 없음.
- `store.py`: DocumentStore ABC 정의됨. 구현체 없음.
- `pipeline.py`: Pipeline.run() — 순차 async 실행. 큐 개념 없음.

### AIMS
- `UploadQueueService`: MongoDB 기반 큐. `pending → processing → completed/failed`.
- `ocr_worker.py`: Redis Stream 기반.

---

## 3. 제안 아키텍처: 3계층 구조

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: QueueBackend ABC (작업 큐잉)                    │
│  ├── InMemoryQueue (기본값, 소규모)                        │
│  ├── FileSystemQueue (영속화, 중규모, 표준 라이브러리)       │
│  └── [코어 밖] RedisQueue, MongoDBQueue (대규모)           │
├─────────────────────────────────────────────────────────┤
│  Layer 2: WorkerPool ABC (작업 실행)                      │
│  ├── AsyncWorkerPool (기본값, 단일 프로세스 asyncio)        │
│  └── ProcessWorkerPool (ProcessPoolExecutor, CPU-bound)  │
├─────────────────────────────────────────────────────────┤
│  Layer 3: Scheduler (큐 → 워커 연결)                      │
│  └── 큐에서 작업을 꺼내 워커 풀에 배분                       │
└─────────────────────────────────────────────────────────┘
```

### 호출자 인터페이스

```python
# 작업 제출 — 호출자가 알아야 하는 것은 이것뿐
job = Job(payload={"file_path": "/tmp/doc.pdf", "filename": "doc.pdf"})
job_id = await queue.put(job)
# 끝. 실행은 Scheduler가 담당.
```

### 스케일 전환 (코어 코드 변경 없이)

```python
# 소규모 (xPipeWeb)
queue = InMemoryQueue()
pool = AsyncWorkerPool(max_workers=2)

# CPU-bound 집중
pool = ProcessWorkerPool(max_workers=os.cpu_count())

# 영속화 필요
queue = FileSystemQueue(base_dir="/var/xpipe/queue")

# 대규모 (코어 밖 어댑터)
queue = RedisQueue(url="redis://...")
```

---

## 4. 시나리오별 병목 분석

| 시나리오 | 처리량 | 주 병목 | 해결 방안 |
|----------|--------|---------|----------|
| xPipeWeb (데모) | 1~10건/세션 | 없음 | 현재 구조로 충분 |
| AIMS 현재 | 수백 건/일 | API Rate Limit | Semaphore 동시성 제한 |
| AIMS 성장 | 수천 건/일 | 단일 프로세스 GIL | 멀티 워커 프로세스 |
| 엔터프라이즈 | 수만 건/일 | 서버 자체 한계 | 외부 인프라 (Redis Cluster, K8s) |

### 외부 인프라 불가피 시점

| 처리량 | 필요 인프라 |
|--------|-----------|
| ~500건/일 | 단일 프로세스 + Semaphore |
| ~2,000건/일 | 멀티 워커 프로세스 (표준 라이브러리) |
| ~5,000건/일 | Redis Cluster |
| ~10,000건/일 | MongoDB Replica Set |
| ~50,000건/일 | K8s + Object Storage + API Gateway |

---

## 5. Gini 품질 검증 결과 — FAIL

### Critical 이슈

#### C1. 스테이지 멱등성 미보장
- `Pipeline.run()`에서 재실행 시 이미 완료된 스테이지를 다시 실행
- EmbedStage가 외부 API 호출 후 크래시 → 재실행 시 이중 임베딩
- **해결 방향**: Stage ABC에 `is_idempotent` 속성 + `get_idempotency_key()` 메서드 추가. Pipeline.run()에서 완료 여부 확인 후 스킵.

#### C2. InMemoryBackend + MultiProcessWorker 잘못된 조합 방지 없음
- InMemoryQueue는 프로세스 간 공유 불가 (각 프로세스가 독립 메모리)
- 조합 시 작업 유실 + 중복 처리 동시 발생
- **해결 방향**: `Scheduler.__init__()`에서 조합 검증. InMemoryBackend + worker_count>1이면 `ValueError`.

### Major 이슈

#### M1. 인메모리 큐 크래시 시 작업 영구 유실
- 프로세스 재시작 = 큐 소멸. 문서화 없음.
- **해결 방향**: InMemoryQueue docstring에 "단일 프로세스 전용. 프로덕션 금지." 필수 기재.

#### M2. 배압(Backpressure) 계약 미정의
- `enqueue()` 시 큐가 가득 찼을 때 동작 불명확
- **해결 방향**: `maxsize` 초과 시 `QueueFullError` 발생 계약 명시. 또는 `EnqueueResult` 반환.

#### M3. `asyncio.get_event_loop()` Python 3.12 호환
- `events.py:261`에서 사용. Python 3.12에서 RuntimeError.
- **해결 방향**: `asyncio.get_running_loop()`로 교체.

#### M4. fork + asyncio 조합 함정
- Linux fork 후 자식 프로세스의 asyncio 루프 상태 오염
- logging lock 데드락 위험
- **해결 방향**: `multiprocessing.set_start_method("spawn")` 명시적 설정.

#### M5. 멀티 프로세스 통합 테스트 부재
- 현재 222개 테스트는 단일 프로세스만 검증
- **해결 방향**: Worker 구현체별 통합 테스트 별도 작성.

---

## 6. CPU-bound 작업 분산 방법

Pipeline.run() 자체는 async. CPU 병목은 스테이지 내부에서 발생.

```
Pipeline.run()                    ← async, 이벤트 루프
  └── ConvertStage.execute()      ← async
        └── subprocess(soffice)   ← CPU-bound, 블로킹 60초
```

**방안**: Stage 내부에서 `WorkerPool.submit_sync()`로 CPU-bound 함수만 별도 프로세스에 위임.

```python
class ConvertStage(Stage):
    async def execute(self, context):
        pool = context.get("_worker_pool")
        if pool:
            result = await pool.submit_sync(self._convert_real, context["file_path"])
        else:
            result = self._convert_real(context["file_path"])  # 하위 호환
```

- 워커 풀 있으면: 별도 프로세스에서 GIL 우회
- 워커 풀 없으면: 기존과 동일 (하위 호환)

---

## 7. AIMS 통합 로드맵

```
Phase 0 (현재): xPipeWeb에 Scheduler 적용
  - InMemoryQueue + AsyncWorkerPool
  - asyncio.create_task → scheduler.submit() 교체
  - max_concurrency 설정

Phase 1: AIMS에 xPipe 통합 시작
  - AIMS MongoDB 큐 + xPipe Scheduler 공존
  - MongoDBBackend(QueueBackend) — AIMS 측 구현체 (코어 밖)
  - UploadQueueService를 건드리지 않고 래핑

Phase 2: AIMS 자체 큐 제거
  - UploadQueueService → xPipe Scheduler로 완전 전환
  - MongoDB 큐 코드 제거
```

---

## 8. 오버 엔지니어링 경계

### 지금 하면 안 되는 것

| 항목 | 이유 |
|------|------|
| RabbitMQ, Kafka, Celery | AIMS 규모에서 운영 복잡도만 증가 |
| K8s / 컨테이너 오케스트레이션 | 단일 서버로 시나리오 2~3 대응 가능 |
| 우선순위 큐 | 현재 필요한 케이스 없음 |
| 분산 추적 (Jaeger, Zipkin) | 감사 로그로 충분 |
| DB 샤딩 | MongoDB 단일 노드가 수만 건/일까지 충분 |

### 지금 설계해야 하는 것 (오버 엔지니어링 아님)

| 항목 | 이유 |
|------|------|
| QueueBackend + WorkerPool ABC | 구현체 교체로 스케일링 |
| Backend+Worker 조합 검증 | 잘못된 조합 방지 |
| 스테이지 멱등성 계약 | 재시도 안전성의 전제 조건 |
| 배압 계약 | 큐 포화 시 호출자 행동 정의 |

---

## 9. 메모리 최적화 설계

### 핵심 원칙: 큐에는 경로만, 파일은 디스크에

```
큐 아이템 (~230 bytes):
  job_id, file_path, filename, file_size, mime_type, queued_at

파일 → 디스크 (temp_dir/{doc_id}_{filename})
텍스트 → 디스크 (temp_dir/{doc_id}.extracted.txt)
큐/context → 경로 참조만
```

### 현재 메모리 낭비 3대 문제

| 문제 | 현재 | 개선 |
|------|------|------|
| 파일 수신 | `file.read()` 50MB 통째로 | 64KB 청크 스트리밍 |
| 텍스트 3중 복사 | `extracted_text` + `text` + `stage_data.full_text` | 파일 참조, 실행 중에만 메모리 |
| documents dict 영구 보관 | 완료 후에도 텍스트 메모리 점유 | TTL 기반 정리, 파일 참조로 대체 |

### 절감 효과 (10개 문서 기준)

| 시나리오 | 현재 | 개선 후 | 절감률 |
|----------|------|---------|--------|
| 정상 상태 | ~11.4MB | ~210KB | 98% |
| 배치 업로드 피크 | ~100MB | ~64KB | 99.9% |

### 구현 우선순위

| 순위 | 항목 | 효과 |
|------|------|------|
| P0 | 스트리밍 파일 수신 (64KB 청크) | 배치 피크 100MB → 64KB |
| P0 | stage_data.extract.output.full_text 제거 | 처리 중 메모리 3x → 1x |
| P1 | extracted_text 파일 참조화 | documents dict 영구 메모리 제거 |
| P1 | SSE 이벤트 payload 경량화 | 이벤트 버퍼 메모리 절감 |
| P2 | TTL 기반 자동 정리 (30분: 데이터, 2시간: 항목) | 무한 메모리 성장 방지 |
| P2 | 파일 서빙 StreamingResponse | 서빙 시 메모리 5MB → 64KB |

### 파이프라인 실행 중 텍스트 처리 흐름

```
extract 스테이지:
  텍스트 추출 → 파일에 저장 + context에 보유 (후속 스테이지 사용)

classify/detect/embed 스테이지:
  context["extracted_text"]에서 텍스트 읽기 (파이프라인 실행 중에만 메모리)

파이프라인 완료 후:
  context 해제 (GC) → 텍스트 메모리 반환
  documents dict에는 파일 경로만 저장
  /api/text/{doc_id} 요청 시 파일에서 lazy-load
```

---

## 10. 에러 처리 전략

### 역할 분리

| 레벨 | 책임 |
|------|------|
| **Stage** | 개별 단계 실행. 예외를 throw |
| **Pipeline** | skip_on_error 정책 적용 (이미 구현됨). 스테이지 에러를 context에 기록, 스킵 또는 중단 |
| **Scheduler** | Pipeline 예외만 받아 Job 상태 관리. **재시도 정책은 Scheduler 소관** |

### Scheduler 에러 정책
- 재시도 횟수 (`max_retries`): Pipeline RuntimeError 시 N회까지 재실행
- 재시도 간격 (`retry_delay`): 고정 간격 (지수 백오프는 Phase 2)
- 최종 실패 시: Job 상태를 `failed`로 전환, 에러 정보 기록

---

## 11. 취소 (Cancellation)

### 상태별 취소 방법

| 상태 | 취소 방법 |
|------|-----------|
| **큐 대기 중** (queued) | 큐에서 제거 또는 `cancelled` 표시 후 dequeue 시 스킵 |
| **처리 중** — 스테이지 간 | `_cancelled` 플래그 체크 (현재 방식 유지) |
| **처리 중** — 스테이지 실행 중 | `asyncio.Task.cancel()`. Stage가 `CancelledError`를 받으면 정리 후 전파 |

### Job 상태에 `cancelled` 추가

```
queued → processing → completed
                   → failed
                   → cancelled  ← 신규
```

취소된 Job은 재시도 대상에서 제외.

### 취소 시 정리
- 임시 파일/중간 결과물 삭제
- API 호출 중 취소 시 과금은 불가피 (이미 서버에 도달한 요청)

---

## 12. 순서 보장

| 요구사항 | 보장 여부 | 근거 |
|---------|----------|------|
| FIFO dequeue | **보장** | asyncio.Queue 기본 특성 |
| FIFO 완료 | **보장 안 함** | 멀티 워커 시 처리 시간이 다르므로 완료 순서 다름 |
| 호출자 순서 의존 | **금지** | Job ID로 개별 결과 조회 패턴 사용 |

배치 전체 완료 후 통합 처리가 필요하면 Job Group 개념을 별도 설계 (현재 범위 밖).

---

## 13. 결과 전달 방법

### 호출자별 방식

| 호출자 | 현재 | 통합 후 | 변경 |
|--------|------|---------|------|
| xPipeWeb | SSE | SSE 유지 | 없음 |
| AIMS | MongoDB 폴링 | MongoDB 폴링 유지 (어댑터 훅이 업데이트) | 없음 |
| CLI | 없음 | `asyncio.run()` 동기 대기 + `--timeout` | 신규 |
| 미래 호출자 | 없음 | 웹훅 (Phase 6-A) | Phase 6-A |

### 동기 vs 비동기
- CLI만 동기 대기 필요 (사람이 터미널에서 기다림)
- 나머지는 비동기 모드로 충분

### ProcessWorkerPool IPC 방안
- 대부분 스테이지가 I/O-bound → asyncio 코루틴으로 충분 (방안 A)
- CPU-bound 작업만 `run_in_executor(ProcessPoolExecutor)`로 오프로드 (방안 B)
- EventBus는 메인 프로세스에 유지, executor 결과를 메인에서 이벤트 발행

---

## 14. 설정 변경 영향 범위 (교차 검증 반영)

### 스냅샷 전략 — 확정

1. **Scheduler.submit_file() 내부에서 `copy.deepcopy(config)` 수행** (호출자 책임 아님)
2. **`_run_pipeline(doc_id, ..., config_snapshot)` 시그니처 변경** — config_snapshot을 인자로 받음
3. 함수 내부의 `current_config` 직접 참조 **6곳을 config_snapshot으로 전환**

### current_config 직접 참조 6곳 (수정 대상)

| 라인 | 코드 | 수정 방법 |
|------|------|-----------|
| 181 | `current_config.get("enabled_stages")` | `config_snapshot.get("enabled_stages")` |
| 197~199 | `current_config['mode']`, `current_config['adapter']` | `config_snapshot[...]` |
| 212 | `current_config.get("enabled_stages")` | `config_snapshot.get("enabled_stages")` |
| 225~226 | `current_config.get("api_keys")` | `config_snapshot.get("api_keys")` |
| 267 | `current_config["mode"]` | `config_snapshot["mode"]` |
| 280 | `current_config.get("quality_gate")` | `config_snapshot.get("quality_gate")` |

### max_concurrency 동적 변경

`asyncio.Semaphore`는 런타임 값 변경 불가. 대안:

```python
class Scheduler:
    _running: int = 0
    _max_concurrency: int = 2

    def set_max_concurrency(self, n: int) -> None:
        self._max_concurrency = n
        # 다음 작업 디큐 시점부터 반영

    async def _can_start_next(self) -> bool:
        return self._running < self._max_concurrency
```

### 얕은 복사 수정

`_create_doc_entry()`의 `"config": dict(current_config)` → `copy.deepcopy(config_snapshot)` 로 교체.

---

## 15. 보안

### 경로 조작 (Path Traversal)

**설계 결정**: xPipe는 신뢰된 내부 서비스에서만 호출된다는 가정. 경계 방어는 호출자(AIMS API 레이어 등)에서 담당.

이 가정을 `queue.py` 모듈 docstring과 설계 문서에 명시한다.

만약 외부 호출 가능성이 생기면, IngestStage 진입점에서 `allowed_base_dir` 기반 경로 검증 추가.

### 호출자 간 격리

- 파일 격리: xPipe 레벨 불필요. OS 파일시스템 권한 또는 AIMS MongoDB 레이어에서 담당
- 큐 취소/조회: `owner_id` 기반 격리 필수. Scheduler의 `cancel(job_id, owner_id)`, `get_job(job_id, owner_id)` 시그니처에 반영

### 임시 파일 정리

- `converted_pdf_path`가 처리 완료 후 미삭제 — **민감 문서 잔존 위험**
- CompleteStage 또는 Pipeline.run() 완료 후 중간 파일 삭제 로직 필요

---

## 16. ABC 인터페이스 (확정안 — 교차 검증 반영)

### Job 데이터 클래스

```python
class JobStatus(Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

@dataclass
class Job:
    job_id: str                              # UUID (Scheduler가 생성)
    file_path: str
    filename: str
    owner_id: Optional[str] = None           # 호출자 격리용 (AIMS: designer_id)
    status: JobStatus = JobStatus.QUEUED
    config_snapshot: dict[str, Any] = field(default_factory=dict)  # Scheduler가 deepcopy
    context: dict[str, Any] = field(default_factory=dict)
    result: Optional[dict[str, Any]] = None
    error: Optional[str] = None
    error_stage: Optional[str] = None
    retry_count: int = 0
    created_at: float = 0.0
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
```

### QueueBackend ABC

```python
class QueueFullError(Exception):
    """큐가 가득 찬 경우 발생"""
    pass

class QueueBackend(ABC):
    @abstractmethod
    async def put(self, job: Job) -> None:
        """작업을 큐에 추가. Raises: QueueFullError (maxsize 초과 시)"""

    @abstractmethod
    async def get(self, timeout: float = 5.0) -> Optional[Job]:
        """큐에서 작업 하나를 꺼냄. timeout 후 None"""

    @abstractmethod
    async def remove(self, job_id: str) -> bool:
        """큐 대기 중인 작업 제거 (취소용)"""

    @abstractmethod
    def qsize(self) -> int:
        """현재 큐 크기"""
```

### WorkerPool ABC

```python
class WorkerPool(ABC):
    @abstractmethod
    async def start(self, num_workers: int) -> None: ...

    @abstractmethod
    async def shutdown(self, wait: bool = True) -> None: ...

    @abstractmethod
    async def submit(self, job: Job) -> None: ...

    @abstractmethod
    def active_count(self) -> int: ...

    @abstractmethod
    async def cancel_job(self, job_id: str) -> bool: ...
```

### Stage ABC 확장 (멱등성)

```python
class Stage(ABC):
    is_idempotent: bool = True
    """True면 동일 입력으로 여러 번 실행해도 안전.
    기본 True. ClassifyStage(LLM 호출)만 False로 오버라이드."""
```

### SchedulerStats 데이터 클래스

```python
@dataclass
class SchedulerStats:
    queued: int
    processing: int
    completed: int
    failed: int
    cancelled: int
    total_processed: int
    avg_processing_sec: float
    throughput_per_min: float
    uptime_sec: float
```

### Scheduler

```python
class Scheduler:
    def __init__(self, queue: QueueBackend, pool: WorkerPool,
                 event_bus: Optional[EventBus] = None,
                 default_config: Optional[dict] = None,
                 max_retries: int = 0, retry_delay: float = 5.0):
        """
        Args:
            default_config: submit_file() 시 자동 스냅샷할 기본 설정.
                           Scheduler가 내부에서 deepcopy 수행.
        """

    async def start(self) -> None: ...
    async def shutdown(self, wait: bool = True) -> None: ...

    # 간편 인터페이스 (xPipeWeb, CLI용)
    async def submit_file(self, file_path: str, filename: str,
                          config: Optional[dict] = None,
                          owner_id: Optional[str] = None,
                          context: Optional[dict] = None) -> str:
        """파일 경로로 작업 제출. job_id 자동 생성, config deepcopy 내부 수행."""

    # 고급 인터페이스 (AIMS 어댑터용)
    async def submit(self, job: Job) -> str:
        """Job 객체 직접 제출. config_snapshot이 비어있으면 default_config deepcopy."""

    async def cancel(self, job_id: str, owner_id: Optional[str] = None) -> bool:
        """작업 취소. owner_id 지정 시 본인 소유 Job만 취소 가능."""

    def get_job(self, job_id: str, owner_id: Optional[str] = None) -> Optional[Job]:
        """작업 조회. owner_id 지정 시 본인 소유 Job만 조회 가능."""

    def get_stats(self) -> SchedulerStats: ...

    def set_max_concurrency(self, n: int) -> None:
        """동시 실행 수 동적 변경. 다음 작업 디큐 시점부터 반영."""
```

---

## 17. 모니터링

### 필요한 최소 집합

| 정보 | 인터페이스 |
|------|-----------|
| 문서별 상태 | `Scheduler.get_job(job_id)` / REST `/status/{doc_id}` (기존) |
| 전체 요약 통계 | `Scheduler.get_stats()` / REST `/api/stats` |
| 실시간 이벤트 | EventBus + SSE (기존) |

### 불필요한 것 (오버 엔지니어링)
- 워커 수(active/idle) 노출: asyncio에서 "워커"는 Task이며 처리량이 더 의미 있음
- Redis XINFO 노출: 호출자가 인프라 세부사항을 알 필요 없음
- Jaeger / OpenTelemetry: 현재 규모에서 불필요

---

## 18. Gini 품질 검증 결과 (2차) — FAIL

### 미해결 이슈 5건

| # | 심각도 | 이슈 | 해결 방향 |
|---|--------|------|-----------|
| 1 | Major | Path Traversal 방어 책임 미명시 | 설계 문서에 "신뢰된 내부 서비스" 가정 명시 |
| 2 | Major | 임시 변환 파일 미삭제 (민감 문서 잔존) | CompleteStage에서 정리 로직 추가 |
| 3 | Major | Stage ABC에 멱등성 표시 없음 | `is_idempotent` 속성 추가 |
| 4 | Major | Backend+Worker 조합 검증 없음 | Scheduler 생성자에서 검증 |
| 5 | Major | enqueue() 배압 계약 미정의 | `QueueFullError` 예외 + 계약 명시 |

---

## 19. 교차 검증 결과

### PM → Alex ABC 설계 검토

| 항목 | 판정 | 조치 |
|------|------|------|
| `submit()` 인터페이스 | 개선 필요 | `submit_file(file_path, filename, config)` 팩토리 메서드 추가. Job 직접 생성도 허용 (고급) |
| config_snapshot deepcopy | **결함** | 호출자가 아닌 **Scheduler 내부에서 deepcopy**. 캡슐화 원칙 |
| `get_stats()` 반환 형태 | 개선 필요 | `SchedulerStats` dataclass로 스키마 확정 (dict → 타입 안전) |
| `cancel()`에 owner_id 부재 | **Critical** | `cancel(job_id, owner_id=None)`, `get_job(job_id, owner_id=None)` — 지금 시그니처에 반영 |
| 결과 전달 | 충분 | EventBus + SSE 기존 경로 유지. 콜백 등록은 오버 엔지니어링 |

### Alex → PM 모니터링 실현 가능성

| 항목 | 판정 | 근거 |
|------|------|------|
| `get_stats()` O(N) 순회 | **충분** | 1,000건 기준 ~0.1ms. 카운터 기반 O(1)은 동기화 버그 위험 대비 이득 미미 |
| 처리 속도(건/분) | **구현 가능** | `collections.deque` + `time.monotonic()` 슬라이딩 윈도우. 표준 라이브러리만 |
| REST `/api/stats` | ~15줄 추가 | Scheduler 구현 시 함께 |

### Alex → Gini 보안 이슈 구현 방안

| 이슈 | 구현 방안 | 변경 줄 수 |
|------|-----------|-----------|
| Path Traversal | docstring 명시 (P0). 코드 방어는 외부 API 노출 시점(P2)에 | ~3줄 |
| 임시 파일 미삭제 | `remove_document()`에서 `converted_pdf_path` 삭제 | ~10줄 |
| Stage 멱등성 | `is_idempotent = True` 기본값, ClassifyStage만 `False` | ~6줄 |
| 조합 검증 | Scheduler `__init__()`에서 `isinstance` + `validate()` | ~15줄 |
| 배압 계약 | `QueueFullError` + `InMemoryQueue(maxsize=1000)` | ~37줄 |

### Gini → Alex 설정 스냅샷 검증 — FAIL

| 이슈 | 심각도 | 내용 |
|------|--------|------|
| `_run_pipeline` 내 `current_config` 직접 참조 **6곳** | **Major** | 스냅샷을 Job에 저장해도, 함수 내부가 current_config를 직접 읽으면 격리 무효 |
| `asyncio.Semaphore` 런타임 변경 불가 | **Major** | `max_concurrency` 즉시 반영 불가. 정수 카운터 기반으로 대체 필요 |
| `dict(current_config)` 얕은 복사 | Minor | `deepcopy`로 교체 필요 |
| `stages_detail` 초기화 기준 불일치 | Minor | config_snapshot 기준으로 변경 필요 |

**해결 방향:**
1. `_run_pipeline(doc_id, ..., config_snapshot: dict)` — current_config 참조 6곳을 config_snapshot으로 전환
2. Semaphore 대신 `_running: int` + `_max_concurrency: int` 카운터 기반 스케줄러
3. `_create_doc_entry`의 `dict()` → `copy.deepcopy()`
4. `stages_detail` 초기화를 config_snapshot 기준으로

---

## 20. 미해결 질문

- [ ] FileSystemQueue의 구체적 설계 (디렉토리 구조, 락 전략, 원자적 이동)
- [ ] ProcessWorkerPool에서 EventBus 연동 상세 (CPU-bound 스테이지 결과 → 메인 프로세스 이벤트)
- [ ] 스테이지 멱등성 키 설계 (어떤 값으로 "이미 완료"를 판단하는가?)
- [ ] 멀티 프로세스 시 설정(current_config) 동기화 방안
- [ ] Graceful shutdown — 진행 중 작업 완료 대기 vs 즉시 종료
- [ ] Job Group 개념 (배치 전체 완료 후 통합 처리)
- [ ] `cancel(job_id, owner_id)` — owner_id 격리 계약을 ABC에 반영할 시점

---

## 참여자

| 역할 | 의견 요약 |
|------|----------|
| **Alex** | 3계층 구조 설계. 에러/취소/순서/설정 변경/결과 전달/ABC 인터페이스 기술 설계. |
| **PM** | 시나리오별 병목 분석. 모니터링 최소 집합 정의. 결과 전달 호출자별 요구사항 정리. |
| **Gini** | FAIL 판정 2회. 보안(경로 조작, 임시 파일), 멱등성, 조합 검증, 배압 계약 등 결함 식별. |
| **Claude** | 종합 정리. 원칙 확정 (외부 종속성 금지, 미들웨어 독립, Producer-Consumer). |
