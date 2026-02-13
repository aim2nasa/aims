# overallStatus 관할권 침범 버그 보고서

**날짜**: 2026-02-14
**심각도**: High (데이터 상태 불일치)
**상태**: 해결 완료 + 시뮬레이션 검증 통과

---

## 1. 증상

CRS 문서 130건이 `크레딧 부족` 상태로 표시되는데, 그 이후에 업로드된 문서들은 정상 `완료` 상태.
시간순으로 보면 논리적으로 불가능한 상황:

```
[류이화 CRS] 크레딧 부족  ← 먼저 업로드
[김수현 CRS] 완료         ← 나중 업로드인데 정상?
```

추가 조사에서 더 심각한 문제 발견:
- `overallStatus: "completed"` + `docembed.status: "credit_pending"` 문서 **45건**
- UI에서는 "완료"로 보이지만 실제 임베딩은 안 된 **유령 문서**

---

## 2. 근본 원인

### CRS/AR 스캐너의 overallStatus 관할권 침범

CRS 스캐너(`cr_background.py`)와 AR 스캐너(`background.py`)가 파싱 완료 시
`overallStatus: "completed"`를 **무조건 설정**하고 있었음.

```python
# 수정 전 (cr_background.py)
db["files"].update_one(
    {"_id": doc["_id"]},
    {"$set": {
        "cr_parsing_status": "completed",
        "overallStatus": "completed",    # 🔴 이 줄이 문제!
    }}
)
```

### 타이밍에 따른 2가지 시나리오

```
시나리오 A: CRS 스캐너가 먼저 완료 → full_pipeline이 credit_pending 덮어씀
  → 결과: overallStatus=credit_pending (정상 표시, 85건)

시나리오 B: full_pipeline이 먼저 credit_pending 설정 → CRS 스캐너가 completed로 덮어씀
  → 결과: overallStatus=completed BUT docembed=credit_pending (유령 문서, 45건)
```

**시나리오 B가 핵심 버그.** 사용자에게는 "완료"로 보이지만 임베딩이 안 된 유령 문서가 생김.

---

## 3. 크레딧 분석

크레딧 부족 자체는 실제로 발생한 정상 상황:

| 항목 | 값 |
|------|------|
| 월간 크레딧 (Premium) | 10,000 |
| 보너스 크레딧 | 90,150 |
| **총 가용** | **100,150** |
| **사용량** | **100,150.46** |
| 초과 | 0.46 크레딧 |

- 1,008건 임베딩 성공, 130건 credit_pending 정상
- 문제는 크레딧 부족 자체가 아니라 **CRS 스캐너가 overallStatus를 덮어쓴 것**

---

## 4. 해결: 관할권 분리 원칙 (Jurisdiction Separation)

### 핵심 원칙

```
각 서비스는 자기 관할 필드만 관리한다. 남의 관할을 침범하지 않는다.

┌─────────────────────┬──────────────────────────────┐
│ 서비스               │ 관할 필드                      │
├─────────────────────┼──────────────────────────────┤
│ doc_prep_main       │ overallStatus, status         │
│ full_pipeline       │ overallStatus, docembed.*     │
│ CRS 스캐너          │ cr_parsing_status만           │
│ AR 스캐너           │ ar_parsing_status만           │
└─────────────────────┴──────────────────────────────┘
```

### 수정 내역

**파일 3개, 위치 3곳** (AR 스캐너 2곳 + CRS 스캐너 1곳):

#### (1) `cr_background.py` - CRS 스캐너

```python
# 수정 후: overallStatus 완전 제거
cr_update = {
    "cr_parsing_status": "completed",
    "cr_parsing_completed_at": datetime.now(timezone.utc),
}
# displayName 로직...

# 🔴 overallStatus는 건드리지 않음 (관할권 분리 원칙)
db["files"].update_one(
    {"_id": doc["_id"]},
    {"$set": cr_update}
)
```

#### (2) `background.py` - AR Queue Parsing

```python
# 수정 후: overallStatus 완전 제거
update_fields = {
    "ar_parsing_status": "completed",
    "ar_parsing_completed_at": datetime.now(timezone.utc),
}
# customerId, displayName 로직...

# 🔴 overallStatus는 건드리지 않음 (관할권 분리 원칙)
db["files"].update_one(
    {"_id": doc["_id"]},
    {"$set": update_fields}
)
```

#### (3) `background.py` - AR Background Parsing

```python
# 수정 후: overallStatus 완전 제거
bg_update = {
    "ar_parsing_status": "completed",
    "ar_parsing_completed_at": datetime.now(timezone.utc),
}
# displayName 로직...

# 🔴 overallStatus는 건드리지 않음 (관할권 분리 원칙)
db["files"].update_one(
    {"_id": doc["_id"]},
    {"$set": bg_update}
)
```

### 추가: creditService.js 검색 쿼리 보강

CRS 스캐너가 overallStatus를 덮어쓴 유령 문서도 찾을 수 있도록:

```javascript
// 수정 후: docembed.status도 함께 검색
const pendingDocs = await filesCollection.find({
  ownerId: userId,
  $or: [
    { overallStatus: 'credit_pending' },
    { 'docembed.status': 'credit_pending' }
  ]
}).sort({ createdAt: 1 }).toArray();
```

---

## 5. 시뮬레이션 검증

5개 시나리오 모두 PASS:

```
시나리오 1: 정상 흐름 (크레딧 충분)           ✅ PASS
시나리오 2: 크레딧 부족                      ✅ PASS
시나리오 3: Race Condition                  ✅ PASS
시나리오 4: 크레딧 충전 후 복구               ✅ PASS
시나리오 5: 모든 상태에서 overallStatus 보존   ✅ PASS
  - pending → CRS 후 → pending ✅
  - processing → CRS 후 → processing ✅
  - completed → CRS 후 → completed ✅
  - credit_pending → CRS 후 → credit_pending ✅
  - error → CRS 후 → error ✅

최종: ✅ ALL 5 SCENARIOS PASS
```

### 왜 100% 안전한가?

CRS/AR 스캐너의 `update_one`에 `overallStatus`가 **아예 없기 때문에**,
어떤 타이밍이든, 어떤 순서든, overallStatus가 변조될 수 없습니다.

이전 방어적 패치(조건부 업데이트)와 달리:
- 조건 체크 불필요 → 체크할 것 자체가 없음
- Race condition 불가능 → 경쟁할 필드 자체가 없음
- 코드가 더 단순해짐 → 버그 발생 여지 감소

---

## 6. DB 복구

배포 전 유령 문서 45건을 올바른 상태로 복구:

```javascript
db.files.updateMany(
  { overallStatus: "completed", "docembed.status": "credit_pending" },
  { $set: { overallStatus: "credit_pending" } }
)
// → 45건 수정
```

---

## 7. 교훈

1. **관할권 분리**: 여러 서비스가 같은 필드를 수정하면 반드시 충돌한다
2. **방어적 패치 < 근본 해결**: 조건부 체크보다 필드 자체를 제거하는 것이 확실
3. **유령 문서**: UI 상태와 실제 상태가 다른 문서는 가장 위험한 버그
