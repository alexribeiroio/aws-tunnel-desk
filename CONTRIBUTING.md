# Contributing to AWS Tunnel Desk

Thank you for helping make secure AWS access workflows easier to operate. Contributions from different experience levels, platforms, and cloud environments are welcome.

## Before you start

- Search existing issues and pull requests.
- For bugs, feature ideas, documentation gaps, and new AWS resource support, open the matching issue form.
- For a security vulnerability, follow [SECURITY.md](SECURITY.md) and do not open a public issue.
- For a substantial architectural change, open a feature request before investing in implementation.

## Development workflow

1. Fork the repository and create a focused branch from the default branch.
2. Install dependencies with `npm ci`.
3. Run the app with `npm run tauri dev`.
4. Add tests for changed behavior.
5. Run all relevant checks.
6. Open a pull request using the repository template.

Use concise branch names such as `fix/tunnel-process-cleanup` or `feat/redshift-discovery`.

## Required checks

```bash
npm run check
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-features
```

Run `npm run tauri build` when changing bundling, permissions, native code, or platform integration. Cross-platform changes should include evidence from the affected operating systems whenever possible.

## Coding standards

- Write code, comments, tests, documentation, and contributor-facing text in English.
- Keep Portuguese and Spanish content inside localization catalogs.
- Prefer small functions with explicit error handling.
- Treat AWS CLI output and persisted data as untrusted input.
- Avoid shell interpolation. Use structured process arguments and validate identifiers at trust boundaries.
- Preserve reduced-motion and keyboard-navigation behavior in the interface.
- Do not commit generated files, dependencies, logs, local configuration, or screenshots with real account data.

## Commits and pull requests

Conventional Commit prefixes are encouraged:

- `feat:` new user-facing behavior;
- `fix:` defect correction;
- `docs:` documentation only;
- `test:` test coverage;
- `refactor:` internal change without intended behavior change;
- `build:` packaging or dependency changes;
- `ci:` automation changes;
- `security:` security hardening.

A pull request should:

- solve one coherent problem;
- link the related issue;
- explain user impact and security implications;
- list the checks that were run;
- include synthetic screenshots for visual changes;
- call out platform behavior that was not tested.

Maintainers may request that a large pull request be split before review.

## Adding AWS resource support

New resource support must document:

- the AWS APIs used for discovery;
- the minimum IAM read permissions;
- the Session Manager document and connection mode;
- how the remote host and port are derived without manual injection;
- network assumptions;
- behavior when no compatible managed node is available;
- unit and integration test coverage;
- user-facing documentation.

Resource discovery must remain read-only. Opening the SSM session is the only intended AWS-side action in the normal tunnel workflow.

## Translations

English is the source language. Portuguese and Spanish translations should preserve the security meaning of the source text, not merely translate words literally. Add tests when changing dynamic localization patterns.

## AI-assisted contributions

AI tools may be used, but the contributor must:

- disclose material AI assistance in the pull request;
- review every changed line;
- verify generated dependencies and licenses;
- run the required checks;
- remove fabricated claims, personal paths, secrets, and unrelated changes;
- be able to explain and maintain the contribution.

## License

By submitting a contribution, you agree that it is licensed under the Apache License 2.0 as described in [LICENSE](LICENSE).
