# Contributing to Scalytics Connect

Thanks for contributing. This document defines the expected workflow for issues, changes, and pull requests.

## Ground Rules

- Be respectful and constructive. Follow `CODE_OF_CONDUCT.md`.
- Keep changes focused and reviewable.
- Write clear commit messages and PR descriptions.
- Include tests or explain why tests are not applicable.
- Never commit secrets, keys, or credentials.

## Development Setup

Prerequisites:

- Node.js 20+
- npm 10+
- Python 3.11+ (for Python services and sanity checks)

Backend setup:

```bash
npm install
npm run setup
npm run dev
```

Frontend setup (separate shell):

```bash
cd frontend
npm install
npm start
```

## Branching and Commits

- Branch from `main`.
- Use short, descriptive branch names:
  - `feat/<name>`
  - `fix/<name>`
  - `docs/<name>`
  - `chore/<name>`
- Keep PRs small enough for targeted review.

## Coding Standards

- Follow existing project patterns in `src/`, `frontend/`, and `scripts/`.
- Run lint and tests before opening a PR:

```bash
npm run lint
npm test -- --runInBand --passWithNoTests
cd frontend && npm run build
```

- For Python changes, ensure code compiles:

```bash
python -m compileall scripts src/python_services
```

## Pull Request Process

1. Open an issue first for large or breaking changes.
2. Open a PR with:
   - concise summary
   - rationale
   - testing notes
   - migration notes if applicable
3. Link related issues (`Fixes #<id>`).
4. Ensure CI is green before requesting final review.
5. Obtain approval from a code owner/maintainer.

## Release and Versioning

- This project uses Semantic Versioning (`MAJOR.MINOR.PATCH`).
- User-facing notable changes should be recorded in `CHANGELOG.md`.
- `RELEASE_NOTES.md` can be used for richer release narratives.

## Security

If you find a vulnerability, do not open a public issue. Follow `SECURITY.md`.
