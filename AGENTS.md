# Instructions for Coding Agents

These instructions apply to every automated coding agent working in this repository.

## Product principles

- The product name is **AWS Tunnel Desk**.
- Treat the repository as public. Never add credentials, tokens, private endpoints, account IDs, personal paths, machine names, screenshots containing customer data, or internal company references.
- Keep source code, comments, commit messages, documentation, issue templates, and contributor guidance in English.
- Portuguese and Spanish are supported product translations and belong only in localization catalogs or locale-specific test fixtures.
- Do not imply affiliation with or endorsement by Amazon Web Services.

## Security boundaries

- Never read, reveal, persist, or log AWS credentials, SSO tokens, database passwords, or Secrets Manager values.
- Never add `secretsmanager:GetSecretValue` behavior without an approved security design and maintainer review.
- Never accept arbitrary shell commands, manually entered remote hosts, or manually entered SSM target IDs from the frontend.
- Preserve the local approval boundary: profile, Region, resource, remote port, connection mode, and SSM target must match a resource discovered through the selected AWS CLI profile.
- Keep tunnel listeners bound to loopback.
- Treat every value returned by the AWS CLI as untrusted input. Pass arguments as process arguments, not through shell interpolation.
- Avoid destructive AWS operations. The application is an access orchestrator, not a resource-management console.

## Engineering rules

- Use `npm ci` for reproducible JavaScript installs.
- Keep `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` versions synchronized.
- Keep generated directories out of version control: `node_modules`, `dist`, and `src-tauri/target`.
- Add or update tests for behavior changes.
- Run the relevant checks before reporting completion:

```bash
npm run check
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-features
```

- Do not weaken Content Security Policy or Tauri capabilities to make a feature easier to implement.
- Do not modify release workflows, permissions, signing behavior, or installer targets without explaining the supply-chain impact in the pull request.

## User experience

- Preserve keyboard access, visible focus, reduced-motion support, and readable status text in addition to color.
- Long-running operations must provide a clear loading state and remain cancellable when cancellation is safe.
- The application should explain missing local dependencies without silently installing them.
- Platform instructions must cover Windows native execution, WSL1, WSL2, macOS, and Linux where applicable.

## Pull requests

- Keep changes focused and reviewable.
- Explain security and cross-platform implications.
- Include test evidence and screenshots for visible changes.
- Use synthetic data in screenshots and fixtures.
- Do not claim support for a platform that was not exercised in CI or documented as unverified.
