# xPipe 모듈화 — 토의 기록

> 본 문서는 `XPIPE_MODULARIZATION_STRATEGY.md`에서 분리된 토의 이력입니다.
> 의사결정 근거 추적이 필요할 때 참조하세요.

---

### 2026-03-13 초기 토의

**참여자**: Alex, Gini, Architect, PM, Moderator (Claude)

**주요 합의사항**:
1. 3-Layer 아키텍처 (xPipe → Domain Adapter → Application) 채택
2. 제공 형태는 Python 패키지 우선, API는 수익화 후
3. Phase 0 (보안+선행조건) → Phase 1 (인터페이스) → Phase 2 (분리) → Phase 3 (패키지화) → Phase 4 (PoC) 순서
4. "리팩토링으로서의 모듈화" — 새 서비스를 만들지 말고, 기존 코드에서 경계를 나누는 방식
5. PG 결제 연동 / SaaS API 제공은 현재 스코프 밖

**미결 사항**:
- [ ] Q1: xPipe의 정확한 분리 범위 (embedding pipeline 포함 여부 등)
- [ ] **Q2: 데이터 저장소 전략 — Phase 0에서 반드시 결정** (Gini, PM: 미결 시 Phase 1 진입 불가)
- [ ] Q3: 멀티테넌시 수준 (DB 레벨 격리 vs 컬렉션 레벨 격리 vs 필드 레벨 격리)
- [ ] 다른 도메인 PoC 대상 선정 (법률? 의료? 금융?)
- [ ] xPipe 하위 모듈 이름 (리팩토링 진행하며 경계가 드러난 후 결정)

### 2026-03-13 2차 토의 — 엔진 이름 확정 및 방향 합의

**합의사항**:
1. **엔진 이름: xPipe** 확정
   - x = 어떤 문서든, 어떤 도메인이든 — 범용성을 한 글자로 표현
   - Pipe = 문서 처리 파이프라인이라는 본질
   - *"xPipe 위에 보험 어댑터를 얹으면 AIMS가 된다"*
2. **하위 모듈 이름은 지금 정하지 않는다** — 리팩토링하며 실제 경계가 드러난 후 결정
3. **PG 연동 / SaaS API 제공은 현재 스코프 밖** — 시기상조

**방향성**:
- 새 서비스를 만드는 것이 아니라, 기존 코드의 **리팩토링**으로 레이어를 분리한다
- xPipe(범용 코어)와 보험 도메인 로직의 경계를 명확히 나눈다
- 분리 후 AIMS 전체 파이프라인이 기존과 동일하게 동작하는 것을 검증한다

### 2026-03-13 3차 — 에이전트 리뷰 피드백

보고서 초안에 대해 Alex, Gini, PM이 실제 코드를 검증하며 리뷰를 수행함.

#### 3개 리뷰 공통 지적 (교차 검증)

| 지적 사항 | Alex | Gini | PM | 합의 |
|-----------|:----:|:----:|:--:|------|
| Phase 기간 과소평가 | ✓ | ✓ | - | 9-12주 → 14-18주 재산정 필요 |
| Phase 0 "1주" 비현실적 | ✓ | ✓ | - | 최소 2-3주 |
| Definition of Done 없음 | - | - | ✓ | 측정 가능한 완료 기준 추가 필수 |
| openai_service.py 분리 난이도 과소평가 | ✓ | ✓ | - | 분류+요약 통합 호출 구조 고려 필요 |
| Q2(Storage 추상화) Phase 1 전 결정 필요 | - | ✓ | ✓ | 미결로 두면 인터페이스 재설계 불가피 |
| document_pipeline 인증 부재 | - | ✓ | - | Critical 항목으로 기술 부채 추가 |

#### Alex 핵심 지적
1. Adapter 4개 부족 → DetectionAdapter, EntityResolutionAdapter 누락
2. 분류+요약 한 번의 AI 호출 통합 → 어댑터 분리 시 비용 2배
3. doc_prep_main.py God Function (실제 1,777줄) 분해 선행 필요
4. Strangler Fig 패턴 제안 → 채택

#### Gini 핵심 지적
1. 기술 부채 수치 정확도 문제 (SSE 2건, raw fetch 23파일)
2. document_pipeline 전역 인증 없음 + CORS 전면 개방 → Critical
3. Storage 추상화(Q2) 미결 → High 리스크
4. 테스트 전략 구체성 부족

