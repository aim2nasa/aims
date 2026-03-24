# xPipeWeb 어댑터 연결 기능 개선 계획서

> 작성일: 2026-03-24
> 상태: v2 (Gini/Alex 검토 반영, Phase 1 PoC 완료)

---

## 1. 현황 분석

### 아키텍처 구조

```
xPipe (코어)
├── adapter.py          ← DomainAdapter ABC 정의 (플러그인 인터페이스)
├── stages/
│   ├── classify.py     ← _classify_config 있으면 분류 실행, 없으면 skip
│   └── detect_special.py ← _domain_adapter 있으면 감지 실행, 없으면 skip
└── console/web/
    └── server.py       ← 설정에 adapter/adapter_module/adapter_class 필드 존재

AIMS (보험 도메인)
└── insurance/adapter.py ← InsuranceDomainAdapter (DomainAdapter 구현체)
```

### 현재 상태

| 항목 | 상태 | 비고 |
|------|------|------|
| DomainAdapter ABC | 완성 | 6개 추상 메서드 + 2개 기본 구현 |
| InsuranceDomainAdapter | 완성 | 분류(23유형) + AR/CRS 감지 + 후크 |
| server.py 설정 필드 | 존재 | `adapter`, `adapter_module`, `adapter_class` |
| `_inject_adapter_config()` | 완성 | 동적 import + context 주입 |
| classify 스테이지 | 완성 | `_classify_config` 기반 분기 |
| detect_special 스테이지 | 완성 | `_domain_adapter` 기반 분기 |
| **xPipeWeb UI** | **미구현** | 어댑터 선택 UI가 "없음"으로 고정 |
| **설정 API 검증** | **미검증** | adapter 설정 변경 API 동작 미확인 |
| **모듈 경로 화이트리스트** | **미구현** | 임의 경로가 importlib에 전달됨 |
| **설정 스냅샷 격리** | **미구현** | 공유 딕셔너리 직접 참조 (race condition) |

### 핵심 발견

**인프라는 이미 95% 갖춰져 있다.** 백엔드(`server.py`)에 어댑터 동적 로딩 로직이 구현되어 있고, classify/detect 스테이지도 어댑터 존재 시 자동으로 활성화된다. 누락된 것은 **UI 진입점 + 보안 검증 + 동시성 안전**이다.

---

## 2. 전제 조건 (Phase 1 PoC 이전에 확인 필수)

> Gini 검토에서 "리스크"로 분류되었던 항목 중 Phase 1 차단 요인을 전제 조건으로 격상

### 2-1. import 경로 해석

xPipeWeb은 `document_pipeline/`에서 `python -m xpipe.console.web.server`로 실행된다. 이 경우 `sys.path[0]`은 `document_pipeline/`이므로 `insurance.adapter`는 `document_pipeline/insurance/adapter.py`로 해석 **가능**하다.

**단, 모듈 로딩 시 최상위 import가 모두 성공해야 한다:**
- `from xpipe.adapter import ...` → 정상 (같은 패키지)
- `import httpx` → **httpx가 설치되어 있어야 함** (미설치 시 어댑터 클래스 자체 import 불가)
- `from config import get_settings` → 모듈 해석은 되나, 환경변수 미설정 시 런타임 에러

### 2-2. InsuranceDomainAdapter 메서드별 외부 의존성

| 메서드 | 외부 의존성 | xPipeWeb 독립 실행 시 |
|--------|------------|----------------------|
| `get_classification_config()` | 없음 (상수 반환) | **정상** |
| `detect_special_documents()` | 없음 (순수 텍스트 분석) | **정상** |
| `generate_display_name()` | 없음 | **정상** |
| `extract_domain_metadata()` | 없음 (현재 빈 dict 반환) | **정상** |
| `resolve_entity()` | httpx + config + AIMS API | **실패** |
| `on_stage_complete()` | SSE, DB, config | **실패** |

**결론:** 핵심 기능(분류/감지)은 외부 의존성 없이 동작한다. `resolve_entity()`/`on_stage_complete()`는 graceful degradation으로 처리한다.

