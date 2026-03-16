# 임베딩 파이프라인 장애 보고서 및 Self-Healing 구현

**일시**: 2026-03-17
**보고자**: Claude (Alex 설계+구현, Gini 검수)
**심각도**: High (문서 처리 전체 중단)

---

## 1. 장애 현상

| 항목 | 내용 |
|------|------|
| 증상 | UI에 "81 처리중", "17 크레딧 대기" 표시, 숫자 변화 없음 |
| 영향 범위 | youmi 사용자 전체 문서 (1,479건 중 98건 멈춤) |
| 지속 시간 | 2026-03-16 ~ 2026-03-17 (약 1일) |

---

## 2. 근본 원인 (3건)

### 원인 1: `run_pipeline.sh` 누락 (Critical)
- 크론이 매분 실행하는 래퍼 스크립트(`run_pipeline.sh`)가 존재하지 않음
- **결과**: 임베딩 파이프라인 전체가 동작하지 않음
- **크론 로그**: `flock: failed to execute run_pipeline.sh: No such file or directory` (매분 반복)
- **원인 추정**: git에 한 번도 커밋된 적 없는 파일. 서버에서 수동 생성 후 유실된 것으로 보임

### 원인 2: credit_pending 자동 재처리 로직 부재
- 문서 처리 시 크레딧 부족 → `credit_pending` 상태로 마킹
- 크레딧 충전 후에도 자동 재처리 트리거 없음 (티어 변경, 월 리셋 시)
- `grantBonusCredits()`와 월 1회 크론(`process_credit_pending.py`)에서만 트리거
- **결과**: VIP 티어(100,000C)로 변경했지만 17건 문서가 `credit_pending`에 영구 정체

### 원인 3: OCR quota_check_error 시 overallStatus 불일치
- OCR 쿼터 체크 API 일시 장애(aims_api 다운 등) → fail-closed로 `status: "failed"` 처리
- `overallStatus`가 `"processing"`에 방치되어 UI에서 영원히 "처리중" 표시
- 일시적 API 장애가 해소되어도 재시도 메커니즘 없음
- **결과**: 81건의 JPG/이미지 문서가 `failed + processing` 상태로 정체

---

## 3. 해결 조치

### 커밋 1: `30a0683a` — credit_pending 자동 재처리
- `full_pipeline.py`에 **1.5단계** 추가
- 매분 크론 실행 시 `credit_pending` 문서의 크레딧을 자동 재확인
- 크레딧 충분 → `pending` 전환 → 2단계에서 즉시 임베딩 처리
- 사용자별 API 호출 1회로 부하 최소화

### 커밋 2: `d72258f2` — run_pipeline.sh 생성
- 크론에서 호출하는 래퍼 스크립트를 git에 커밋
- `.env.shared` 환경변수 로드 + `full_pipeline.py` 실행

### 커밋 3: `bd2c219c` — Self-Healing 강화
- **1단계-B**: `overallStatus` 불일치 자동 수정
  - `status: completed` + `overallStatus != completed` → 자동 교정
  - `status: failed` + `overallStatus: processing` → `overallStatus: error`로 교정
- **1.6단계**: OCR `quota_check_error` 자동 재시도
  - aims_api 복구 확인 후 Redis `ocr_stream`에 재큐잉
  - MongoDB 상태 리셋 (`stages.ocr` 포함)

---

## 4. 처리 결과

| 항목 | 처리 전 | 처리 후 |
|------|---------|---------|
| completed | 1,381 | **1,476** (+95) |
| credit_pending | 17 | **0** |
| failed (processing) | 81 | **0** |
| pending | 17 | **0** |

---

## 5. 재발 방지 — Self-Healing 아키텍처

`full_pipeline.py`가 매분 크론으로 실행되며, 다음 단계를 순차 수행:

```
1단계    : docembed 완료 문서의 overallStatus 불일치 수정
1단계-B  : status↔overallStatus 전체 불일치 자동 수정
1.5단계  : credit_pending → 크레딧 재확인 → 자동 재처리
1.6단계  : OCR quota_check_error → API 복구 확인 → 자동 재OCR
2단계    : pending 문서 임베딩 처리
```

**어떤 원인으로 장애가 발생해도 원인이 해소되면 최대 1분 내 자동 복구됩니다.**

| 장애 유형 | 자동 복구 단계 |
|-----------|---------------|
| 크레딧 부족 → 충전 | 1.5단계 |
| OCR API 장애 → 복구 | 1.6단계 |
| overallStatus 불일치 | 1단계, 1단계-B |
| 임베딩 실패 (retry < 3) | 2단계 |

---

## 6. 교훈

1. **크론 래퍼 스크립트는 반드시 git 관리**: 서버에서 수동 생성한 파일은 유실 위험
2. **상태 머신은 모든 전이 경로에서 일관성 유지**: `status`와 `overallStatus`를 동시에 업데이트하지 않는 코드 경로가 있으면 불일치 발생
3. **fail-closed 정책에는 반드시 자동 재시도 메커니즘 동반**: 일시적 장애를 영구 실패로 만들지 않기 위해
4. **Self-Healing은 주기적 검증 패턴으로 구현**: 매분 실행되는 크론에서 "복구 가능한 문서가 있나?" 체크하는 구조가 가장 robust