#### PM 핵심 지적
1. Definition of Done 전무 → 측정 가능한 완료 기준 추가
2. WHY NOW 비즈니스 관점 부족 → 기회 비용 명시
3. AIMS 운영 리스크 미검토 (M6 정확도, credit_pending, deploy_all.sh)
4. 토의 기록 별도 파일 분리 제안

### 2026-03-13 최종 — 우선순위 확정 및 보고서 보완

**확정사항**:
- xPipe 모듈화는 **AIMS 프로젝트의 최우선 일정**으로 확정
- ~~마일스톤: Phase 3 완료~~ → **4차에서 M1~M5 5단계로 재정의**
- ~~Phase 4는 보너스~~ → **4차에서 Foundation 정식 게이트(M2)로 격상**

**보고서 보완 (3차 리뷰 피드백 반영)**:
- 섹션 1.3 WHY NOW 추가 (PM)
- 섹션 1.4 Definition of Done 추가 (PM)
- 어댑터 인터페이스: 4개 개별 → 1개 통합 `DomainAdapter` 재설계 (Alex)
- Phase 기간: 9-12주 → 13-17주 보정 (Alex, Gini)
- Phase 0: 1주→2-3주, 게이트 조건 추가 (Gini)
- Phase 2: Strangler Fig 패턴 적용 (Alex)
- 리스크 테이블: 5개→10개 확장 (전원)
- 기술 부채: 8개→10개, 정확도 보정 (Gini)

### 2026-03-19 4차 — 현행화 검토 + 확장 전략 수립 + Phase 전면 재설계

**참여자**: Alex, Gini, PM, Moderator (Claude)

#### 4차-1: 현행화 검토 결과

**3자 공통 지적**:
- Phase 0 게이트 조건 5개 중 0개 충족 — Phase 1 진입 불가 상태
- doc_prep_main.py: 문서 기재 600줄+ → 실제 1,777줄 (3배 과소평가)
- raw fetch: 문서 기재 11곳+ → 실제 23파일/39회
- 기술 부채 10개 항목 전원 미해결
- 전략적 프레임워크 자체는 유효, 수치 보정 필요

#### 4차-2: 신규 요구사항 반영

1. **xPipe 최우선 원칙 — AIMS First**
2. xPipe "자동차 엔진" 철학 — 6가지 독립성 원칙
3. 확장 로드맵 Phase 5~8 추가 (B,C,D,E,G 아이디어 반영)

#### 4차-3: Phase 전면 재설계 (3자 교차 검토)

| 합의 사항 | Alex | Gini | PM |
|-----------|:----:|:----:|:--:|
| Phase 3 → 3-A/3-B 분리 | ✓ | ✓ | ✓ |
| Phase 5 Provider + Quality Gate 분리 | ✓ | ✓ | ✓ |
| Phase 4 정식 게이트 격상 | - | ✓ | ✓ |
| 감사 로그를 멀티테넌시 앞으로 | ✓ | - | ✓ |
| 멀티테넌시 조건부 Phase | ✓ | ✓ | ✓ |
| 전 Phase 게이트 조건 + 롤백 전략 | ✓ | ✓ | - |
| Phase 0: 3-4주 (1,777줄 분해) | ✓ | ✓ | ✓ |
| 멀티테넌시: 5-7주 | ✓ | ✓ | - |

**재설계 결과**: Foundation 6 Phase + Evolution 5 Phase, M1~M5 마일스톤, 리스크 18개

### 2026-03-19 5차 — 문서 최적화 (3자 검토)

**3자 공통 합의**: 문서 신뢰도 등급 C → 모순 7건 + 중복 4건 해소 필요
- 수치 오류 3건, 섹션 번호 중복, 구 인터페이스 코드 잔존, 마일스톤 정의 충돌, M3 다이어그램 불일치
- 토의 기록 별도 파일 분리, 부록 B~G 축소, DomainAdapter/AS-IS 중복 제거

### 2026-03-19 Sprint 0-1 완료 — 보안 이슈 4건 해결

**실행 결과**:
- 4건 수정 완료: SSE 인증 2건, chat-routes userId, personal-files DI 리팩토링, CORS 제한
- Gini 판정: PASS with Minor (Minor 즉시 해소)
- 테스트: 47 스위트, 1,052건 전원 PASS
- 커밋: `18e0680a` (보안 4건), `d852ba24` (CORS Minor)

**신규 발견**: `customer-relationships-routes.js:591` — JWT 미사용 (Major)
→ Sprint 0-2에 포함하여 해결 예정

**실측 데이터**: 예상 3시간 15분 → 실제 더 빠르게 완료. DI 리팩토링 패턴이 동일하여 일괄 치환 가능.
