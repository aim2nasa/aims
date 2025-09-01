# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ CRITICAL RULES - 반드시 준수해야 할 규칙 ⚠️

### Git Commit 규칙 - 절대 위반 금지!

**절대로 사용자의 명시적 허락 없이 커밋하지 마세요!**

1. **코드 구현 완료 후 반드시:**
   - 구현 내용을 먼저 설명
   - 다음과 같이 질문: "구현이 완료되었습니다. 확인해보시고 문제없으면 커밋해도 될까요?"
   - 사용자가 "커밋해" 또는 유사한 승인을 할 때까지 대기

2. **절대 금지사항:**
   - 구현 후 자동으로 커밋하기
   - 사용자 검토 없이 커밋하기
   - 커밋 준비 상태를 임의로 판단하기

3. **이것이 중요한 이유:**
   - 사용자가 구현이 올바르게 작동하는지 확인해야 함
   - 문제있는 코드가 커밋되는 것을 방지
   - 커밋 전 문제 수정 기회 제공

**기억하세요: 사용자가 반드시 검사하고 승인한 후에만 커밋!**

---

## System Overview

AIMS (Agent Intelligent Management System) is an intelligent document management system for insurance salespeople. It automates repetitive tasks like document upload, classification, OCR, tagging, and case grouping to help salespeople better understand and respond to customers.

## Development Environment

- **Backend Server**: tars (Linux server) - accessible at `tars.giize.com`
- **Frontend Development**: WonderCastle (Windows 10 PC)
- **Database**: MongoDB on `tars:27017`

## Architecture

The system is organized into functional modules:

- **Frontend Applications**: Multiple React apps in `frontend/`
  - `aims-uix1`: Main UI application (React + Ant Design + Tailwind)
  - `doc-status-dashboard`: Document status monitoring (React + Tailwind)  
  - `aims-web`: Alternative web interface
  - `document-monitor`: Document tracking interface

- **Backend Services**:
  - Node.js API server in `api/` for document status monitoring
  - Python FastAPI service in `api/python/` for document status API
  - MongoDB database on `tars:27017`

- **Core Python Modules** in `src/`:
  - `docmeta`: Document metadata extraction
  - `dococr`: OCR text extraction from images/PDFs
  - `doctag`: AI-based document tagging and classification
  - `doccase`: Document clustering by case/incident

- **Automation**: n8n workflows in `n8n_flows/` for automated processing

## Common Development Commands

### Frontend Development
```bash
# Run main UI (port 3005)
cd frontend/aims-uix1 && PORT=3005 npm start

# Run document status dashboard  
cd frontend/doc-status-dashboard && npm start

# Build frontend
cd frontend/aims-uix1 && npm run build

# Test frontend
cd frontend/aims-uix1 && npm test
```

### Backend Services
```bash
# Start Node.js API server
cd api && npm start

# Start Python FastAPI service
cd api/python && uvicorn main:app --reload

# Start Python document status API
cd api/python && python main.py
```

### Python Development
```bash
# Run document metadata extraction
python scripts/run_docmeta.py --file ./samples/pdf/보험청구서.pdf

# Run full processing pipeline
python scripts/full_pipeline.py

# Run tests
make test
# or
PYTHONPATH=$(PWD) pytest -v
```

### Database & Search
```bash
# Check Qdrant vector database
python scripts/check_qdrant.py

# Create embeddings for search
python scripts/create_embeddings.py

# Perform RAG search
python scripts/rag_search.py
```

## Key Integration Points

- **WebSocket**: Real-time document status updates via `websocketService.js`
- **MongoDB**: Document storage and metadata in `docupload.files` collection
- **Vector Search**: Qdrant vector database for semantic document search
- **OCR Processing**: Integrated text extraction from images and PDFs
- **n8n Workflows**: Automated document processing pipelines

## File Structure Notes

- Frontend apps share similar structure but serve different purposes
- Python modules follow a shared pattern with `__init__.py` and core functionality
- Sample documents in `samples/` organized by MIME type for testing
- Tools in `tools/` provide utilities for file analysis and smart search
- Scripts in `scripts/` handle various processing and API tasks

## Testing

- Frontend: Jest and React Testing Library (`npm test`)
- Python: pytest with `make test` or manual pytest commands
- Sample files available in `samples/` for testing different document types