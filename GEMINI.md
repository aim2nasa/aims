# AIMS 프로젝트 개요

## 시스템 정의

**AIMS** (Agent Intelligent Management System)는 보험 세일즈를 위한 지능형 문서 관리 시스템입니다.

## 핵심 기능

1. **문서 자동화**: 업로드, 분류, OCR, 태깅, 케이스 그룹화
2. **고객 관계 관리**: 가족 관계, 계약, 상담 이력 추적
3. **RAG 검색**: Qdrant 벡터 DB 기반 시맨틱 검색
4. **실시간 동기화**: WebSocket 기반 문서 상태 업데이트

## 기술 스택

**Frontend**: React 19, Ant Design, Tailwind CSS
**Backend**: Node.js (Express), Python (FastAPI)
**Database**: MongoDB, Qdrant
**AI/ML**: LangChain, OpenAI API

## 아키텍처 원칙

**Document-Controller-View** 패턴
- View는 데이터를 직접 fetch하지 않음
- 단일 데이터 소스 (Single Source of Truth)
- 단방향 데이터 플로우

## 주요 모듈

- `docmeta`: 문서 메타데이터 추출
- `dococr`: OCR 텍스트 추출
- `doctag`: AI 기반 문서 태깅
- `doccase`: 문서 클러스터링

## 개발 환경

- **Backend 서버**: tars (Linux) - `tars.giize.com`
- **Frontend 개발**: WonderCastle (Windows 10)
- **Database**: MongoDB on `tars:27017`

---

상세 정보는 [CLAUDE.md](CLAUDE.md), [ARCHITECTURE.md](docs/ARCHITECTURE.md) 참조.
