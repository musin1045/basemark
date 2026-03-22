import {
  APP_VERSION,
  BUNDLED_MANIFEST,
  RELEASE_CHANNEL,
  UPDATE_MANIFEST_URL,
} from './releaseInfo';

function parseVersionParts(version) {
  return String(version ?? '')
    .trim()
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

export function compareVersions(leftVersion, rightVersion) {
  const leftParts = parseVersionParts(leftVersion);
  const rightParts = parseVersionParts(rightVersion);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;

    if (leftValue > rightValue) {
      return 1;
    }

    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

function normalizeManifest(rawManifest = {}, source = 'bundled') {
  const latestVersion = String(
    rawManifest?.latestVersion ?? rawManifest?.version ?? rawManifest?.latest ?? APP_VERSION
  ).trim();
  const minimumSupportedVersion = String(
    rawManifest?.minimumSupportedVersion ??
      rawManifest?.minimumVersion ??
      rawManifest?.minimum ??
      latestVersion
  ).trim();
  const headline = String(
    rawManifest?.headline ??
      rawManifest?.title ??
      (compareVersions(APP_VERSION, latestVersion) < 0 ? '새 버전이 있습니다.' : '현재 버전이 최신입니다.')
  ).trim();
  const message = String(
    rawManifest?.message ??
      rawManifest?.description ??
      '앱 개선 사항과 배포 안내를 여기에서 확인할 수 있습니다.'
  ).trim();
  const downloadUrl = String(
    rawManifest?.downloadUrl ?? rawManifest?.url ?? rawManifest?.landingUrl ?? ''
  ).trim();
  const publishedAt = String(
    rawManifest?.publishedAt ?? rawManifest?.releasedAt ?? rawManifest?.date ?? ''
  ).trim();

  return {
    currentVersion: APP_VERSION,
    latestVersion,
    minimumSupportedVersion,
    headline,
    message,
    downloadUrl,
    publishedAt,
    releaseChannel: String(rawManifest?.releaseChannel ?? RELEASE_CHANNEL).trim(),
    source,
  };
}

export function buildUpdateState(manifest) {
  const normalizedManifest = normalizeManifest(manifest);
  const hasUpdate = compareVersions(normalizedManifest.currentVersion, normalizedManifest.latestVersion) < 0;
  const isRequired =
    compareVersions(normalizedManifest.currentVersion, normalizedManifest.minimumSupportedVersion) < 0;

  return {
    ...normalizedManifest,
    hasUpdate,
    isRequired,
    checkedAt: new Date().toISOString(),
  };
}

export async function checkForAppUpdate() {
  let manifest = normalizeManifest(BUNDLED_MANIFEST, 'bundled');
  let fetchErrorMessage = '';

  if (UPDATE_MANIFEST_URL) {
    try {
      const response = await fetch(UPDATE_MANIFEST_URL, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`업데이트 정보를 불러오지 못했습니다. (${response.status})`);
      }

      const remoteManifest = await response.json();
      manifest = normalizeManifest(remoteManifest, 'remote');
    } catch (error) {
      fetchErrorMessage =
        String(error?.message ?? '').trim() || '업데이트 정보를 불러오지 못했습니다.';
    }
  }

  return {
    ...buildUpdateState(manifest),
    fetchErrorMessage,
  };
}
