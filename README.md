<p align="center">
  <img src="docs/brand/logo.svg" alt="AWS Tunnel Desk logo" width="128" height="128">
</p>

# AWS Tunnel Desk

AWS Tunnel Desk is a cross-platform desktop application for discovering AWS CLI profiles, checking AWS IAM Identity Center (SSO) sessions, and managing local tunnels to AWS resources through AWS Systems Manager Session Manager.

The project is open source and designed for cloud engineers, developers, database administrators, and platform teams that need a safer, repeatable alternative to manually assembled SSM port-forwarding commands.

> [!IMPORTANT]
> AWS Tunnel Desk is an independent community project. It is not affiliated with, sponsored by, or endorsed by Amazon Web Services. AWS and related service names are trademarks of Amazon.com, Inc. or its affiliates.

## Why AWS Tunnel Desk

- Discovers AWS CLI profiles already configured on the computer.
- Detects connected, expired, and unavailable SSO sessions.
- Discovers visible RDS endpoints, EC2 instances, and Systems Manager managed nodes.
- Requires explicit local approval before a discovered destination can be used.
- Suggests an available local port from `15432` through `15531` and validates it again before opening a tunnel.
- Supports multiple concurrent tunnels, including several resources from the same AWS account: approving or connecting one destination never blocks another, and each tunnel gets its own automatically chosen local port.
- Supports the native AWS CLI on Windows, macOS, and Linux, plus WSL1 and WSL2 on Windows.
- Keeps a bounded local activity history without storing AWS credentials.
- Presents the interface in English, Portuguese, or Spanish based on the operating-system locale, with English as the fallback.
- Runs from a system tray icon: closing the window keeps the app and any active tunnel running in the background, ready to reopen from the tray.

## Security model

AWS Tunnel Desk orchestrates tools installed on the user's computer. It does not replace AWS authorization controls.

- The application does not store AWS access keys, SSO tokens, database passwords, or Secrets Manager values.
- It does not execute SQL or call `secretsmanager:GetSecretValue`.
- The backend accepts tunnel requests only when the resource, port, profile, Region, and SSM target exactly match a locally approved destination.
- IAM policies, security groups, routes, database permissions, and operating-system controls remain authoritative.
- Active tunnels listen on loopback only and are tied to a managed child process.

Read [SECURITY.md](SECURITY.md) before deploying the application in a sensitive environment.

## Supported packages

Tagged releases are built natively by GitHub Actions:

| Platform | Package | Architecture |
| --- | --- | --- |
| Windows | `.msi` | x86-64, ARM64 |
| macOS | `.dmg` | Apple Silicon (ARM64), Intel (x86-64) |
| Debian and Ubuntu | `.deb` | x86-64, ARM64 |
| Fedora, RHEL, and compatible systems | `.rpm` | x86-64, ARM64 |
| Other compatible Linux distributions | `.AppImage` | x86-64, ARM64 |

The macOS artifact is ad-hoc signed unless the repository maintainers configure Apple signing and notarization secrets. The Windows installer is also unsigned until the project configures an Authenticode certificate. Operating systems may display security warnings for these community builds. Production maintainers should configure platform signing before announcing a generally available release; signing credentials must be stored only as protected GitHub secrets.

## Runtime requirements

AWS Tunnel Desk checks these dependencies when it starts and provides platform-specific guidance when something is missing:

- AWS CLI v2
- AWS Session Manager Plugin
- At least one AWS CLI profile
- A valid SSO session or another credential source supported by the AWS CLI
- IAM permission to describe the resources being discovered and to start the intended SSM session

When the Windows WSL runner is selected, the AWS CLI and Session Manager Plugin must be installed inside the selected WSL distribution.

## Development setup

Prerequisites:

- Node.js 22 LTS or newer
- npm 10 or newer
- Rust stable, with the toolchain required by Tauri
- Platform-specific [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

Install dependencies and start the desktop application:

```bash
npm ci
npm run tauri dev
```

Run the repository checks:

```bash
npm run check
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-features
```

Build native packages for the current platform:

```bash
npm run tauri build
```

Native installers must be built on their target operating system. The release workflow is the authoritative packaging path.

## Release process

1. Update the version in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
2. Run `npm run check` and the Rust checks shown above.
3. Merge the release commit into the default branch.
4. Create and push a semantic-version tag such as `v0.2.0`.
5. GitHub Actions validates the tag against all three manifests, builds every package, and creates the GitHub Release.

The workflow rejects tags that do not match the source manifests. Tags are release boundaries and must not be moved after publication.

## Contributing

Community contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), follow the [Code of Conduct](CODE_OF_CONDUCT.md), and use the issue forms before opening a pull request.

Good first contributions include:

- support for additional AWS resources and Session Manager document modes;
- accessibility and keyboard-navigation improvements;
- test coverage for Windows, macOS, Linux, WSL1, and WSL2;
- translations and copy review;
- safer dependency detection and installation guidance;
- documentation and packaging improvements.

AI-assisted contributions are accepted when the contributor understands, reviews, tests, and takes responsibility for the submitted change. See [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md).

## Project status

AWS Tunnel Desk is under active development. Review the release notes and known issues before using it for production access workflows. Never assume the application grants or restricts AWS access; verify the effective IAM and network controls independently.

## License

Licensed under the [Apache License 2.0](LICENSE).
