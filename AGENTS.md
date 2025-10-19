# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains Python services (`docmeta`, `dococr`, `doctag`, `doccase`, `shared`). Keep orchestration thin and respect the Document→Controller→View workflow in `docs/ARCHITECTURE.md`.
- `backend/` hosts operational code: embedding pipelines and `n8n_flows/` automations. Treat these as integration surfaces and keep secrets outside git.
- `frontend/` stores UI experiments (`aims-uix*`, `document-monitor`); each package is isolated, with providers handling data and presentational components focusing on UI.
- `tests/` mirrors the services with pytest suites, while shared fixtures sit under `samples/`.
- `scripts/` houses Node helpers like `generate_customers.js` and CLI utilities; additional Python tooling lives in `tools/`.

## Build, Test, and Development Commands
- `source venv/bin/activate` reuses the shared interpreter; create it with `python -m venv venv` when missing.
- `make test` or `PYTHONPATH=$(pwd) pytest -v` runs the full backend/unit suite.
- `pytest tests/test_docmeta.py -k happy_path` focuses on a single module.
- `python scripts/run_docmeta.py --file samples/pdf/보험청구서.pdf` smoke-tests the document metadata pipeline.
- `npm install --prefix scripts` then `npm run generate-customers --prefix scripts` seeds demo customer data for API testing.

## Coding Style & Naming Conventions
- Python code uses 4-space indentation, `snake_case`, and type hints where practical (see `src/docmeta/core.py`). Keep shared helpers in `src/shared/` and avoid side effects in module scope.
- React/TSX code lives under `frontend/*/src/components`; use `PascalCase` for components, `camelCase` for hooks, and route API calls through services or contexts per the architecture guide.
- No formatter runs in CI, so match the existing style and favor structured logging over `print` debugging.

## Testing Guidelines
- Name tests for behavior (`test_doccase_handles_empty_batch`) and colocate them with related modules inside `tests/`.
- Store reusable inputs in `samples/` and load them via relative paths to keep runs hermetic.
- Cover OCR, tagging, and clustering edge cases alongside happy paths, and add a regression test whenever fixing a bug.

## Commit & Pull Request Guidelines
- Use Conventional Commits (`feat(document-library): ...`, `docs(claude): ...`); keep subjects imperative and ≤72 characters.
- PRs should describe scope, list automated/manual test evidence, and link the relevant issues. Attach screenshots or payload snippets for UI or API changes.
- Request review from the owning lead (backend/frontend) and capture follow-up actions in the PR checklist or linked tasks.

## Security & Configuration Tips
- Keep credentials and personal data out of git; rely on local `.env` files ignored by git.
- Revisit `docs/ARCHITECTURE.md` before changing data flows to maintain controller mediation and fetch-free views.
