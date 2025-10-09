# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds Python document services (`docmeta`, `dococr`, `doccase`, `doctag`) plus shared helpers; add new domains here.
- `backend/api` and `scripts/` host FastAPI prototypes and Node automations; manage dependencies via the local `requirements.txt` or `package.json`.
- `frontend/aims-web` and peer clients contain React views that consume controller data defined in `docs/ARCHITECTURE.md`.
- `tests/` mirrors Python modules, consuming anonymized fixtures from `samples/`; update `docs/` when contracts or flows shift.

## Build, Test, and Development Commands
- `make test` runs the full Python suite through `pytest -v`.
- `pytest -k <pattern> -vv` focuses on a specific module during iteration.
- `npm install && npm start` in a frontend package (e.g., `frontend/aims-web`) boots the React dev server; `npm test -- --watch` keeps Jest suites running.
- `node scripts/generate_customers.js 70 30` seeds demo data after `npm install` in `scripts/`; `node scripts/delete_customers.js --all` resets it.

## Coding Style & Naming Conventions
- Python: PEP 8, four-space indentation, snake_case functions, PascalCase classes, type hints; share utilities via `src/shared`.
- Enforce the Document → Controller → View split: React components under `frontend/*/src/components` stay presentation-only, while data work lives in document/controller layers.
- Node utilities remain snake_case CommonJS until the scripts toolchain migrates; document parameters in `scripts/README.md`.

## Testing Guidelines
- Name Python tests `test_<module>.py` and follow the `unittest.TestCase` pattern from `tests/test_docmeta.py`.
- Add only anonymized, lightweight fixtures to `samples/`; prefer download scripts for large originals.
- Keep API integration cases in `tests/backend-api` with documented routes and stored payloads.
- Colocate React tests as `*.test.js|tsx`, validate with `npm test`, and monitor coverage via `pytest --cov` or `npm test -- --coverage`.

## Commit & Pull Request Guidelines
- Use Conventional Commit prefixes (`feat:`, `fix:`, `chore:`); include phase markers `(3/6단계)` when they clarify scope.
- Keep commits atomic and avoid mixing Python back-end with React front-end unless the change ships together.
- PRs should state scope, note touched directories, report `make test` / `npm test`, and attach UI screenshots for visible work.
- Link tickets, call out new environment variables or migrations, and request reviewers for the owning domain before approval.

## Architecture & Collaboration Notes
- Review `docs/ARCHITECTURE.md` before altering state management and log any deviations in `docs/`.
- Keep secrets out of version control, scrub sample identifiers, and document new automation triggers plus rollback steps in `docs/`.
