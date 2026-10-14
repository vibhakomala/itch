# Development setup

Use Node **24.21.0** from `.node-version` and pnpm **10.20.0** from `package.json`. Windows contributors can use `. ./scripts/setup-node.ps1` to download a checksum-verified official Node distribution to `.tools` and add it to the current PowerShell session. It does not install pnpm. Install pnpm with `npm install --global pnpm@10.20.0`, or use your existing package-manager installation.

From the repository root:

```sh
pnpm install
pnpm dev
```

`pnpm dev` builds the packages, then serves Vision Demo on port **5173**, bound to `0.0.0.0`. `pnpm dev:player` serves the Scratch contract harness on port **5174**. Package source edits require another package build; app source edits are handled by Vite. Use `pnpm build:packages` after changing a library and reload the app.

The demo starts without opening a camera. Use synthetic controls to check scene updates, rows, words and subscriptions, then request the camera explicitly for the preview spike. Stop releases camera tracks. Use the capability and recording controls to export evidence locally. Synthetic objects do not come from the camera pipeline.

| Command                             | Purpose                                           |
| ----------------------------------- | ------------------------------------------------- |
| `pnpm lint`                         | ESLint plus package-boundary checks               |
| `pnpm typecheck`                    | Strict package/app and test compilation           |
| `pnpm test`                         | Deterministic package tests                       |
| `pnpm build`                        | Package output and production web bundles         |
| `pnpm format` / `pnpm format:check` | Format files / verify formatting                  |
| `pnpm benchmark`                    | Report deterministic synthetic processing timings |
| `pnpm test:e2e`                     | Browser smoke tests with local mocked inputs      |

Before browser tests, run `pnpm exec playwright install chromium`. The benchmark is a development measurement; its output does not measure a physical interaction through a mobile camera and Scratch playback.

For phone/tablet camera testing over Wi-Fi, serve the app over HTTPS with a certificate trusted by the test device. [mkcert's official instructions](https://github.com/FiloSottile/mkcert) describe local certificates and trusting its development CA on other devices. Generate a certificate containing the development computer's LAN IP (replace the example IP with your own):

```powershell
New-Item -ItemType Directory -Force .certs
mkcert -install
mkcert -cert-file .certs/itch.pem -key-file .certs/itch-key.pem localhost 127.0.0.1 ::1 192.168.1.42
$env:ITCH_HTTPS_CERT = (Resolve-Path .certs/itch.pem).Path
$env:ITCH_HTTPS_KEY = (Resolve-Path .certs/itch-key.pem).Path
pnpm dev
```

Install/trust the development CA on the test device using the OS's certificate procedure, allow port 5173 in your local firewall if necessary, and open `https://192.168.1.42:5173` on the same Wi-Fi network. Verify `window.isSecureContext` is true in the capability report before requesting the camera. LAN HTTP and a certificate-warning bypass may fail secure-context camera requirements. Keep the CA private key on the development machine; certificate files belong in the ignored `.certs` directory.

Record the actual device model, OS/browser versions, selected camera, returned resolution/FPS, portrait/landscape behavior and permission recovery. Follow [testing](testing.md) for the two-minute camera smoke test and baseline report matrix. A desktop browser result cannot stand in for an iPad or Android device.
