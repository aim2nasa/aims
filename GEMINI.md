# GEMINI Project Analysis: AIMS

## 1. Project Overview

This project, "AIMS" (Agent Intelligent Management System), is a sophisticated document management system designed for insurance agents. Its primary goal is to automate and streamline the handling of documents through features like automatic metadata extraction, OCR, AI-based tagging, and case-based document grouping. The system is built as a monorepo containing multiple distinct but interconnected sub-projects.

## 2. Core Architecture

The entire project adheres to a strict **Document/View (MVC-like) architecture**. The fundamental principle is the complete separation of concerns, where the "View" (UI) is kept pure and does not directly fetch or manage data.

- **Key Principle**: Views receive data and actions from Controllers/Providers. They do not make direct API calls.
- **Data Flow**: A clear, unidirectional data flow is enforced: `Service (API) -> Document (State) -> Controller -> View`.
- **Documentation**: The architectural foundation is extensively documented in `docs/ARCHITECTURE.md`, with a specific, practical implementation for the main frontend project detailed in `frontend/aims-uix3/ARCHITECTURE.md`.

## 3. Project Structure

The repository is a monorepo with the following key directories:

- `frontend/`: Contains multiple React-based user interface projects. `aims-uix3` is the latest and most architecturally sound version.
- `backend/`: Houses Python-based API services (likely FastAPI).
- `src/`: Contains the core Python business logic modules (`docmeta`, `dococr`, `doctag`, `doccase`).
- `docs/`: Contains crucial architecture and planning documents.
- `tests/`: Contains tests for various parts of the application.

## 4. Backend (Python)

The backend consists of core data processing libraries and a set of APIs that expose this functionality.

- **Core Modules (`src/`)**:
    - `docmeta`: Extracts metadata from documents.
    - `dococr`: Performs OCR on images and PDFs.
    - `doctag`: Applies AI-based tags for classification.
    - `doccase`: Groups documents into cases.
- **APIs (`backend/api/`)**:
    - The project contains several API services, such as `doc_status_api`. These are likely built with a framework like FastAPI, as suggested by the file structure.
- **Running Tests**:
  ```bash
  # Run the Python test suite
  make test
  ```

## 5. Frontend (React: `aims-uix3`)

The primary frontend is `aims-uix3`, a modern React application built with a focus on scalability and maintainability.

- **Technology Stack**:
    - **Framework**: React 19
    - **Build Tool**: Vite
    - **Language**: TypeScript
    - **Server State**: React Query
    - **Client State**: React Context API
    - **Testing**: Vitest

- **Key Commands** (run from `frontend/aims-uix3`):
  ```bash
  # Start the development server
  npm run dev

  # Build the application for production
  npm run build

  # Run the linter
  npm run lint

  # Run unit and integration tests
  npm run test
  ```

- **Development Workflow**: Adding a new feature follows a structured, multi-layer process as defined in `frontend/aims-uix3/ARCHITECTURE.md`:
    1.  **Entity**: Define types and utilities (`src/entities`).
    2.  **Service**: Implement API business logic (`src/services`).
    3.  **Context**: Define global state (`src/contexts`).
    4.  **Provider**: Integrate Context with React Query (`src/providers`).
    5.  **Controller**: Create a custom hook for business logic (`src/controllers`).
    6.  **View**: Implement the pure UI component (`src/pages`).

## 6. Development Conventions

- **Separation of Concerns**: Strictly separate UI, state management, and business logic.
- **Centralized API Logic**: All API calls must be managed within the `Service` layer.
- **Type Safety**: Use TypeScript for all new code.
- **Styling**: Use the established CSS Custom Properties and class system. Avoid inline styles.
- **Immutability**: Treat state as immutable.
