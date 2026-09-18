# Delivery targets and quality contract

This document is the platform-aware contract used by Project Agent. Versions are recommendations, not hard-coded truth: the agent must verify the current stable release, release notes, runtime requirements, and breaking changes before generating a lockfile or migration.

## Target matrix

| Target | Preferred route | Required production checks |
| --- | --- | --- |
| Web / PWA | TypeScript web core, semantic HTML, responsive CSS, Web App Manifest, Service Worker | Lighthouse budgets, offline/error states, accessibility, install/update flow, CSP and secure headers |
| Android + iOS | Capacitor 8.x with official plugins, or a native WebView shell when the app needs fewer plugins | Node/Xcode/Android Studio compatibility, safe areas, keyboard, permissions, deep links, signed builds |
| React Native | React Native 0.87+ with New Architecture and strict TypeScript API | Android 15 edge-to-edge, iOS lifecycle, native navigation, accessibility, unit/integration/E2E tests |
| Flutter | Latest stable Flutter/Dart line, Material 3, platform adapters only when needed | Android/iOS/desktop matrix, widget/golden/integration tests, Impeller behavior, platform channels |
| Desktop | Tauri 2.x by default; Electron stable 44.x when Chromium parity is required | Tauri capabilities or Electron preload isolation, IPC schemas, signing, auto-update recovery, file associations |
| Native WebView | Android WebView or iOS WKWebView around the shared web core | origin/navigation policy, secure bridge, file upload/download, offline cache, back/forward, deep links |

## Shared architecture rules

1. Keep domain logic and API contracts in the shared web core.
2. Make platform APIs explicit adapters; never scatter platform checks through UI components.
3. Define a target-specific acceptance matrix before implementation.
4. Verify package versions from official release notes or the package registry before pinning them.
5. Run static checks, unit tests, integration tests, accessibility checks, responsive checks, and a production build before release.
6. Keep secrets out of the client bundle; use a server-side broker for production credentials.
7. Design for loading, empty, offline, error, retry, permission denied, and partial success states.
8. Treat user-uploaded files and model-generated code as untrusted input.

## Release gate

- Requirements and acceptance criteria are mapped to tests.
- Security review covers XSS, CSRF, SSRF, path traversal, dependency risk, secrets, IPC, and WebView navigation.
- Performance budgets are documented for startup, bundle, memory, network, and mobile battery.
- The app has a rollback/update plan and versioned migration notes.
- The final export contains a README, environment example, architecture diagram, setup commands, test commands, and known limitations.

Official starting points:

- [Capacitor support policy](https://capacitorjs.com/docs/main/reference/support-policy)
- [React Native releases](https://reactnative.dev/docs/releases)
- [Tauri releases](https://tauri.app/release/tauri/)
- [Electron releases](https://releases.electronjs.org/)
- [Flutter docs](https://docs.flutter.dev/)
