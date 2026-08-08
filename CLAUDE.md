# Claude Development Guide

Claude and other AI coding tools must follow [AGENTS.md](AGENTS.md) as the authoritative repository-wide instruction set.

Before changing code:

1. Read `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, and `SECURITY.md`.
2. Inspect the current implementation and tests instead of assuming the issue description matches the code.
3. Identify security boundaries affected by the change, especially process execution, persistence, AWS CLI output, local ports, and SSM targets.

Before finishing:

1. Run the checks required by `AGENTS.md`.
2. Search the changed files for credentials, personal paths, private AWS identifiers, and non-English comments.
3. Report what was verified and what remains unverified.

Generated output is not evidence by itself. The contributor who submits an AI-assisted change remains responsible for its correctness, security, licensing, and maintainability.
