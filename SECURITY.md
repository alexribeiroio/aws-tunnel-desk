# Security Policy

AWS Tunnel Desk manages local processes that can reach private AWS resources. Security reports are handled with care and should not be disclosed through public issues.

## Supported versions

Security fixes are provided for the latest published release. Before the first stable release, fixes are provided on the default branch and included in the next release.

## Reporting a vulnerability

Use GitHub's **Report a vulnerability** feature in the repository Security tab to open a private security advisory.

Include:

- the affected version or commit;
- the operating system and runner type;
- prerequisites and required AWS permissions;
- reproduction steps using synthetic data;
- the expected and observed security boundary;
- potential impact;
- a proposed mitigation, if available.

Do not include real credentials, SSO tokens, private endpoints, account IDs, customer data, or exploit traffic against systems you do not own.

You should receive an acknowledgement within seven days. Validation and remediation timelines depend on severity and reproducibility. Maintainers will coordinate disclosure after a fix or documented mitigation is available.

## Security scope

Reports are especially useful for:

- command or argument injection;
- bypass of local destination approval;
- tunnel listeners exposed beyond loopback;
- credential, token, secret, or sensitive log disclosure;
- unsafe persistence or file permissions;
- child-process lifecycle failures that leave tunnels running;
- malicious AWS CLI output influencing execution;
- privilege escalation during dependency installation;
- release workflow or dependency supply-chain compromise.

Misconfigured IAM policies, security groups, routes, databases, or third-party AWS CLI plugins are generally outside this project's control, but reports showing that AWS Tunnel Desk makes such a condition worse are welcome.

## Safe research

Test only with accounts and systems you are authorized to use. Avoid privacy violations, service disruption, data destruction, and persistence after testing. Give maintainers reasonable time to investigate before public disclosure.
