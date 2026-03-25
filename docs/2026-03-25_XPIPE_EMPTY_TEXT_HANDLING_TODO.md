# xPipe 빈 텍스트 처리 개선 — TODO

| 항목 | 내용 |
|------|------|
| 등록일 | 2026.03.25 |
| 우선순위 | Medium |
| 발견 경위 | 캐치업코리아 446건 일괄등록 테스트 중 `암검진067.jpg` 1건 xPipe 실패 |

## 현재 동작

- xPipe ExtractStage: OCR 결과 빈 텍스트 → 에러 raise → legacy fallback
- legacy: 빈 텍스트를 정상 처리 → `unclassifiable`, AI 분류 스킵

## 개선 방향

xPipe에서 빈 텍스트를 "읽을 수 없는 문서"로 정상 처리한다.

1. **ExtractStage**: 빈 텍스트를 에러가 아닌 정상 결과로 반환 (`extracted_text = ""`)
2. **ClassifyStage**: 텍스트 < 10자이면 `unclassifiable` 자동 설정, AI 호출 스킵
3. **최종 목표**: legacy fallback 의존성 완전 제거

## 기대 효과

- xPipe 성공률 99.8% → 100%
- legacy 코드 제거 가능 (현재 fallback으로 유지 중)
