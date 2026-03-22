const APP_CONFIG = require('../../app.json');
const BUNDLED_UPDATE_MANIFEST = require('../../update-manifest.json');

export const APP_VERSION = String(APP_CONFIG?.expo?.version ?? '1.0.0');
export const UPDATE_MANIFEST_URL = String(APP_CONFIG?.expo?.extra?.updateManifestUrl ?? '').trim();
export const PRIVACY_POLICY_URL = String(APP_CONFIG?.expo?.extra?.privacyPolicyUrl ?? '').trim();
export const RELEASE_CHANNEL = String(APP_CONFIG?.expo?.extra?.releaseChannel ?? 'production').trim();
export const BUNDLED_MANIFEST = BUNDLED_UPDATE_MANIFEST;