### 2-3. httpx 모듈 레벨 import 문제

`insurance/adapter.py` 최상위에 `import httpx`가 있다. httpx가 xPipeWeb 환경에 설치되어 있지 않으면 **어댑터 클래스 로딩 자체가 `ImportError`로 실패**한다.

**PoC 결과:** httpx v0.28.1 설치 확인 — **문제 없음** (방안 A 자동 충족)

---

## 3. 목표

xPipeWeb 사용자가 외부 어댑터(예: `insurance.adapter.InsuranceDomainAdapter`)를 UI에서 지정하면, 해당 어댑터의 분류 체계와 감지 규칙을 사용하여 문서를 처리할 수 있도록 한다.

### 범위

- xPipeWeb UI에 어댑터 설정 입력 활성화
- 어댑터 연결 시 classify/detect 스테이지 자동 활성화 확인
- 어댑터 연결/해제 시 UI 피드백 (분류 결과 표시 등)
- **모듈 경로 화이트리스트 검증** (보안)
- **설정 스냅샷 격리** (동시성 안전)
- **어댑터 연결 실패 시 사용자 통지** (무음 처리 방지)
- 기존 adapter="none" 동작에 영향 없음 (하위 호환)

### 범위 밖

- 새로운 어댑터 개발 (기존 InsuranceDomainAdapter 활용)
- DomainAdapter ABC 인터페이스 변경
- 파이프라인 스테이지 실행 순서 변경

---

## 4. 구현 계획

### Phase 1: 현행 동작 검증 (PoC)

> 목적: UI 없이 API만으로 어댑터 연결이 실제로 동작하는지 확인

#### 1-1. 설정 API로 어댑터 지정 테스트

```bash
# xPipeWeb 설정 API를 통해 insurance adapter 지정
curl -X POST http://localhost:8100/xpipe/web/config \
  -H "Content-Type: application/json" \
  -d '{
    "adapter": "insurance",
    "adapter_module": "insurance.adapter",
    "adapter_class": "InsuranceDomainAdapter"
  }'
```

**검증 항목:**
- [ ] 설정이 정상 저장되는지
- [ ] `import httpx`가 xPipeWeb 환경에서 성공하는지 (미설치 시 방안 A/B 결정)
- [ ] `from config import get_settings`가 환경변수 미설정 시 어떻게 동작하는지
- [ ] `_inject_adapter_config()`가 모듈을 동적 로딩하는지
- [ ] import 경로 해석이 정상인지 (xPipeWeb 실행 위치 기준)
- [ ] classify 스테이지가 skip → completed로 전환되는지
- [ ] detect_special 스테이지가 skip → completed로 전환되는지
- [ ] `on_stage_complete()` 후크가 현재 파이프라인에서 호출되는지 (호출 경로 확인)

#### 1-2. 한계점 식별

- [ ] httpx 미설치 시 어댑터 로딩 자체 불가 여부
- [ ] `config.get_settings()` 실패 시 어댑터 인스턴스화 가능 여부
- [ ] `resolve_entity()` 호출 시점과 실패 시 파이프라인 영향 범위
- [ ] `on_stage_complete()` 호출 여부 — 호출되지 않는다면 어댑터 연결해도 후크 미동작

**PoC 결과에 따라 Phase 2 진행 여부 결정.**

#### 1-3. PoC 실행 결과 (2026-03-24)

> 실행 환경: tars 서버, xPipeWeb :8200 (real 모드, gpt-4.1-mini)

**설정 변경:**
```bash
curl -X PUT http://localhost:8200/api/config \
  -H "Content-Type: application/json" \
  -d '{"adapter":"insurance","adapter_module":"insurance.adapter","adapter_class":"InsuranceDomainAdapter"}'
# → 200 OK: "설정이 업데이트되었습니다 (다음 업로드부터 적용)"
```

**테스트 문서:** `xpipe_test.txt` ("This is a test insurance policy document for coverage analysis.")

**검증 항목 결과:**

