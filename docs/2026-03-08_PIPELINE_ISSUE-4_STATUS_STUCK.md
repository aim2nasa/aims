# ISSUE-4: status 미전환 -- processing 고착 70건

> **발견일**: 2026-03-08
> **심각도**: Major
> **연관 작업**: 캐치업코리아 446건 v4 분류 체계 튜닝 샘플 업로드
> **상태**: 미해결

---

## 현상

- 파이프라인 처리 완료 후 70건의 문서가 다음 상태로 고착:
  - `status = "processing"`
  - `overallStatus = "completed"`
  - `meta.meta_status = "done"`
  - `meta.confidence = 0`
  - `meta.document_type = "general"`

## 영향

1. **UI 표시 오류**: 70건이 영원히 "처리 중" 상태로 표시됨
2. **분류 결과 왜곡**: confidence=0 + general은 정상 분류가 아닌 fallback 처리
   - v3 baseline에서 general 88건 중 67건이 이 이슈에 해당
   - 실제 general은 21건으로 추정
3. **프롬프트 튜닝 영향**: 이 70건의 분류 결과를 baseline으로 사용할 수 없음

## 상세 조건

```javascript
// 해당 문서 조회
db.files.find({
  createdAt: { $gte: new Date("2026-03-08T09:00:00Z") },
  status: "processing",
  overallStatus: "completed",
  "meta.confidence": 0,
  "meta.document_type": "general"
}).count()  // -> 67건 (나머지 3건은 다른 조합)
```

## 처리 과정 추적

모니터링 중 관찰된 이 그룹의 건수 변화:
- 초기: 113건 (processing+completed)
- 중간: 서서히 감소 (일부는 자연 전환)
- 최종: 70건에서 고착

## 근본 원인 (추정)

1. **대량 업로드 시 race condition**: 동시 다발적인 상태 업데이트에서 status 전환이 누락
2. **confidence=0인 이유**: 분류 API 호출 실패 또는 타임아웃 -> fallback으로 general + confidence=0 설정 -> 이후 status 전환 로직이 이 상태를 "완료"로 인식하지 못함
3. **overallStatus=completed인 이유**: 메타 추출(meta_status=done)은 성공했으므로 overallStatus는 completed로 전환됨

## 해결 방향

### 즉시 조치 (데이터 복구)
```javascript
// 1. 70건의 status를 completed로 수정
db.files.updateMany(
  {
    createdAt: { $gte: new Date("2026-03-08T09:00:00Z") },
    status: "processing",
    overallStatus: "completed"
  },
  { $set: { status: "completed" } }
)

// 2. 70건 재분류 (confidence=0이므로 분류 결과가 부정확)
// reclassify_from_db.py 또는 수동 재분류 필요
```

### 근본 해결
- 대량 업로드 시 상태 전환 race condition 원인 분석
- status 전환 로직에서 `overallStatus=completed && meta_status=done`인 문서를 자동으로 `status=completed`로 전환하는 안전장치 추가

---

> 연관: [파이프라인 처리 완료 요약](2026-03-08_PIPELINE_PROCESSING_SUMMARY.md)
> 연관: [파이프라인 모니터링 로그](2026-03-08_PIPELINE_MONITORING.md)
