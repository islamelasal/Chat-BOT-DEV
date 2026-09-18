export const DELIVERY_TARGETS = Object.freeze({
  'web-pwa': {
    label: 'Web + PWA',
    stack: 'Modern web app with TypeScript, semantic HTML, responsive CSS, Web App Manifest, Service Worker, offline strategy and installable PWA.',
    acceptance: ['responsive mobile/tablet/desktop', 'installable PWA', 'offline and error states', 'accessibility and performance budget']
  },
  'capacitor-mobile': {
    label: 'Android + iOS عبر Capacitor',
    stack: 'Web app packaged with Capacitor 8.x and official plugins; verify current Node, Xcode, Android Studio, SDK and platform requirements before implementation.',
    acceptance: ['safe area and keyboard handling', 'deep links and app lifecycle', 'native permission review', 'signed Android/iOS build instructions']
  },
  'react-native': {
    label: 'React Native',
    stack: 'React Native 0.87+ with the New Architecture and strict TypeScript APIs; verify the latest stable patch and native compatibility before coding.',
    acceptance: ['Android/iOS parity', 'edge-to-edge layouts', 'native navigation and accessibility', 'release build and crash-safe states']
  },
  flutter: {
    label: 'Flutter',
    stack: 'Flutter stable 3.x with Dart stable, Material 3, Impeller where supported, and platform-specific integration only when justified.',
    acceptance: ['adaptive layouts', 'platform channels isolated', 'golden/widget/integration tests', 'Android/iOS/desktop build matrix']
  },
  tauri: {
    label: 'Desktop عبر Tauri',
    stack: 'Tauri 2.x with capability-based permissions, Rust commands kept minimal, signed installers and native WebView security defaults.',
    acceptance: ['Windows/macOS/Linux packaging', 'capability allowlist review', 'auto-update and signing plan', 'native file and deep-link tests']
  },
  electron: {
    label: 'Desktop عبر Electron',
    stack: 'Electron stable 44.x or the current supported stable line, with context isolation, sandbox, preload bridge, ASAR integrity and auto-update signing.',
    acceptance: ['main/renderer isolation', 'IPC schema validation', 'Windows/macOS/Linux installers', 'security audit and update recovery']
  },
  webview: {
    label: 'WebView مخصص',
    stack: 'Native Android WebView or iOS WKWebView shell around the web product, with navigation policy, offline cache, file handling and secure message bridge.',
    acceptance: ['secure origin and navigation rules', 'bridge input validation', 'back/forward and deep links', 'offline and upload behavior']
  },
  universal: {
    label: 'Universal delivery plan',
    stack: 'Keep a platform-neutral web core, then add thin adapters for PWA, mobile and desktop. Avoid duplicating business logic.',
    acceptance: ['shared domain logic', 'target-specific adapters', 'consistent design tokens', 'CI matrix for every selected target']
  }
});

export function getDeliveryTarget(id) {
  return DELIVERY_TARGETS[id] || DELIVERY_TARGETS.universal;
}

export function buildDeliveryTargetInstruction(settings = {}) {
  const target = getDeliveryTarget(settings.deliveryTarget);
  return `هدف التسليم المختار: ${target.label}.\nالبنية المقترحة: ${target.stack}\nمعايير القبول الإضافية: ${target.acceptance.join('؛ ')}.\nلا تنفذ ترقية عمياء؛ تحقق من أحدث patch والإصدارات المدعومة وbreaking changes قبل تثبيت أي dependency.`;
}

export function buildDeliveryChecklist(settings = {}) {
  const target = getDeliveryTarget(settings.deliveryTarget);
  return [
    'متطلبات وظيفية مكتوبة وقابلة للاختبار',
    'معايير قبول مرتبطة بكل feature',
    'تصميم responsive وaccessible',
    'حماية الأسرار والمدخلات والاتصالات',
    'حالات loading/empty/error/offline',
    'اختبارات unit/integration/e2e حسب المنصة',
    'ميزانية أداء ومراقبة أخطاء',
    'توثيق التشغيل والبناء والتوقيع والتوزيع',
    `متطلبات ${target.label}: ${target.acceptance.join('، ')}`
  ];
}
