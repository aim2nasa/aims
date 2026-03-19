# xPipe Versioning Policy (SemVer)

**적용 시점**: Phase 3-A (패키지화) 이후
**현재**: Pre-release (0.x.x)

## Semantic Versioning

`MAJOR.MINOR.PATCH` (https://semver.org)

| 변경 유형 | 버전 | 예시 |
|-----------|------|------|
| 하위 호환 깨지는 변경 | MAJOR | DomainAdapter 메서드 시그니처 변경 |
| 호환 유지 기능 추가 | MINOR | DomainAdapter에 기본 구현 메서드 추가 |
| 버그 수정 | PATCH | 파이프라인 처리 버그 수정 |

## DomainAdapter 하위 호환 규칙

1. **기존 abstract 메서드 시그니처 변경 금지** → MAJOR 변경
2. **새 메서드 추가 시 반드시 기본 구현(no-op) 제공** → MINOR 변경
   - 기존 어댑터가 수정 없이 동작해야 함
3. **메서드 제거 시**: deprecation 경고 1 MINOR 버전 → 다음 MAJOR에서 제거

## DocumentStore / JobQueue 하위 호환 규칙

1. **기존 abstract 메서드 시그니처 변경 금지** → MAJOR 변경
2. **새 메서드 추가 시 기본 구현 제공** → MINOR 변경
3. **반환 타입 변경 금지** → MAJOR 변경

## Deprecation 정책

- deprecated 표시 후 **최소 1 MINOR 버전** 유지
- 다음 MAJOR에서 제거
- deprecated 메서드는 `warnings.warn()` + docstring 표기

## Pre-release (현재)

- 0.x.x 동안은 MINOR 변경에서도 breaking change 허용
- 1.0.0 이후 위 정책 엄격 적용

## 버전 기록

| 버전 | 날짜 | 내용 |
|------|------|------|
| 0.1.0 | Phase 1 | DomainAdapter ABC + DocumentStore/JobQueue ABC 정의 |
