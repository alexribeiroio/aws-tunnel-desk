## Summary

Describe the problem and the solution. Keep the scope focused.

## Related issue

Closes #

## Type of change

- [ ] Bug fix
- [ ] Feature
- [ ] AWS resource support
- [ ] Security hardening
- [ ] Documentation
- [ ] Refactoring or maintenance
- [ ] Build, packaging, or CI

## Security and privacy

- [ ] I reviewed process execution, persistence, local ports, AWS CLI output, and SSM target handling affected by this change.
- [ ] The change does not add credentials, tokens, private endpoints, account IDs, personal paths, or customer data.
- [ ] Screenshots and fixtures use synthetic data.
- [ ] The local destination approval boundary remains enforced, or the security design change is explained below.

Security impact:

## Validation

- [ ] `npm run check`
- [ ] `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`
- [ ] `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml --all-features`
- [ ] Native package or affected platform tested when applicable

List tested operating systems, runner types, and commands:

## User interface changes

Attach before-and-after screenshots with synthetic data, or write `Not applicable`.

## AI assistance

- [ ] No material AI assistance
- [ ] AI assistance was used and every changed line was reviewed, understood, and tested by the contributor

Describe material AI assistance when applicable:

## Remaining risks

List untested platforms, known limitations, migrations, and follow-up work.