| 검증 항목 | 결과 | 상세 |
|-----------|------|------|
| 설정 API 저장 | **PASS** | adapter/module/class 모두 정상 저장 |
| httpx 설치 여부 | **PASS** | v0.28.1 설치됨 |
| import 경로 해석 | **PASS** | `insurance.adapter` → `InsuranceDomainAdapter` 로딩 성공 |
| classify 활성화 | **PASS** | `status: "completed"`, `document_type: "policy"`, `confidence: 0.9` |
| detect_special 활성화 | **PASS** | `status: "completed"`, `method: "adapter"`, 감지 0건 (일반 텍스트라 정상) |
| 어댑터 해제 복귀 | **PASS** | `adapter: "none"`으로 정상 복귀 |
| on_stage_complete | **해당 없음** | xPipeWeb 파이프라인 코어에서 미호출 확정 (코드 확인) |

**classify stage_data:**
```json
{
  "status": "completed",
  "duration_ms": 1697,
  "input": { "text_length": 64, "model": "gpt-4.1-mini" },
  "output": {
    "document_type": "policy",
    "confidence": 0.9,
    "tokens": { "prompt_tokens": 258, "completion_tokens": 14, "total_tokens": 272 }
  }
}
```

**detect_special stage_data:**
```json
{
  "status": "completed",
  "duration_ms": 0,
  "method": "adapter",
  "input": { "text_length": 64, "adapter": "InsuranceDomainAdapter" },
  "output": { "detected_type": "-", "detections_count": 0, "detections": [] }
}
```

**결론:** 코드 변경 없이 설정 API만으로 어댑터 연결이 완벽히 동작한다. **Phase 2 진행 승인.**

---

### Phase 2: 보안 강화 + 테스트 API (백엔드)

> Phase 순서 변경: 기존 Phase 3(테스트 API)를 Phase 2로 앞당김.
> UI의 "연결 테스트" 버튼이 이 API에 의존하므로, UI(Phase 3)보다 먼저 구현한다.

#### 2-1. 모듈 경로 화이트리스트 (Critical — Gini #1)

`adapter_module`에 임의 Python 모듈 경로가 `importlib.import_module()`에 전달되면 **임의 코드 실행이 가능**하다. 설정 저장 시 화이트리스트 검증을 추가한다.

```python
# server.py — 허용된 어댑터 모듈 접두사
ALLOWED_ADAPTER_PREFIXES = ("insurance.", "xpipe.")

# ConfigUpdate 모델에 validator 추가
if body.adapter_module is not None:
    if body.adapter_module and not any(
        body.adapter_module.startswith(p) for p in ALLOWED_ADAPTER_PREFIXES
    ):
        raise HTTPException(400, f"허용되지 않는 모듈 경로: {body.adapter_module}")
    current_config["adapter_module"] = body.adapter_module
```

#### 2-2. 설정 스냅샷 격리 (Major — Gini #2)

`state.current_config`는 모듈 레벨 공유 딕셔너리다. 파이프라인 실행 중 다른 요청이 설정을 변경하면 race condition이 발생한다 (`MAX_CONCURRENCY=2`이므로 실제 가능).

**수정:** context 구성 시점에 어댑터 설정도 스냅샷으로 복사한다.

```python
# _run_pipeline() — context 구성 단계
context: dict[str, Any] = {
    ...
    "adapter_name": current_config["adapter"],
    "adapter_module": current_config.get("adapter_module", ""),   # 추가
    "adapter_class": current_config.get("adapter_class", ""),     # 추가
    ...
}

# _inject_adapter_config() — state.current_config 대신 context에서 읽기
module_path = context.get("adapter_module", "")  # 변경
class_name = context.get("adapter_class", "")    # 변경
```

#### 2-3. 어댑터 인스턴스 캐싱 (Alex #4)

매 파이프라인 실행마다 어댑터를 새로 인스턴스화한다 (문서 100건 → 100번 생성). `state`에 어댑터 인스턴스를 캐싱하고, 설정 변경 시에만 재생성한다.

