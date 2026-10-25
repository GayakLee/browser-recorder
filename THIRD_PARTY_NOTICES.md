# Third-party notices

The repository's MIT License covers original Browser Recorder code. It does not replace dependency licenses or grant rights to websites, trademarks, or recorded material.

## JavaScript dependencies

This repository contains manifests, not copies of installed dependencies. `npm ci` installs direct and transitive packages from `package-lock.json`. Preserve their supplied LICENSE and NOTICE files when redistributing an installed application.

| Component | Direct version | License | Upstream |
| --- | --- | --- | --- |
| Playwright | 1.64.1 | Apache-2.0 | [microsoft/playwright](https://github.com/microsoft/playwright) |
| Model Context Protocol TypeScript SDK | 1.32.2 | MIT | [modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk) |
| Zod | 4.6.7 | MIT | [colinhacks/zod](https://github.com/colinhacks/zod) |

Playwright also installs `playwright-core`. Its supplied NOTICE identifies Microsoft Corporation and acknowledges code derived from Puppeteer under Apache-2.0. Refer to installed packages for full terms. The table lists direct dependencies only; transitive dependencies retain their own licenses.

## Browser and media runtimes

Chromium is installed separately by Playwright. Its distribution includes BSD-style project terms and numerous third-party components. Consult the [Chromium source license](https://chromium.googlesource.com/chromium/src/+/main/LICENSE) and notices shipped with the exact browser distribution.

FFmpeg is invoked as an external child process. FFmpeg, Chromium, Playwright recording-support binaries, and Node.js are not bundled in this repository. Their licenses do not become MIT through this project.

FFmpeg's applicable license depends on build options. This project requests `libx264`, which FFmpeg's documentation identifies as a GPL component. Before distributing a package containing these binaries, inspect the actual build and comply with its license, notices, and corresponding-source requirements. Such a binary bundle must not be described as MIT-only. See [FFmpeg legal information](https://ffmpeg.org/legal.html) and [external library documentation](https://ffmpeg.org/general.html#External-libraries).

## Content and branding

External website imagery, names, logos, and text remain subject to their respective rights. Tests visiting Python.org or MDN do not imply endorsement. Recordings and screenshots are excluded from Git. No third-party browser logo is used as a project icon; a custom Browser Recorder icon has not been selected.
