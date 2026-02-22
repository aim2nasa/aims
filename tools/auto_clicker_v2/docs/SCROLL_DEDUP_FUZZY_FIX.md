# 스크롤 중복 감지 수정 (첫 행 건너뛰기 + exact match)

**날짜**: 2026-02-22
**버전**: v0.1.83 → v0.1.84
**파일**: `MetlifeCustomerList.py`

---

## 증상

ㅊ 초성 이어하기(resume) 실행 시:
- **시작 고객**: 최한준 (39명 중 35번째)
- **예상 결과**: 최한준, 최현사, 최현지, 최혜진, 최희정 (5명)
- **실제 결과**: 잘못된 고객 처리 후 멈추지 않고 계속 진행

## 원인

### 스크롤 시 첫 행이 잘려 보이는 물리적 현상

Page Down 스크롤은 정수 행 단위로 정확히 되지 않을 수 있다.
스크롤된 페이지의 **첫 번째 행이 반쯤 잘려서 표시**되며, OCR이 이를 부정확하게 읽는다.

| 페이지 | 1행 OCR 결과 | 실제 | 원인 |
|--------|-------------|------|------|
| 3페이지 | 최유미 | 최유미 | 완전히 보임 |
| 4페이지 | **죄유미** | 최유미 | **잘려 보임** |

**이것은 OCR 오류가 아니라 물리적 표시 문제다.**

### v0.1.83의 잘못된 접근 (overfitting)

v0.1.83에서는 이 문제를 퍼지 매칭(1글자 차이 허용)으로 해결하려 했다.
이는 증상에 대한 band-aid fix이며, 임의 임계값에 의존하는 overfitting이었다.

## 해결 (v0.1.84)

### 핵심 원리

잘릴 수 있는 첫 행은 비교에서 **제외**하고, 완전히 보이는 2~12번째 행으로 **exact match**한다.

```python
def _find_scroll_overlap(prev_rows, curr_rows):
    reliable = curr_rows[1:]  # 2번째 행부터 (항상 완전히 보임)

    # reliable의 최장 prefix가 prev_rows의 suffix와 일치하는 길이 찾기
    for match_len in range(min(len(prev_rows), len(reliable)), 0, -1):
        if reliable[:match_len] == prev_rows[-match_len:]:
            return match_len + 1  # +1 = 잘린 첫 행 (overlap의 일부)

    # 첫 행만 겹칠 수 있음 (잘리지 않은 경우)
    if curr_rows[0] == prev_rows[-1]:
        return 1

    return 0
```

### 왜 이것이 올바른가

- **퍼지 매칭 제거**: 임의 임계값 없음, exact match만 사용
- **일반화**: 첫 행이 잘리든 안 잘리든 동일하게 동작
- **물리적 사실 기반**: "스크롤 시 첫 행만 잘릴 수 있다"는 Nexacro 그리드의 물리적 제약

### 알려진 한계

overlap=1이고 첫 행이 잘린 경우 감지 불가 (overlap=0으로 처리).
방어적 dedup(`_is_already_processed`)이 안전망으로 작동.

## 검증

| 단계 | 결과 |
|------|------|
| Mock 테스트 26건 | ALL PASS |
| Gini 품질 검수 | PASS |
| 시뮬레이션 22건 (실제 로그 재현) | ALL PASS |
| Alex/Gini 독립 분석 | 양측 PASS, overfitting 없음 확인 |

### 실환경 데이터 검증 (3→4페이지 전환)

```
3페이지: 최유미(정확), 최유진, 최윤정, ..., 최한준, 최현사
4페이지: 죄유미(잘림), 최유진, 최윤정, ..., 최한준, 최현사, 최현지, 최혜진

reliable = [최유진, ..., 최현사] (9행 exact match)
overlap = 9 + 1 = 10
새로운 행 = [최현지, 최혜진]
```
