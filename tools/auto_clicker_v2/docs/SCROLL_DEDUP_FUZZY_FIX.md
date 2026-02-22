# 스크롤 중복 감지 퍼지 매칭 수정

**날짜**: 2026-02-22
**버전**: v0.1.83
**파일**: `MetlifeCustomerList.py`

---

## 증상

ㅊ 초성 이어하기(resume) 실행 시:
- **시작 고객**: 최한준 (39명 중 35번째)
- **예상 결과**: 최한준, 최현사, 최현지, 최혜진, 최희정 (5명)
- **실제 결과**: 최유미, 최유진, 최윤정, 최은정, 최은화 등 **잘못된 고객** 처리 후 멈추지 않고 계속 진행

## 원인

### 스크롤 페이지 전환 시 OCR 불일치

Nexacro 그리드에서 Page Down으로 스크롤할 때, 이전 페이지 끝과 현재 페이지 시작의 겹치는 행(overlap)을 비교하여 중복을 감지한다.

**문제**: SikuliX OCR(Upstage API)이 **같은 텍스트를 다르게 읽는 경우** 발생:

| 페이지 | OCR 결과 | 실제 이름 |
|--------|----------|-----------|
| 3페이지 | 최유미 | 최유미 |
| 4페이지 | **죄유미** | 최유미 |

기존 코드는 **exact match**(`==`)로 비교했기 때문에:
```python
# 기존 코드 (exact match)
if prev_page_rows[-overlap:] == current_rows[:overlap]:
    scroll_dups = overlap
    break
```

`최유미 != 죄유미` → overlap 감지 실패 → `scroll_dups = 0` → 이미 처리한 고객을 **새로운 고객으로 오인** → 재처리 + 잘못된 행 클릭.

## 해결

### 1. 퍼지 행 비교 (`_fuzzy_row_match`)

두 행 (이름, 생년월일) 비교 시 OCR 오류 1글자까지 허용:

```python
def _fuzzy_row_match(row_a, row_b):
    name_a, birth_a = row_a
    name_b, birth_b = row_b
    if name_a == name_b and birth_a == birth_b:
        return True
    # 생년월일 일치 + 이름 길이 동일 + 1글자 차이 이하
    if birth_a and birth_b and birth_a == birth_b and len(name_a) == len(name_b):
        diff = sum(1 for a, b in zip(name_a, name_b) if a != b)
        if diff <= 1:
            return True
    return False
```

**안전장치**: 생년월일이 반드시 일치해야 하므로 다른 고객과의 오인 가능성 최소화.

### 2. 퍼지 오버랩 비교 (`_fuzzy_overlap_match`)

overlap 크기에 따라 허용 불일치 수 조절:

| overlap 크기 | 허용 불일치 행 수 | 근거 |
|-------------|-----------------|------|
| >= 3행 | 최대 1행 | 1행 오류 = 33% 이하 오류율 |
| < 3행 | 0행 (모두 일치) | 1행 오류 = 50~100% 오류율 → 위험 |

### 3. 방어적 중복 감지 (`_is_already_processed`)

스크롤 dedup이 실패하더라도, 이미 처리된 고객의 **정확한 이름 일치**로 재처리 방지:

```python
def _is_already_processed(name):
    for r in _chosung_customer_results:
        if r.get("customer_name", "") == name:
            return True
    return False
```

- 퍼지 매칭 **미사용** (방어적 dedup은 전체 결과 대상이므로 다른 고객과 충돌 위험)
- 스킵 시 `current_click_y = None` 설정 (실제 행 선택 없이 Arrow Down 사용 방지)

## 수정 요약

| 계층 | 매칭 방식 | 역할 |
|------|----------|------|
| 1차: 스크롤 dedup | 퍼지 매칭 (생년월일+이름 1글자 허용) | 페이지 전환 시 겹침 행 수 정확히 산출 |
| 2차: 방어적 dedup | 정확 매칭 (이름 exact) | 1차 실패 시 안전망 |

## 검증

| 검증 단계 | 결과 |
|-----------|------|
| Mock 테스트 46건 | ALL PASS |
| Gini 품질 검증 | PASS (3회차) |
| 통합 시뮬레이션 29건 | ALL PASS |
| DEV 모드 실환경 테스트 (ㅊ 이어하기) | PASS - 5명 정확히 처리 |

### 실환경 테스트 핵심 로그

```
[N1-S3] 페이지 3: 최유미 (정상 OCR)
[N1-S4] 페이지 4: 죄유미 (OCR 오류) → 퍼지 매칭으로 10행 중복 정확 감지
  → 새로운 2행(최현지, 최혜진)만 처리
[N1-S5] 페이지 5: 12행 전부 중복 → 스크롤 끝 감지
  → 13번째 행 최희정 처리
결과: 최한준, 최현사, 최현지, 최혜진, 최희정 (5명) 정확히 처리 완료
```