```python
# state 객체에 캐시 추가
state.cached_adapter = None
state.cached_adapter_key = ""  # "module:class" 형태

# _inject_adapter_config()에서 캐시 활용
cache_key = f"{module_path}:{class_name}"
if state.cached_adapter_key == cache_key and state.cached_adapter is not None:
    adapter = state.cached_adapter
else:
    adapter = adapter_cls()
    state.cached_adapter = adapter
    state.cached_adapter_key = cache_key
```

#### 2-4. 어댑터 연결 실패 사용자 통지 (Major — Gini #3)

현재 `_inject_adapter_config()`의 `except Exception`은 `logger.error`만 기록한다. 파이프라인 결과에 `adapter_status` 필드를 추가하여 UI에서 실패를 표시한다.

```python
# 어댑터 로딩 성공 시
context["_adapter_status"] = {"connected": True, "name": adapter_name}

# 어댑터 로딩 실패 시
context["_adapter_status"] = {
    "connected": False,
    "name": adapter_name,
    "error": str(e),  # 한국어 오류 메시지
}

# 결과에 반영
doc["result"]["adapter_status"] = context.get("_adapter_status", {"connected": False})
```

#### 2-5. 어댑터 연결 테스트 엔드포인트

설정 저장 전 어댑터가 유효한지 사전 검증한다. **테스트 시 사이드 이펙트 주의:** `get_classification_config()`만 호출하고, DB/네트워크 의존 메서드는 호출하지 않는다.

```
POST /xpipe/web/adapter/test
Body: { "adapter_module": "...", "adapter_class": "..." }
Response: {
    "success": true/false,
    "adapter_name": "InsuranceDomainAdapter",
    "capabilities": {
        "classification": true,
        "detection": true,
        "entity_resolution": true,
        "display_name": true
    },
    "classification_categories_count": 23,
    "error": null  // 실패 시 한국어 오류 메시지
}
```

**동작 방식:**
1. 화이트리스트 검증 (2-1과 동일 로직)
2. 모듈 동적 import 시도
3. 클래스 인스턴스화 시도
4. `get_classification_config()` 호출하여 분류 체계 확인 (사이드 이펙트 없음)
5. 각 추상 메서드 구현 여부 확인 (호출하지 않고 `hasattr` + callable 체크만)
6. 결과 반환

**설정 저장 시에도 사전 검증:** `update_config()`에서 어댑터 설정 변경 시, 저장 전 `importlib.import_module()` 검증을 수행한다. 잘못된 경로가 저장되어 파이프라인 실행 시점에서야 실패하는 것을 방지한다.

---

### Phase 3: xPipeWeb UI 개선

#### 3-1. 어댑터 설정 UI — 프리셋 + 사용자 지정 (Alex #5-4)

매번 모듈/클래스를 수동 입력하는 것은 UX가 좋지 않다. 프리셋 방식을 기본으로 하고, 사용자 지정도 지원한다.

```html
<div class="adapter-config">
    <label>어댑터</label>
    <select id="adapter-select">
        <option value="none">없음 (범용 모드)</option>
        <option value="insurance"
                data-module="insurance.adapter"
                data-class="InsuranceDomainAdapter">
            보험 도메인
        </option>
        <option value="custom">사용자 지정...</option>
    </select>

    <!-- 프리셋 선택 시: readonly로 자동 채움 -->
    <!-- "사용자 지정" 선택 시: 직접 입력 가능 -->
    <div id="adapter-fields" class="hidden">
        <input id="adapter-module" placeholder="모듈 경로 (예: insurance.adapter)" />
        <input id="adapter-class" placeholder="클래스명 (예: InsuranceDomainAdapter)" />
        <button id="adapter-test">연결 테스트</button>
        <span id="adapter-status"></span>
    </div>
</div>
```

프리셋 선택 시 module/class 필드를 `data-*` 속성에서 자동 채우고 readonly로 전환한다.

#### 3-2. 어댑터 연결 상태 표시

- **연결 성공:** 분류 체계 정보 표시 (카테고리 수, 감지 규칙 유무)
- **연결 실패:** 오류 메시지 (모듈 미발견, 클래스 미발견, httpx 미설치 등)
- **파이프라인 결과:** `adapter_status` 필드 기반으로 연결 여부 표시

