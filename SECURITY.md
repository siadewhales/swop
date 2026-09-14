# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report them privately through GitHub: open the **Security** tab of this repository and choose **Report a vulnerability**. Only the maintainers can see the report.

Please include:

- The SWOP version (shown in the app) and your Windows version.
- What an attacker could do, and under which conditions.
- Steps to reproduce it, or a proof of concept.

We will reply in the advisory, keep you informed while we work on a fix, and credit you in the release notes if you want.

## Scope

- The SWOP desktop app in this repository.
- The SWOP Scan protocol (desktop side in `client/src/services/phoneScan.js`, phone page at `https://siadewhales.com/scan`).

## Supported versions

Only the latest release is supported. Siade Guard blocks versions that are no longer supported, so fixes are shipped as a new release.

## Safe harbor

Testing is welcome on your own computer and with your own wallets. Please do not access other people's data or funds, and do not run load tests against siadewhales.com.
