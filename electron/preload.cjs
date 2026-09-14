const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('whales', {
  getVersion: () => ipcRenderer.invoke('app:version'),
  isLiveMode: () => ipcRenderer.invoke('app:is-live-mode'),
  getLiveNetworkStatus: () => ipcRenderer.invoke('live:network-status'),
  listWifiNetworks: () => ipcRenderer.invoke('live:wifi-list'),
  connectWifi: (payload) => ipcRenderer.invoke('live:wifi-connect', payload),
  disconnectWifi: () => ipcRenderer.invoke('live:wifi-disconnect'),
  getVersionLock: () => ipcRenderer.invoke('version-lock:get'),
  setVersionLock: (lock) => ipcRenderer.invoke('version-lock:set', lock),
  openExternal: (url) => ipcRenderer.invoke('external:open', url),
  copyText: (text) => ipcRenderer.invoke('clipboard:copy', text),
  copySecret: (text) => ipcRenderer.invoke('clipboard:copy-secret', text),
  readText: () => ipcRenderer.invoke('clipboard:read')
});
