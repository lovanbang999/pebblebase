# Security Policy

Pebblebase takes the security of stored database credentials and server infrastructure very seriously.

---

## Supported Versions

Only the latest release version of Pebblebase receives security patches and vulnerability updates.

| Version | Supported |
|---|---|
| `v0.1.x` | Yes |
| `< 0.1.0` | No |

---

## Reporting a Vulnerability

If you discover a security vulnerability within Pebblebase, please report it responsibly. **Do not create a public GitHub Issue for security vulnerabilities.**

### Disclosure Process

1. Email your report privately to the maintainers or use GitHub Security Advisories.
2. Include a detailed description of the vulnerability, steps to reproduce, and proof of concept if available.
3. The maintainers will acknowledge receipt of your vulnerability report within **48 hours** and provide regular progress updates.
4. Once resolved, a patch release will be issued alongside a public security advisory giving proper credit to the reporter.

---

## Security Model Overview

- **AES-256-GCM Encryption**: Connection passwords and sensitive credentials are encrypted at rest using AES-256-GCM authenticated encryption before being written to the local SQLite database.
- **Master Key**: The encryption master key is supplied via `PEBBLEBASE_MASTER_KEY` environment variable, ensuring separation of secrets from the data storage volume.
- **No Remote Telemetry**: Pebblebase operates completely self-hosted with zero external analytics or data exfiltration.
