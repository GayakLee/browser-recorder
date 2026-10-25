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

External website imagery, names, logos, and text remain subject to their respective rights. Tests visiting Python.org or MDN do not imply endorsement. Recording outputs are excluded from Git; the curated README preview is included and demonstration videos are distributed as release assets. No third-party browser logo is used as a project icon; a custom Browser Recorder icon has not been selected.

## Demo content attribution

The demo videos and assets/wikipedia-demo.jpg and assets/wikipedia-demo.gif show English Wikipedia as recorded on October 25, 2026. Article text is by Wikipedia contributors and is reused under [Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Sources and contributor histories:

- [Web browser](https://en.wikipedia.org/wiki/Web_browser), [history and contributors](https://en.wikipedia.org/w/index.php?title=Web_browser&action=history).
- [Computer animation](https://en.wikipedia.org/wiki/Computer_animation), [history and contributors](https://en.wikipedia.org/w/index.php?title=Computer_animation&action=history).

Changes made for the demonstration are screen capture, physical zoom, scrolling, search/navigation, and resized static/animated previews. The animated README preview is downsampled to 8fps and loops. The comparison also synchronizes and crops the captures into two views and adds FPS labels. No motion interpolation was used. Original recording/editing contributions to these demos and the preview are made available under CC BY-SA 4.0; the project's MIT License applies to the software, not the captured article content.

Images and embedded media visible within the articles retain their separate licenses and author credits, accessible through each media item on the linked article pages. Wikipedia names and marks remain subject to their respective rights. No endorsement is implied. See [Wikipedia copyright and reuse information](https://en.wikipedia.org/wiki/Wikipedia:Copyrights).