#### 3-3. 결과 화면 개선

어댑터 연결 시 문서 처리 결과에 추가 표시:
- `document_type`: 분류된 문서 유형
- `classification_confidence`: 신뢰도
- `detections`: 특수문서 감지 결과 (유형, 신뢰도)
- `adapter_status`: 어댑터 연결 성공/실패 여부 + 실패 시 오류 메시지

---

## 5. 기술적 고려사항

### Import 경로 해석

xPipeWeb이 `document_pipeline/`에서 실행되므로 `sys.path[0]`은 `document_pipeline/`이다. `insurance.adapter`는 `document_pipeline/insurance/adapter.py`로 해석된다.

**주의:** 모듈 로딩 성공 ≠ 모든 기능 동작. 최상위 import(`httpx`, `config`)가 성공해야 모듈 로딩이 가능하고, 개별 메서드 내부의 의존성(`aims_api` 접근 등)은 호출 시점에서 실패할 수 있다.

### 하위 호환성

- `adapter="none"` (기본값) 동작은 변경 없음
- 기존 테스트(`test_adapter_none_pipeline_runs_with_defaults`) 통과 유지
- UI 변경은 기존 "없음" 상태를 기본값으로 유지
- 어댑터 해제(none 복귀) 시 새 파이프라인 실행에서 `_classify_config`, `_domain_adapter`가 주입되지 않음 (매 실행마다 새 context 생성이므로 잔류 없음)

### on_stage_complete 호출 경로 (Alex #5-5) — 확정

xPipeWeb 파이프라인 코어(`pipeline.py`, `stages/*.py`)에서 `on_stage_complete`를 호출하는 코드가 없음을 코드 grep으로 확정했다. ABC에 인터페이스만 정의되어 있고, AIMS 메인 파이프라인에서만 호출하는 구조다. **xPipeWeb에서는 어댑터를 연결해도 `on_stage_complete` 후크는 동작하지 않으며, 이번 범위에서 제외한다.**

---

## 6. 테스트 계획

### 기능 테스트

| 테스트 | 유형 | 검증 내용 |
|--------|------|----------|
| 어댑터 없이 파이프라인 실행 | 회귀 | classify/detect skipped, 나머지 정상 |
| 어댑터 설정 API | 통합 | adapter/module/class 설정 저장·로딩 |
| 어댑터 연결 테스트 API | 단위 | 모듈 로딩 성공/실패 분기 |
| 어댑터 연결 후 파이프라인 | E2E | classify completed + 분류 결과 반환 |
| 어댑터 연결 후 감지 | E2E | detect_special completed + 감지 결과 |
| 어댑터 해제 (none 복귀) | 회귀 | 다시 skip 상태로 복귀, context 잔류 없음 |

### 보안 테스트 (Gini #1, #4)

| 테스트 | 유형 | 검증 내용 |
|--------|------|----------|
| 허용되지 않는 모듈 경로 입력 | 보안 | 400 에러 반환, import 실행 안 됨 |
| 경로 우회 시도 (`../../os`) | 보안 | 화이트리스트에 의해 차단 |
| `__import__` 등 메타 모듈 경로 | 보안 | 접두사 검증에 의해 차단 |

### 동시성 테스트 (Gini #2)

| 테스트 | 유형 | 검증 내용 |
|--------|------|----------|
| 동시 업로드 2건 중 어댑터 설정 변경 | 동시성 | 각 파이프라인이 독립된 설정 스냅샷으로 실행 |
| 어댑터 설정 변경 직후 즉시 업로드 | 동시성 | 새 설정으로 실행됨 (캐시 무효화 확인) |

### 에러 경로 테스트 (Gini #3)

| 테스트 | 유형 | 검증 내용 |
|--------|------|----------|
| 잘못된 모듈 경로 지정 | 에러 | 한국어 오류 메시지 반환 |
| 어댑터 get_classification_config() 예외 | 에러 | 파이프라인이 어댑터 없이 계속 + adapter_status에 오류 표시 |
| 어댑터 detect_special_documents() 예외 | 에러 | 감지 스테이지 error 기록 + 파이프라인 계속 |
| 설정 저장 시 모듈 사전 검증 실패 | 에러 | 400 에러, 잘못된 설정이 저장되지 않음 |

