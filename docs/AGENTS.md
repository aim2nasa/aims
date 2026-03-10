# AIMS 에이전트 전체 목록

> 총 21개 (커스텀 19 + 빌트인 2)

---

## 개발/설계

| # | 에이전트 | ID | 역할 | 트리거 |
|---|---------|-----|------|--------|
| 1 | **Alex** | alex-developer | 세계 최고 IT 전문 개발자/아키텍트. 설계+구현 | 복잡한 기능/대규모 변경 |
| 2 | **Dev** | dev-orchestrator | Alex+Gini 오케스트레이터. 설계→구현→QA 자동 | 개발 요청 시 |
| 3 | **Plan** | (빌트인) | SW 아키텍트. 구현 전략·단계별 계획 | 구현 계획 필요 시 |

## 품질/검증

| # | 에이전트 | ID | 역할 | 트리거 |
|---|---------|-----|------|--------|
| 4 | **Gini** | gini-quality-engineer | SW 품질 최종 검증 (5대 기준) | 구현 완료 후 |
| 5 | **Code Reviewer** | code-reviewer | 코드 품질/보안/성능 리뷰 | PR 전, 기능 완료 후 |
| 6 | **AIMS Code Checker** | aims-code-checker | CLAUDE.md 규칙 준수 확인 | 코드/CSS 변경 후 |
| 7 | **Test Analyzer** | test-analyzer | 테스트 실패 원인 분석 | 테스트 에러 시 |

## 테스트

| # | 에이전트 | ID | 역할 | 트리거 |
|---|---------|-----|------|--------|
| 8 | **E2E Tester** | e2e-tester | Playwright 브라우저 E2E 테스트 | UI 변경 후 |
| 9 | **Performance Tester** | performance-tester | API/DB/번들/메모리 성능 분석 | 성능 점검 시 |
| 10 | **Full Test Runner** | full-test-runner | 프론트+백엔드 전체 테스트 자동화 | "전체 테스트" 요청 |

## 보안/인프라

| # | 에이전트 | ID | 역할 | 트리거 |
|---|---------|-----|------|--------|
| 11 | **Security Auditor** | security-auditor | OWASP Top 10 보안 취약점 검사 | 보안 리뷰 요청 |
| 12 | **CSP Checker** | csp-compatibility-checker | Safari In-App Browser CSP 호환성 | 빌드/의존성 업데이트 후 |
| 13 | **Deploy Monitor** | deploy-monitor | 배포 후 6개 서비스 헬스체크 | 배포 완료 후 |
| 14 | **Incident Responder** | incident-responder | 장애 대응 + 로그 분석 + 복구 | 서버 오류/다운 시 |
| 15 | **Full Deploy** | full-deploy | 검증→배포→헬스체크 3Phase 자동 | "전체 배포" 요청 |

## 기획/디자인/문서

| # | 에이전트 | ID | 역할 | 트리거 |
|---|---------|-----|------|--------|
| 16 | **Product Manager** | product-manager | 요구사항 분석, 태스크 분해, 우선순위 | 새 기능/기획 요청 |
| 17 | **Dana** | ux-designer | Apple 원칙 기반 UI/UX 리뷰 (15년 경력) | 디자인 리뷰 요청 |
| 18 | **Sora** (소라) | sora-insurance-agent | 보험 설계사 페르소나 (54세, 18년 경력). 실사용자 관점 UX 피드백 | UX 평가 시 |
| 19 | **Doc Generator** | doc-generator | API/아키텍처 기술 문서 자동 생성 | 문서화 요청 |

## 유틸리티 (빌트인)

| # | 에이전트 | 역할 |
|---|---------|------|
| 20 | **Explore** | 코드베이스 빠른 탐색 |
| 21 | **Code Simplifier** | 코드 단순화/정리 |

---

## 협업 원칙

- **조사/분석/설계**: Alex + Gini 병렬 (교차 검증)
- **구현**: Alex 단독 (완성된 코드를 만들어야 검수 의미 있음)
- **검수**: Gini 순차 (구현 완료 후 PASS/FAIL 판정)
- 품질 > 속도. 코드 리뷰만으로 "정상" 판단 금지 → 실증 검증 필수
