const VERSION_URL = 'https://siadewhales.com/api/whales-operations/version.json';

function compareVersions(remote, local) {
  const r = String(remote || '0.0.0').split('.').map(Number);
  const l = String(local || '0.0.0').split('.').map(Number);
  for (let i = 0; i < Math.max(r.length, l.length); i += 1) {
    if ((r[i] || 0) > (l[i] || 0)) return 1;
    if ((r[i] || 0) < (l[i] || 0)) return -1;
  }
  return 0;
}

export async function checkVersionGate() {
  const localVersion = await window.whales?.getVersion?.() || '1.0.0';
  const savedLock = await window.whales?.getVersionLock?.();
  if (savedLock?.blockedVersion && compareVersions(savedLock.blockedVersion, localVersion) > 0) {
    return {
      status: 'blocked',
      message: savedLock.message,
      downloadUrl: savedLock.downloadUrl
    };
  }

  try {
    const response = await fetch(VERSION_URL, { cache: 'no-store' });
    if (!response.ok) return { status: 'offline' };
    const remote = await response.json();
    if (compareVersions(remote.version, localVersion) > 0) {
      const lock = {
        blockedVersion: remote.version,
        message: remote.message,
        downloadUrl: remote.downloadUrl,
        detectedAt: new Date().toISOString()
      };
      await window.whales?.setVersionLock?.(lock);
      return {
        status: 'blocked',
        message: remote.message,
        downloadUrl: remote.downloadUrl
      };
    }
    return { status: 'ok' };
  } catch {
    return { status: 'offline' };
  }
}