---

## 7. 작업 순서 요약

```
전제 조건 확인: httpx 설치 여부, config 환경변수 동작
    ↓
Phase 1: PoC (설정 API만으로 어댑터 연결 검증)
    ├── import 경로 해석 확인
    ├── httpx / config 의존성 확인
    ├── classify/detect 활성화 확인
    ├── on_stage_complete 미호출 확정
    └── 한계점 식별
         ↓ PoC 승인 ✅ (2026-03-24 완료)
Phase 2: 백엔드 보안 강화 + 테스트 API
    ├── 모듈 경로 화이트리스트 검증 (Critical)
    ├── 설정 스냅샷 격리 (race condition 방지)
    ├── 어댑터 인스턴스 캐싱
    ├── 어댑터 실패 사용자 통지 (adapter_status)
    ├── /adapter/test 엔드포인트
    └── 설정 저장 시 사전 검증
         ↓
Phase 3: UI 개선
    ├── 프리셋 + 사용자 지정 어댑터 선택
    ├── 연결 테스트 버튼 (Phase 2 API 연동)
    ├── 연결 상태 표시
    └── 결과 화면에 분류/감지/adapter_status 표시
```

---

## 8. 리스크

| 리스크 | 심각도 | 영향 | 대응 |
|--------|--------|------|------|
| 임의 모듈 경로 → 코드 실행 | **Critical** | 보안 침해 | 화이트리스트 검증 (Phase 2-1) |
| 동시 파이프라인 race condition | **Major** | 잘못된 어댑터로 처리 | 설정 스냅샷 격리 (Phase 2-2) |
| 어댑터 실패 무음 처리 | **Major** | 사용자가 실패 인지 불가 | adapter_status 필드 (Phase 2-4) |
| ~~httpx 미설치 → 어댑터 로딩 불가~~ | ~~Major~~ | ~~Phase 1 차단~~ | **PoC 해소:** httpx v0.28.1 설치 확인 |
| config.get_settings() 환경변수 미설정 | **Minor** | resolve_entity/on_stage_complete 실패 | graceful degradation (분류/감지는 영향 없음). on_stage_complete는 xPipeWeb에서 미호출 확정 |
| 어댑터 초기화 반복 (100건→100번) | **Minor** | 성능 저하 | 인스턴스 캐싱 (Phase 2-3) |
| /adapter/test 사이드 이펙트 | **Minor** | 테스트가 외부 호출 유발 | 안전한 메서드만 호출 + hasattr 체크 |

---

## 부록: Gini/Alex 검토 반영 추적

| 검토 이슈 | 출처 | 반영 위치 |
|-----------|------|----------|
| adapter_module 화이트리스트 미검증 (Critical) | Gini #1 | 4절 Phase 2-1 |
| Race condition (공유 딕셔너리) | Gini #2 | 4절 Phase 2-2 |
| 어댑터 실패 무음 처리 | Gini #3 | 4절 Phase 2-4 |
| 테스트 계획 보안 시나리오 누락 | Gini #4 | 6절 보안/동시성/에러 테스트 추가 |
| import 경로 → 전제 조건 격상 | Gini #5 | 2절 전제 조건 신설 |
| /adapter/test 사이드 이펙트 경고 | Gini #6 | 4절 Phase 2-5 동작 방식 |
| httpx 모듈 레벨 import 차단 | Alex #1 | 2절 전제 조건 2-3 |
| Phase 순서 변경 (테스트 API → UI) | Alex #2 | 4절 Phase 2/3 순서 변경 |
| 프리셋 UI 추가 | Alex #3 | 4절 Phase 3-1 |
| 어댑터 인스턴스 캐싱 | Alex #4 | 4절 Phase 2-3 |
| on_stage_complete 호출 경로 미분석 | Alex #5 | 4절 Phase 1-1 검증 항목 + 5절 |
