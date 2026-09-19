# SWOP

**SWOP (Siade Whales Operations Platform)** is a portable Windows desktop app by Siade Whales Company for creating paper wallets, sending funds and connecting to dApps. Keys are handled on your computer and never leave it.

> **Source available, not open source.** You can read, build and test this code. You cannot modify it, redistribute it or use it commercially. See [License](#license).

## What it does

- Offline paper wallet generation per network: public address, private key, recovery phrase and QR.
- Batches of up to 100 wallets in a password-encrypted `.swopvault` file (PBKDF2-SHA256 with 600,000 iterations + AES-256-GCM) that SWOP can open again.
- Local signing and sending on supported networks, with fee estimate, MAX and a downloadable receipt.
- dApp connections through WalletConnect. Approvals, permits, Permit2, `setApprovalForAll` and marketplace orders are decoded and flagged before you sign. `eth_sign` is disabled.
- Token detection and a token risk indicator.
- **SWOP Scan**: read QR codes with the camera of any phone or tablet, in the browser, with nothing to install. End-to-end encrypted.
- Siade Guard: blocks versions that are no longer supported.
- 43 languages.

## Security model

- Private keys and recovery phrases live only in memory while the app is open. Local storage and session data are wiped on start and on exit.
- Copied keys and phrases are removed from the clipboard after 30 seconds and on exit. Windows clipboard history (Win+V) can keep its own copy, so keep it turned off.
- The window cannot navigate to other pages or embed webviews; links open in the system browser. The renderer runs with `contextIsolation` and `sandbox`.
- SWOP denies all system permission requests (camera, microphone, location) and does not run as administrator.
- Unlimited approvals, permits and orders require an explicit confirmation before they can be approved.
- The plain-text batch file is only created when you choose it explicitly. Batches are encrypted by default.
- To show balances and token risk, SWOP sends **public addresses** (never keys) to public RPC endpoints of each network, Etherscan, Ethplorer, honeypot.is and mempool.space.

Relevant code: [`electron/main.cjs`](electron/main.cjs), [`client/src/services/txInsight.js`](client/src/services/txInsight.js), [`client/src/services/vaultFile.js`](client/src/services/vaultFile.js), [`client/src/services/walletconnect.js`](client/src/services/walletconnect.js).

## SWOP Scan protocol

1. SWOP creates a random room id (16 bytes) and a new AES-256 key and shows them as a QR: `https://siadewhales.com/scan#v1.<room>.<key>`.
2. The phone opens that link in its browser. Everything after `#` stays on the device: browsers never send the fragment to the server, and the page removes it from the address bar as soon as it loads.
3. Every message is encrypted with AES-256-GCM (12-byte IV, additional data `swop-scan-v1|<room>|<box>`). Messages older than 5 minutes are ignored.
4. `siadewhales.com/api/scan-relay` only forwards encrypted envelopes. They are kept in memory for up to 5 minutes, and rooms expire after 15 minutes.
5. Closing SWOP closes the session on the phone too.

Desktop side: [`client/src/services/phoneScan.js`](client/src/services/phoneScan.js). The phone page is served at `https://siadewhales.com/scan` and can be inspected in any browser.

## Build

Requirements: Windows, Node.js 20 LTS or newer.

```powershell
npm install
```

Development (two terminals):

```powershell
npm run dev
```

```powershell
npm run electron:dev
```

Portable executable:

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY="false"
npm run release:portable
```

The result is `release/SWOP-<version>-portable.exe`.

## Official releases

Official builds are distributed from [siadewhales.com](https://siadewhales.com/swop.html). Check the SHA-256 of your download before running it:

```powershell
Get-FileHash .\SWOP-2.1.4-portable.exe -Algorithm SHA256
```

| Version | File | SHA-256 |
| --- | --- | --- |
| 2.1.4 | `SWOP-2.1.4-portable.exe` | `b6d0dbd573ffb66e163e273b080e5f5b2dd4cd2213004d13c92f46ce5015a01c` |
| 2.1.3 | `SWOP-2.1.3-portable.exe` | `7ff0d0bb5643a8b97cb13d6f609c189500a3c9b928734d8954aee20926b48c43` |
| 2.1.2 | `SWOP-2.1.2-portable.exe` | `d02572a6b57d480f6ea633f9165e78f100a5f49b30906c1787a3fd2cf26526ba` |
| 2.1.1 | `SWOP-2.1.1-portable.exe` | `d0ba3719e99d492ac9a4740e6d92b94497e861aca90775f8ac72fcf1fa82a410` |
| 2.1.0 | `SWOP-2.1.0-portable.exe` | `304a9a3606977473304a78cc2b92fdce4c22786e278ba3ea4019b1e58d79e19d` |

The executables are not code-signed yet, so Windows SmartScreen may show a warning.

## Reporting a vulnerability

Please do not open a public issue. See [SECURITY.md](SECURITY.md).

## License

Copyright (c) 2026 Siade Whales Company. Licensed under the [PolyForm Strict License 1.0.0](LICENSE.md).

In short, and without replacing the license text:

- **You may** read the code, build it and run it for personal, non-commercial purposes such as study, testing or security review.
- **You may not** modify it, create derivative works, redistribute it or use it commercially.

GitHub's Terms of Service let GitHub users view and fork public repositories on GitHub. That does not grant any right beyond the license above. For any other use, contact Siade Whales Company through [siadewhales.com](https://siadewhales.com).

---

*Versión en español: SWOP es la aplicación de escritorio de Siade Whales. El código se publica para que cualquiera pueda leerlo y probarlo; no se permite modificarlo, redistribuirlo ni usarlo con fines comerciales.*
