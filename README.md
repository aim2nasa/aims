# AIMS – Agent Intelligent Management System

AIMS는 보험설계사를 위한 지능형 문서 관리 시스템입니다.  
문서의 업로드, 분류, OCR, 태깅, 사건 묶음 등 반복적이고 복잡한 작업을 자동화하여  
설계사가 더 빠르게 고객을 이해하고 대응할 수 있도록 돕습니다.

## 주요 기능 (예정 포함)

- 문서 메타 정보 자동 추출 (`docmeta`)
- 이미지 및 PDF OCR 텍스트 추출 (`dococr`)
- AI 기반 문서 태깅 및 분류 (`doctag`)
- 사건 단위 문서 군집화 (`doccase`)
- n8n 및 API와의 연동을 통한 자동화 처리

## 폴더 구조

본 프로젝트는 기능 단위로 구성된 확장 가능한 구조를 따릅니다.  
자세한 구조는 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)를 참고하세요.

## 실행 예시

```bash
python scripts/run_docmeta.py --file ./samples/pdf/보험청구서.pdf
```

## 테스트

전체 테스트 실행 (Node.js + Python):
```bash
# 크로스 플랫폼 (권장) - Windows, Linux, Mac 모두 지원
npm test

# 또는 Node.js 직접 실행
node scripts/test-all.js

# 레거시 방식 (deprecated)
# Windows: scripts\test-all.bat
# Linux/Mac: ./scripts/test-all.sh
```

자세한 테스트 가이드는 [`scripts/README.md`](./scripts/README.md)를 참고하세요.

## 사용 조건

이 프로젝트는 **비공개 소프트웨어**이며, 라이선스를 공개하지 않습니다.
무단 복제, 재배포, 상업적 사용은 금지됩니다.
