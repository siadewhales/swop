import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Check, ChevronDown, CircleHelp, ClipboardPaste, Copy, Download, Eye, EyeOff, FileSignature, FolderOpen, Globe2, KeyRound, Languages, LockKeyhole, Plus, QrCode, RadioTower, RefreshCw, Send, ShieldAlert, ShieldCheck, Trash2, Wallet, Wifi, WifiOff } from 'lucide-react';
import QRCode from 'qrcode';
import { ethers } from 'ethers';
import './styles.css';
import { changeAppLanguage } from './i18n';
import { useTranslation } from 'react-i18next';
import logoWhale from './assets/logo-whale.png';
import { checkVersionGate } from './services/versionGuard';
import { analyzeTokenRisk } from './services/security';
import { DEFAULT_NETWORK_ID, NATIVE_ASSET_ID, getChainById, getExplorerTxUrl, getNetworkById, getNetworksByMode, isEvmNetwork } from './services/chains';
import { detectWalletTokens, estimateDefaultGasCost, estimateTransferGas, getGasQuote, getProvider, loadTokenByAddress, normalizePrivateKey, sendEth, sendToken } from './services/ethereum';
import { createNetworkWallet, createNetworkWalletBatch, createNetworkWalletFromPhrase } from './services/paperWallets';
import { createSolanaWallet, estimateSolanaTransferFee, formatSolana, getSolanaBalance, normalizeSolanaPrivateKey, parseSolana, parseSolanaAddress, sendSolanaTransfer } from './services/solana';
import { createBitcoinWallet, estimateBitcoinTransferFee, formatBitcoin, getBitcoinBalance, normalizeBitcoinPrivateKey, parseBitcoin, sendBitcoinTransfer } from './services/bitcoin';
import { phoneScan } from './services/phoneScan';
import { UNLIMITED, describeEvmTransaction, describeTypedData } from './services/txInsight';
import { MIN_PASSWORD_LENGTH, decryptVault, encryptVault } from './services/vaultFile';

function isWalletConnectUri(value) {
  return /^wc:[^@]+@2\?/i.test(String(value || '').trim());
}

const languages = [
  ['es', 'Español'], ['en', 'English'], ['fr', 'Français'], ['de', 'Deutsch'], ['nl', 'Nederlands'],
  ['zh', '简体中文'], ['zh-TW', '繁體中文'], ['ja', '日本語'], ['hi', 'हिन्दी'], ['ur', 'اردو'],
  ['ar', 'العربية'], ['pt', 'Português'], ['ru', 'Русский'], ['ko', '한국어'], ['th', 'ไทย'],
  ['vi', 'Tiếng Việt'], ['tr', 'Türkçe'], ['it', 'Italiano'], ['el', 'Ελληνικά'], ['sv', 'Svenska'],
  ['no', 'Norsk'], ['da', 'Dansk'], ['fi', 'Suomi'], ['pl', 'Polski'], ['cs', 'Čeština'],
  ['hu', 'Magyar'], ['ro', 'Română'], ['bg', 'Български'], ['hr', 'Hrvatski'], ['sr', 'Српски'],
  ['sl', 'Slovenščina'], ['sk', 'Slovenčina'], ['lt', 'Lietuvių'], ['lv', 'Latviešu'], ['et', 'Eesti'],
  ['uk', 'Українська'], ['he', 'עברית'], ['id', 'Indonesia'], ['ms', 'Melayu'],
  ['fa', 'فارسی'], ['bn', 'বাংলা'], ['fil', 'Filipino'], ['sw', 'Kiswahili']
];
async function copyText(text) {
  if (window.whales?.copyText) {
    await window.whales.copyText(text);
    return true;
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}

// Claves y frases: el proceso principal borra el portapapeles a los 30 s si sigue conteniendo lo copiado.
async function copySecret(text) {
  if (window.whales?.copySecret) {
    await window.whales.copySecret(text);
    return true;
  }
  return copyText(text);
}

async function readText() {
  if (window.whales?.readText) return window.whales.readText();
  if (navigator.clipboard?.readText) return navigator.clipboard.readText();
  return '';
}

async function clearRuntimeStorage() {
  localStorage.clear();
  sessionStorage.clear();
  if (typeof indexedDB === 'undefined' || !indexedDB.databases) return;
  try {
    const databases = await indexedDB.databases();
    await Promise.all(databases
      .filter((database) => database?.name)
      .map((database) => new Promise((resolve) => {
        const request = indexedDB.deleteDatabase(database.name);
        request.onsuccess = resolve;
        request.onerror = resolve;
        request.onblocked = resolve;
      })));
  } catch {
    // Some Chromium builds do not expose indexedDB.databases; local/session storage is still cleared.
  }
}

function App() {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState('vault');
  const [languageOpen, setLanguageOpen] = useState(true);
  const [copyMenu, setCopyMenu] = useState(null);
  const [gate, setGate] = useState({ status: 'checking' });
  const [splashVisible, setSplashVisible] = useState(true);
  const [connection, setConnection] = useState({ online: navigator.onLine, checked: false });
  const [liveMode, setLiveMode] = useState(false);
  const [liveNetwork, setLiveNetwork] = useState({ connected: navigator.onLine, checking: true });
  const [liveNetworkReady, setLiveNetworkReady] = useState(false);
  const [wifiOpen, setWifiOpen] = useState(false);
  const [scanSession, setScanSession] = useState(null);
  const [scanPairingOpen, setScanPairingOpen] = useState(false);
  const [pendingScan, setPendingScan] = useState(null);
  const [scanNotice, setScanNotice] = useState('');
  const [networkMode, setNetworkMode] = useState('mainnet');
  const [activeNetworkId, setActiveNetworkId] = useState(DEFAULT_NETWORK_ID);
  const scanSessionRef = useRef(null);
  const pendingScanRef = useRef(null);
  const completeSplash = useCallback(() => setSplashVisible(false), []);
  const activeNetwork = useMemo(() => getNetworkById(activeNetworkId), [activeNetworkId]);
  const provider = useMemo(() => (isEvmNetwork(activeNetwork) ? getProvider(activeNetwork) : null), [activeNetwork]);

  useEffect(() => {
    const networks = getNetworksByMode(networkMode);
    if (!networks.some((network) => String(network.id) === String(activeNetworkId))) {
      setActiveNetworkId(networks[0]?.id || DEFAULT_NETWORK_ID);
    }
  }, [activeNetworkId, networkMode]);

  useEffect(() => {
    clearRuntimeStorage();
    checkVersionGate().then(setGate);
  }, []);

  useEffect(() => {
    const cleanupOnClose = () => {
      localStorage.clear();
      sessionStorage.clear();
    };
    window.addEventListener('beforeunload', cleanupOnClose);
    return () => window.removeEventListener('beforeunload', cleanupOnClose);
  }, []);

  const refreshLiveNetwork = useCallback(async () => {
    if (!window.whales?.getLiveNetworkStatus) return { connected: navigator.onLine };
    const status = await window.whales.getLiveNetworkStatus();
    setLiveNetwork({ ...status, checking: false });
    return status;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function detectLiveMode() {
      const enabled = Boolean(await window.whales?.isLiveMode?.());
      if (cancelled || !enabled) return;
      setLiveMode(true);
      setLanguageOpen(false);
      const status = await refreshLiveNetwork();
      if (cancelled) return;
      if (status?.connected) {
        setLiveNetworkReady(true);
        setLanguageOpen(true);
        setWifiOpen(false);
      } else {
        setLiveNetworkReady(false);
        setWifiOpen(true);
      }
    }
    detectLiveMode();
    return () => {
      cancelled = true;
    };
  }, [refreshLiveNetwork]);

  useEffect(() => {
    let cancelled = false;
    async function checkConnection() {
      if (!navigator.onLine) {
        if (!cancelled) setConnection({ online: false, checked: true });
        return;
      }
      if (!isEvmNetwork(activeNetwork) || !provider) {
        if (!cancelled) setConnection({ online: true, checked: true });
        return;
      }
      try {
        await provider.getBlockNumber();
        if (!cancelled) setConnection({ online: true, checked: true });
      } catch {
        if (!cancelled) setConnection({ online: false, checked: true });
      }
    }
    checkConnection();
    const interval = window.setInterval(checkConnection, 15000);
    window.addEventListener('online', checkConnection);
    window.addEventListener('offline', checkConnection);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('online', checkConnection);
      window.removeEventListener('offline', checkConnection);
    };
  }, [activeNetwork, provider]);

  const updateScanSession = useCallback(async (session) => {
    if (!session?.ok || !session.url) return null;
    const previous = scanSessionRef.current;
    const qr = previous?.url === session.url && previous?.qr
      ? previous.qr
      : await QRCode.toDataURL(session.url, {
        width: 260,
        margin: 1,
        color: { dark: '#111820', light: '#f5f5dc' }
      });
    const nextSession = { ...session, qr };
    scanSessionRef.current = nextSession;
    setScanSession(nextSession);
    return nextSession;
  }, []);

  const refreshScanSession = useCallback(async () => {
    try {
      return await updateScanSession(await phoneScan.ensureSession());
    } catch {
      setScanNotice(t('scan.unavailable'));
      return null;
    }
  }, [t, updateScanSession]);

  const startScanRequest = useCallback(async ({ target, label }) => {
    try {
      const session = await phoneScan.request({ target, label });
      await updateScanSession(session);
      setScanNotice(t('scan.active', { field: label }));
      return true;
    } catch {
      setScanNotice(t('scan.unavailable'));
      return false;
    }
  }, [t, updateScanSession]);

  const requestScan = useCallback(async ({ target, label }) => {
    const request = { target, label };
    const current = scanSessionRef.current;
    if (current?.connected) return startScanRequest(request);

    pendingScanRef.current = request;
    setPendingScan(request);
    setScanPairingOpen(true);
    const session = await refreshScanSession();
    if (session?.connected) {
      pendingScanRef.current = null;
      setPendingScan(null);
      setScanPairingOpen(false);
      return startScanRequest(request);
    }
    setScanNotice(t('scan.waitingConnection'));
    return true;
  }, [refreshScanSession, startScanRequest, t]);

  useEffect(() => {
    if (!scanSession?.url) return undefined;
    let cancelled = false;
    const refresh = async () => {
      const nextSession = await refreshScanSession();
      if (cancelled || !nextSession?.connected || !pendingScanRef.current) return;
      const request = pendingScanRef.current;
      pendingScanRef.current = null;
      setPendingScan(null);
      setScanPairingOpen(false);
      await startScanRequest(request);
    };
    const interval = window.setInterval(refresh, 2200);
    refresh();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [refreshScanSession, scanSession?.url, startScanRequest]);

  useEffect(() => {
    return phoneScan.onResult(() => setScanNotice(''));
  }, []);

  useEffect(() => {
    const offCancel = phoneScan.onCancel(() => setScanNotice(t('scan.cancelled')));
    const closeOnExit = () => phoneScan.close();
    window.addEventListener('beforeunload', closeOnExit);
    return () => {
      offCancel();
      window.removeEventListener('beforeunload', closeOnExit);
    };
  }, [t]);

  const closeScanPairing = useCallback(() => {
    pendingScanRef.current = null;
    setPendingScan(null);
    setScanPairingOpen(false);
  }, []);

  const scanController = useMemo(() => ({
    connected: Boolean(scanSession?.connected),
    notice: scanNotice,
    request: requestScan
  }), [requestScan, scanNotice, scanSession?.connected]);

  const selectLanguage = async (code) => {
    await changeAppLanguage(code);
    setLanguageOpen(false);
  };

  useEffect(() => {
    const onContextMenu = (event) => {
      if (languageOpen) return;
      const selectedText = window.getSelection()?.toString()?.trim();
      if (!selectedText) {
        setCopyMenu(null);
        return;
      }
      event.preventDefault();
      setCopyMenu({ x: event.clientX, y: event.clientY, text: selectedText });
    };
    const close = () => setCopyMenu(null);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('click', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', close);
    };
  }, [languageOpen]);

  if (gate.status === 'blocked') return <UpdateGate gate={gate} t={t} />;

  return (
    <div className={`app-shell ${splashVisible ? 'splash-active' : ''} ${liveMode ? 'live-mode' : ''}`}>
      <AmbientFish />
      {liveMode && !splashVisible && (
        <LiveWifiButton
          connected={liveNetwork.connected}
          checking={liveNetwork.checking}
          onClick={() => setWifiOpen(true)}
        />
      )}
      <aside className="sidebar">
        <div className="brand-mark">
          <img src={logoWhale} alt="SWOP" />
          <div>
            <h1>SWOP</h1>
            <span>SIADE WHALES OPERATIONS PLATFORM</span>
          </div>
        </div>
        <nav>
          <NavButton active={view === 'vault'} icon={<KeyRound />} label={t('vault.nav')} onClick={() => setView('vault')} />
          <NavButton active={view === 'terminal'} icon={<Send />} label={t('terminal.nav')} onClick={() => setView('terminal')} />
          <NavButton active={view === 'contracts'} icon={<FileSignature />} label={t('contracts.nav')} onClick={() => setView('contracts')} />
          <NavButton active={view === 'help'} icon={<CircleHelp />} label={t('help.nav')} onClick={() => setView('help')} />
        </nav>
        <ChainSelector activeNetwork={activeNetwork} networkMode={networkMode} onModeChange={setNetworkMode} onChange={setActiveNetworkId} />
        <ConnectionBadge connection={connection} network={activeNetwork} />
        <ScanBadge connected={scanController.connected} />
        <SecurityLegend />
        <button className="language-pill" onClick={() => setLanguageOpen(true)}>
          <Languages size={16} />
          {languages.find(([code]) => code === i18n.language)?.[1] || 'Language'}
        </button>
      </aside>

      <main className="main-panel">
        <section className={view === 'vault' ? 'view-pane active' : 'view-pane'} aria-hidden={view !== 'vault'}>
          <Vault connection={connection} network={activeNetwork} />
        </section>
        <section className={view === 'terminal' ? 'view-pane active' : 'view-pane'} aria-hidden={view !== 'terminal'}>
          <Terminal connection={connection} provider={provider} chain={activeNetwork} scan={scanController} />
        </section>
        <section className={view === 'contracts' ? 'view-pane active' : 'view-pane'} aria-hidden={view !== 'contracts'}>
          <ContractsView connection={connection} provider={provider} chain={activeNetwork} scan={scanController} />
        </section>
        <section className={view === 'help' ? 'view-pane active' : 'view-pane'} aria-hidden={view !== 'help'}>
          <HelpView />
        </section>
      </main>

      {wifiOpen && liveMode && !splashVisible && (
        <LiveWifiModal
          connected={liveNetwork.connected}
          refreshStatus={refreshLiveNetwork}
          onConnected={() => {
            setLiveNetworkReady(true);
            setWifiOpen(false);
            setLanguageOpen(true);
          }}
          onOffline={() => {
            setLiveNetworkReady(true);
            setWifiOpen(false);
            setLanguageOpen(true);
          }}
          onClose={() => setWifiOpen(false)}
        />
      )}
      {languageOpen && !splashVisible && (!liveMode || liveNetworkReady) && <LanguageModal onSelect={selectLanguage} current={i18n.language} />}
      <ScanPairingModal open={scanPairingOpen} session={scanSession} pending={pendingScan} onClose={closeScanPairing} />
      {copyMenu && <CopyContextMenu menu={copyMenu} onCopy={async () => { await copyText(copyMenu.text); setCopyMenu(null); }} />}
      {splashVisible && <SplashIntro onComplete={completeSplash} liveMode={liveMode} />}
    </div>
  );
}

function ChainSelector({ activeNetwork, networkMode, onModeChange, onChange }) {
  const { t } = useTranslation();
  const networks = getNetworksByMode(networkMode);
  return (
    <label className="chain-selector">
      <span><Globe2 size={15} />{t('terminal.network')}</span>
      <div className="network-mode-toggle">
        <button type="button" className={networkMode === 'mainnet' ? 'selected' : ''} onClick={() => onModeChange('mainnet')}>{t('networkMode.mainnet')}</button>
        <button type="button" className={networkMode === 'testnet' ? 'selected' : ''} onClick={() => onModeChange('testnet')}>{t('networkMode.testnet')}</button>
      </div>
      <select value={String(activeNetwork.id)} onChange={(event) => onChange(event.target.value)}>
        {networks.map((network) => (
          <option key={network.id} value={String(network.id)}>{network.shortName}</option>
        ))}
      </select>
    </label>
  );
}

function ConnectionBadge({ connection, network }) {
  const { t } = useTranslation();
  const online = connection.online;
  return (
    <div className={`connection-badge ${online ? 'online' : 'offline'}`}>
      {online ? <Wifi /> : <WifiOff />}
      <div>
        <strong>{online ? t('connection.online') : t('connection.offline')}</strong>
        <span>{online ? network.name : t('connection.offlineHint')}</span>
      </div>
    </div>
  );
}

function ScanBadge({ connected }) {
  const { t } = useTranslation();
  return (
    <div className={`scan-badge ${connected ? 'connected' : 'disconnected'}`}>
      <QrCode />
      <div>
        <strong>{connected ? t('scan.connected') : t('scan.disconnected')}</strong>
        <span>{connected ? t('scan.connectedHint') : t('scan.disconnectedHint')}</span>
      </div>
    </div>
  );
}

function ScanPairingModal({ open, session, pending, onClose }) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <div className="modal-backdrop scan-pairing-backdrop">
      <section className="scan-pairing-modal">
        <img src={logoWhale} alt="" />
        <h2>{t('scan.pairingTitle')}</h2>
        <p>{t('scan.pairingText', { field: pending?.label || t('scan.title') })}</p>
        {session?.qr ? (
          <>
            <img className="scan-pairing-qr" src={session.qr} alt={t('scan.title')} />
            <small className="scan-pairing-note"><LockKeyhole size={14} />{t('scan.e2eNote')}</small>
          </>
        ) : (
          <div className="scan-pairing-loading"><RefreshCw className="spin" />{t('scan.starting')}</div>
        )}
        <div className="scan-pairing-footer">
          <span>{t('scan.pairingWaiting')}</span>
          <button type="button" className="secondary-action" onClick={onClose}>{t('scan.close')}</button>
        </div>
      </section>
    </div>
  );
}

function SplashIntro({ onComplete, liveMode = false }) {
  const companyName = 'SIADE WHALES.';
  const appName = 'SWOP';
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState('typing');

  useEffect(() => {
    const timers = [];
    const schedule = (callback, delay) => {
      const timer = window.setTimeout(callback, delay);
      timers.push(timer);
    };

    const typeCompanyAt = (index) => {
      if (index < companyName.length) {
        schedule(() => {
          setTyped(companyName.slice(0, index + 1));
          typeCompanyAt(index + 1);
        }, index === 0 ? 320 : companyName[index - 1] === '.' ? 300 : 92);
        return;
      }
      schedule(() => {
        setPhase('hold');
        schedule(() => eraseCompanyAt(companyName.length), 760);
      }, 420);
    };

    const eraseCompanyAt = (index) => {
      setPhase('deleting');
      if (index > 0) {
        schedule(() => {
          setTyped(companyName.slice(0, index - 1));
          eraseCompanyAt(index - 1);
        }, 82);
        return;
      }
      schedule(() => {
        setPhase('typing app-name');
        typeAppAt(0);
      }, 280);
    };

    const typeAppAt = (index) => {
      if (index < appName.length) {
        schedule(() => {
          setTyped(appName.slice(0, index + 1));
          typeAppAt(index + 1);
        }, index === 0 ? 260 : 120);
        return;
      }
      schedule(() => {
        setPhase('leaving app-name');
        schedule(onComplete, 680);
      }, 780);
    };

    typeCompanyAt(0);
    return () => timers.forEach(window.clearTimeout);
  }, [liveMode, onComplete]);

  return (
    <div className={`splash-intro ${phase}`} aria-hidden="true">
      <div className="splash-inner">
        {liveMode && <img className="splash-logo" src={logoWhale} alt="" />}
        <h1><span>{typed}</span><i /></h1>
      </div>
    </div>
  );
}

function AmbientFish() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const ctx = canvas.getContext('2d');
    const cream = '#F2EAD5';
    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let last = performance.now();
    const rand = (min, max) => min + Math.random() * (max - min);
    let fish = [];

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = width < 768 ? 18 : 34;
      fish = Array.from({ length: count }, () => ({
        x: rand(0, width),
        y: rand(0, height),
        theta: rand(0, Math.PI * 2),
        speed: rand(0.16, 0.48),
        turn: rand(-0.01, 0.01),
        wobble: rand(0, Math.PI * 2),
        wobbleSpeed: rand(0.008, 0.024),
        size: rand(3, 6.5),
        alpha: rand(0.08, 0.18)
      }));
    };

    const drawFish = (item) => {
      const size = item.size;
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate(item.theta);
      ctx.globalAlpha = item.alpha;
      ctx.fillStyle = cream;
      ctx.beginPath();
      ctx.ellipse(0, 0, size, size * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-size * 0.8, 0);
      ctx.lineTo(-size * 1.7, -size * 0.55);
      ctx.lineTo(-size * 1.7, size * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    const frame = (now) => {
      const delta = Math.min((now - last) / 16.67, 3);
      last = now;
      ctx.clearRect(0, 0, width, height);
      const margin = 36;
      fish.forEach((item) => {
        item.wobble += item.wobbleSpeed * delta;
        item.theta += (item.turn + Math.sin(item.wobble) * 0.006) * delta;
        item.x += Math.cos(item.theta) * item.speed * delta;
        item.y += Math.sin(item.theta) * item.speed * delta;
        if (item.x < -margin) item.x = width + margin;
        else if (item.x > width + margin) item.x = -margin;
        if (item.y < -margin) item.y = height + margin;
        else if (item.y > height + margin) item.y = -margin;
        drawFish(item);
      });
      raf = window.requestAnimationFrame(frame);
    };

    resize();
    raf = window.requestAnimationFrame(frame);
    window.addEventListener('resize', resize);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas className="ambient-fish" ref={canvasRef} aria-hidden="true" />;
}

function NavButton({ active, icon, label, onClick }) {
  return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span></button>;
}

function CopyContextMenu({ menu, onCopy }) {
  const { t } = useTranslation();
  return (
    <button className="copy-context-menu" style={{ left: menu.x, top: menu.y }} onClick={onCopy}>
      <Copy size={14} />
      {t('common.copy')}
    </button>
  );
}

function LiveWifiButton({ connected, checking, onClick }) {
  const { t } = useTranslation();
  return (
    <button className={`live-wifi-button ${connected ? 'connected' : 'disconnected'}`} onClick={onClick}>
      {connected ? <Wifi /> : <WifiOff />}
      <span>{checking ? t('liveWifi.checking') : connected ? t('liveWifi.connected') : t('liveWifi.disconnected')}</span>
    </button>
  );
}

function LiveWifiModal({ connected, refreshStatus, onConnected, onOffline, onClose }) {
  const { t } = useTranslation();
  const [networks, setNetworks] = useState([]);
  const [selected, setSelected] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const loadNetworks = useCallback(async () => {
    setLoading(true);
    setStatus(t('liveWifi.scanning'));
    const result = await window.whales?.listWifiNetworks?.();
    const nextNetworks = result?.networks || [];
    setNetworks(nextNetworks);
    setSelected((current) => current || nextNetworks[0]?.ssid || '');
    setStatus(nextNetworks.length ? t('liveWifi.selectNetwork') : t('liveWifi.noNetworks'));
    await refreshStatus();
    setLoading(false);
  }, [refreshStatus, t]);

  useEffect(() => {
    loadNetworks();
  }, [loadNetworks]);

  const connect = async () => {
    if (!selected) return;
    setLoading(true);
    setStatus(t('liveWifi.connecting'));
    const result = await window.whales?.connectWifi?.({ ssid: selected, password });
    const networkStatus = await refreshStatus();
    setLoading(false);
    if (result?.ok || networkStatus?.connected) {
      setStatus(t('liveWifi.connectedHint'));
      onConnected();
      return;
    }
    setStatus(t('liveWifi.failed'));
  };

  const disconnect = async () => {
    setLoading(true);
    setStatus(t('liveWifi.disconnecting'));
    await window.whales?.disconnectWifi?.();
    await refreshStatus();
    setLoading(false);
    setPassword('');
    setStatus(t('liveWifi.disconnectedHint'));
    loadNetworks();
  };

  return (
    <div className="modal-backdrop live-wifi-backdrop">
      <section className="live-wifi-modal">
        <img src={logoWhale} alt="" />
        <h2>{t('liveWifi.title')}</h2>
        <p>{connected ? t('liveWifi.readyText') : t('liveWifi.text')}</p>

        <div className="live-wifi-actions">
          <button className="secondary-action" onClick={loadNetworks} disabled={loading}>
            <RefreshCw className={loading ? 'spin' : ''} />
            {t('liveWifi.refresh')}
          </button>
          {connected && (
            <button className="secondary-action" onClick={disconnect} disabled={loading}>
              <WifiOff />
              {t('liveWifi.disconnect')}
            </button>
          )}
        </div>

        <div className="live-network-list">
          {networks.map((network) => (
            <button key={network.ssid} className={selected === network.ssid ? 'selected' : ''} onClick={() => setSelected(network.ssid)}>
              <Wifi />
              <strong>{network.ssid}</strong>
              <span>{network.signal}% {network.security ? `- ${network.security}` : ''}</span>
            </button>
          ))}
        </div>

        <label className="live-wifi-password">
          <span>{t('liveWifi.password')}</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t('liveWifi.passwordPlaceholder')} disabled={loading || !selected} />
        </label>

        {status && <p className="live-wifi-status">{status}</p>}

        <div className="live-wifi-footer">
          <button className="primary-action" onClick={connect} disabled={loading || !selected}>
            <Wifi />
            {t('liveWifi.connect')}
          </button>
          <button className="secondary-action" onClick={onOffline} disabled={loading}>
            <WifiOff />
            {t('liveWifi.workOffline')}
          </button>
          {connected && <button className="secondary-action" onClick={onClose}>{t('common.continue')}</button>}
        </div>
      </section>
    </div>
  );
}

function SecurityLegend() {
  const { t } = useTranslation();
  return (
    <div className="security-legend">
      <span>{t('security.legend')}</span>
      <div><i className="dot safe-dot" />{t('security.safe')}</div>
      <div><i className="dot verify-dot" />{t('security.verify')}</div>
      <div><i className="dot malware-dot" />{t('security.malware')}</div>
    </div>
  );
}

function LanguageModal({ onSelect, current }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(current || 'es');
  return (
    <div className="modal-backdrop">
      <section className="language-modal">
        <img src={logoWhale} alt="" />
        <h2>{t('common.selectLanguage')}</h2>
        <div className="language-grid">
          {languages.map(([code, name]) => (
            <button key={code} className={selected === code ? 'selected' : ''} onClick={() => setSelected(code)}>
              <Globe2 size={15} />
              <span>{name}</span>
            </button>
          ))}
        </div>
        <button className="primary-action" onClick={() => onSelect(selected)}>{t('common.continue')}</button>
      </section>
    </div>
  );
}

function Vault({ connection, network }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState('single');
  const [wallet, setWallet] = useState(null);
  const [walletLabel, setWalletLabel] = useState('');
  const [batchCount, setBatchCount] = useState(5);
  const [batchStatus, setBatchStatus] = useState('');
  const [showPrivate, setShowPrivate] = useState(false);
  const [showSeed, setShowSeed] = useState(false);
  const [batchPlain, setBatchPlain] = useState(false);
  const [batchPasswordOpen, setBatchPasswordOpen] = useState(false);
  const [vaultFileOpen, setVaultFileOpen] = useState(false);

  const createWallet = () => {
    const nextWallet = createNetworkWallet(network);
    setWallet(nextWallet);
    setShowPrivate(false);
    setShowSeed(false);
  };

  const clearWallet = () => {
    setWallet(null);
    setWalletLabel('');
  };

  // Por defecto el lote sale cifrado: la contraseña se pide en una ventana. El TXT en claro solo si se marca.
  const generateBatch = () => {
    if (!batchPlain) return setBatchPasswordOpen(true);
    const count = Math.min(100, Math.max(1, Number(batchCount) || 1));
    downloadBatchWallets(createNetworkWalletBatch(count, network), t);
    setBatchStatus(t('vault.batchDownloaded'));
    window.setTimeout(() => setBatchStatus(''), 1800);
  };

  const generateEncryptedBatch = async (password) => {
    const count = Math.min(100, Math.max(1, Number(batchCount) || 1));
    await downloadEncryptedBatch(createNetworkWalletBatch(count, network), password, network);
    setBatchPasswordOpen(false);
    setBatchStatus(t('vault.batchEncryptedDownloaded'));
    window.setTimeout(() => setBatchStatus(''), 4000);
  };

  useEffect(() => clearWallet, []);

  useEffect(() => {
    clearWallet();
  }, [network.id]);

  return (
    <section className="screen">
      <Header kicker={`${t('vault.title')} · ${network.shortName}`} title={t('vault.description', { network: network.name })} subtitle={t('vault.subtitle')} />
      {!wallet ? (
        <div className={mode === 'batch' ? 'center-stage batch-mode' : 'center-stage'}>
          <img src={logoWhale} alt="" />
          <div className={`offline-advice ${connection.online ? 'online' : 'offline'}`}>
            {connection.online ? <Wifi /> : <WifiOff />}
            <div>
              <strong>{connection.online ? t('vault.onlineAdviceTitle') : t('vault.offlineAdviceTitle')}</strong>
              <span>{connection.online ? t('vault.onlineAdviceText') : t('vault.offlineAdviceText')}</span>
            </div>
          </div>
          <div className="vault-mode">
            <button type="button" className={mode === 'single' ? 'selected' : ''} onClick={() => setMode('single')}>{t('vault.singleWallet')}</button>
            <button type="button" className={mode === 'batch' ? 'selected' : ''} onClick={() => setMode('batch')}>{t('vault.batchWallets')}</button>
          </div>
          {mode === 'single' ? (
            <button className="primary-action large" onClick={createWallet}><Wallet />{t('vault.generateButton')}</button>
          ) : (
            <div className="batch-panel">
              <label className="form-field">
                <span>{t('vault.batchCount')}</span>
                <input type="number" min="1" max="100" value={batchCount} onChange={(event) => setBatchCount(event.target.value)} />
              </label>
              {batchPlain ? <p className="batch-plain-warning">{t('vault.batchPlainWarning')}</p> : <p>{t('vault.batchLimit')}</p>}
              <label className="check-field">
                <input type="checkbox" checked={batchPlain} onChange={(event) => setBatchPlain(event.target.checked)} />
                <span>{t('vault.batchPlainToggle')}</span>
              </label>
              <div className="batch-actions">
                <button className="primary-action" onClick={generateBatch}>{batchPlain ? <Download /> : <LockKeyhole />}{batchPlain ? t('vault.generateBatch') : t('vault.batchEncryptedButton')}</button>
                <button type="button" className="secondary-action" onClick={() => setVaultFileOpen(true)}><FolderOpen />{t('vault.openVaultButton')}</button>
              </div>
              {batchStatus && <p className="status-line">{batchStatus}</p>}
            </div>
          )}
        </div>
      ) : (
        <div className="vault-grid">
          <div className="secret-stack">
            <div className="wallet-network-list">
              {wallet.accounts.map((account) => (
                <article className="wallet-network-card" key={account.id}>
                  <div>
                    <strong>{account.title}</strong>
                    <span>{account.symbols}</span>
                  </div>
                  <SecretField label={t('vault.publicAddress')} value={account.address} revealed />
                  <SecretField label={formatPrivateKeyLabel(account, t)} warning={t('vault.warning')} value={account.privateKey} revealed={showPrivate} onToggle={() => setShowPrivate((value) => !value)} />
                  <small>{account.path}</small>
                </article>
              ))}
            </div>
            <SecretField label={t('vault.seedPhrase')} warning={t('vault.warning')} value={wallet.seedPhrase || wallet.mnemonic?.phrase || ''} revealed={showSeed} onToggle={() => setShowSeed((value) => !value)} multiline />
            <label className="form-field">
              <span>{t('vault.walletName')}</span>
              <input value={walletLabel} onChange={(event) => setWalletLabel(event.target.value)} placeholder={t('vault.walletNamePlaceholder')} maxLength="48" />
            </label>
            <p className="warning-note">{t('vault.saveNote')}</p>
            <div className="paper-export-actions">
              <button className="secondary-action" onClick={() => downloadPaperWallet(wallet, t, walletLabel, 'public')}><Download />{t('vault.downloadPublicWallet')}</button>
              <button className="secondary-action danger-outline" onClick={() => downloadPaperWallet(wallet, t, walletLabel, 'private')}><Download />{t('vault.downloadPrivateWallet')}</button>
              <button className="secondary-action" onClick={() => downloadPaperWallet(wallet, t, walletLabel, 'full')}><Download />{t('vault.downloadFullWallet')}</button>
            </div>
            <button className="danger-action" onClick={clearWallet}><Trash2 />{t('vault.finishButton')}</button>
          </div>
        </div>
      )}
      {batchPasswordOpen && <BatchPasswordModal onConfirm={generateEncryptedBatch} onClose={() => setBatchPasswordOpen(false)} />}
      {vaultFileOpen && <VaultFileModal onClose={() => setVaultFileOpen(false)} />}
    </section>
  );
}

// Contraseña del lote cifrado: se comprueba aquí y no se guarda en ningún sitio.
function BatchPasswordModal({ onConfirm, onClose }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (password.length < MIN_PASSWORD_LENGTH) return setStatus(t('vault.batchPasswordShort', { count: MIN_PASSWORD_LENGTH }));
    if (password !== confirm) return setStatus(t('vault.batchPasswordMismatch'));
    setBusy(true);
    setStatus(t('vault.batchEncrypting'));
    try {
      await onConfirm(password);
    } catch {
      setStatus(t('vault.batchEncryptFailed'));
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <section className="vault-file-modal batch-password-modal">
        <h2>{t('vault.batchPasswordTitle')}</h2>
        <p>{t('vault.batchPasswordHint', { count: MIN_PASSWORD_LENGTH })}</p>
        <label className="form-field">
          <span>{t('vault.batchPassword')}</span>
          <input type="password" autoComplete="new-password" autoFocus value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <label className="form-field">
          <span>{t('vault.batchPasswordConfirm')}</span>
          <input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit(); }} />
        </label>
        {status && <p className="status-line">{status}</p>}
        <div className="batch-actions">
          <button type="button" className="secondary-action" onClick={onClose} disabled={busy}>{t('vault.batchCancel')}</button>
          <button type="button" className="primary-action" onClick={submit} disabled={busy}><LockKeyhole />{busy ? t('terminal.processing') : t('vault.batchEncryptConfirm')}</button>
        </div>
      </section>
    </div>
  );
}

// Abre un lote .swopvault: pide la contraseña, lo descifra en memoria y lo enseña. Al cerrar no queda nada.
function VaultFileModal({ onClose }) {
  const { t } = useTranslation();
  const [fileText, setFileText] = useState('');
  const [fileName, setFileName] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [content, setContent] = useState(null);
  const [revealed, setRevealed] = useState(false);

  const close = () => {
    setContent(null);
    setPassword('');
    setFileText('');
    onClose();
  };

  const chooseFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setStatus(t('vault.openVaultInvalid'));
    setFileText(await file.text());
    setFileName(file.name);
    setStatus('');
  };

  const openFile = async () => {
    if (!fileText || !password || busy) return;
    setBusy(true);
    setStatus('');
    try {
      setContent(await decryptVault(fileText, password));
      setPassword('');
    } catch (error) {
      setStatus(error.message === 'invalid_file' ? t('vault.openVaultInvalid') : t('vault.openVaultWrong'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <section className="vault-file-modal">
        <h2>{t('vault.openVaultTitle')}</h2>
        {!content ? (
          <div className="vault-file-form">
            <label className="secondary-action file-pick">
              <FolderOpen />{fileName || t('vault.openVaultChoose')}
              <input type="file" accept=".swopvault,application/json" onChange={chooseFile} hidden />
            </label>
            <label className="form-field">
              <span>{t('vault.batchPassword')}</span>
              <input type="password" autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') openFile(); }} />
            </label>
            <button className="primary-action" type="button" onClick={openFile} disabled={busy || !fileText || !password}><LockKeyhole />{busy ? t('terminal.processing') : t('vault.openVaultOpen')}</button>
          </div>
        ) : (
          <div className="vault-file-list">
            <button type="button" className="secondary-action" onClick={() => setRevealed((value) => !value)}>{revealed ? <EyeOff /> : <Eye />}{revealed ? t('common.hide') : t('common.show')}</button>
            {(content.wallets || []).map((wallet) => (
              <article className="wallet-network-card" key={wallet.index}>
                <strong>#{wallet.index}</strong>
                <SecretField label={t('vault.seedPhrase')} warning={t('vault.warning')} value={wallet.seedPhrase || ''} revealed={revealed} multiline />
                {(wallet.accounts || []).map((account) => (
                  <div className="vault-file-account" key={`${wallet.index}-${account.address}`}>
                    <small>{account.title} · {account.symbols}</small>
                    <SecretField label={t('vault.publicAddress')} value={account.address} revealed />
                    <SecretField label={formatPrivateKeyLabel(account, t)} warning={t('vault.warning')} value={account.privateKey} revealed={revealed} />
                  </div>
                ))}
              </article>
            ))}
          </div>
        )}
        {status && <p className="status-line">{status}</p>}
        <div className="scan-pairing-footer">
          <span>{t('vault.openVaultNote')}</span>
          <button type="button" className="secondary-action" onClick={close}>{t('scan.close')}</button>
        </div>
      </section>
    </div>
  );
}

function SecretField({ label, warning, value, revealed, onToggle, multiline }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const display = revealed ? value : '*'.repeat(multiline ? 96 : 54);
  const secret = Boolean(warning);

  const handleCopy = async () => {
    const ok = secret ? await copySecret(value) : await copyText(value);
    setCopied(ok);
    window.setTimeout(() => setCopied(false), secret ? 2600 : 1200);
  };

  return (
    <div className="secret-field">
      <span>{label}{warning && <b>{warning}</b>}</span>
      <div className={multiline ? 'secret-box multiline' : 'secret-box'}>
        <code>{display}</code>
        {onToggle && <button title={revealed ? t('common.hide') : t('common.show')} onClick={onToggle} type="button">{revealed ? <EyeOff /> : <Eye />}</button>}
        <button className={copied ? 'copy-button copied' : 'copy-button'} title={t('common.copy')} onClick={handleCopy} type="button">{copied ? <><Check /><span>{secret ? t('common.copiedSecret') : t('common.copied')}</span></> :<><Copy /><span>{t('common.copy')}</span></>}</button>
      </div>
    </div>
  );
}

function Terminal(props) {
  if (props.chain.type === 'solana') {
    return <SolanaTerminal {...props} />;
  }
  if (props.chain.type === 'bitcoin') {
    return <BitcoinTerminal {...props} />;
  }
  if (!isEvmNetwork(props.chain)) {
    return <NetworkModeNotice section="terminal" network={props.chain} />;
  }
  return <EvmTerminal {...props} />;
}

function openNetworkWalletFromCredential({ credential, mode, chain, provider }) {
  if (mode === 'phrase') {
    const wallet = createNetworkWalletFromPhrase(credential, chain);
    const account = wallet.accounts[0];
    if (chain.type === 'solana') return createSolanaWallet(account.privateKey, chain);
    if (chain.type === 'bitcoin') return createBitcoinWallet(account.privateKey, chain);
    return new ethers.Wallet(account.privateKey, provider);
  }
  if (chain.type === 'solana') return createSolanaWallet(credential, chain);
  if (chain.type === 'bitcoin') return createBitcoinWallet(credential, chain);
  return new ethers.Wallet(normalizePrivateKey(credential), provider);
}

function CredentialModeToggle({ mode, onChange, t }) {
  return (
    <div className="credential-mode">
      <button type="button" className={mode === 'privateKey' ? 'selected' : ''} onClick={() => onChange('privateKey')}>{t('vault.privateKey')}</button>
      <button type="button" className={mode === 'phrase' ? 'selected' : ''} onClick={() => onChange('phrase')}>{t('vault.seedPhrase')}</button>
    </div>
  );
}

function SolanaTerminal({ connection, chain, scan }) {
  const { t } = useTranslation();
  const [credentialMode, setCredentialMode] = useState('privateKey');
  const [privateKey, setPrivateKey] = useState('');
  const [showPrivateKeyInput, setShowPrivateKeyInput] = useState(false);
  const [pasted, setPasted] = useState(false);
  const [wallet, setWallet] = useState(null);
  const [balanceLamports, setBalanceLamports] = useState(0n);
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [estimate, setEstimate] = useState('');
  const [status, setStatus] = useState('');
  const [txHash, setTxHash] = useState('');
  const [txStage, setTxStage] = useState('idle');
  const isOffline = !connection.online;

  useEffect(() => {
    setWallet(null);
    setBalanceLamports(0n);
    setTo('');
    setAmount('');
    setEstimate('');
    setStatus('');
    setTxHash('');
    setTxStage('idle');
  }, [chain.id]);

  useEffect(() => {
    let cancelled = false;
    async function updateEstimate() {
      if (!wallet || !to || !amount) {
        setEstimate('');
        return;
      }
      try {
        const lamports = parseSolana(amount);
        const fee = await estimateSolanaTransferFee(wallet, to, lamports, chain);
        if (!cancelled) setEstimate(`${formatSolana(fee)} SOL`);
      } catch {
        if (!cancelled) setEstimate('');
      }
    }
    updateEstimate();
    return () => { cancelled = true; };
  }, [amount, chain, to, wallet]);

  const accessWallet = async () => {
    if (isOffline) return setStatus(t('terminal.offlineBlocked'));
    try {
      const nextWallet = openNetworkWalletFromCredential({ credential: privateKey, mode: credentialMode, chain });
      const balance = await getSolanaBalance(nextWallet.address, chain);
      setWallet(nextWallet);
      setBalanceLamports(balance);
      setStatus(t('terminal.walletNetworkReady', { network: chain.name }));
    } catch {
      setWallet(null);
      setStatus(t('errors.invalidPrivateKey'));
    }
  };

  const pastePrivateKey = async () => {
    const text = await readText();
    if (text) {
      setPrivateKey(text.trim());
      setPasted(true);
      window.setTimeout(() => setPasted(false), 1200);
    }
  };

  const requestDesktopScan = async (target) => {
    const label = target === 'privateKey'
      ? (credentialMode === 'phrase' ? t('vault.seedPhrase') : t('scan.privateKeyLabel'))
      : t('scan.addressLabel');
    if (!scan?.request) return setStatus(t('scan.unavailable'));
    const ok = await scan.request({ target, label });
    if (!ok) setStatus(t('scan.unavailable'));
  };

  useEffect(() => {
    return phoneScan.onResult((result) => {
      const value = String(result?.value || '').trim();
      if (!value) return;
      if (result?.target === 'privateKey') {
        const key = credentialMode === 'phrase' ? value : extractPrivateKeyFromScan(value, chain);
        if (!key) return setStatus(t('scan.invalidPrivateKey'));
        setPrivateKey(key);
        setStatus(t('scan.privateKeyReceived'));
      }
      if (result?.target === 'address') {
        try {
          parseSolanaAddress(value);
          setTo(value);
          setStatus(t('scan.addressReceived'));
        } catch {
          setStatus(t('scan.invalidAddress'));
        }
      }
    });
  }, [chain, credentialMode, t]);

  const useMaxAmount = async () => {
    if (!wallet) return;
    try {
      const fee = await estimateSolanaTransferFee(wallet, to || wallet.address, 1n, chain);
      const spendable = balanceLamports > fee ? balanceLamports - fee : 0n;
      setAmount(formatSolana(spendable));
      setStatus('');
    } catch {
      setStatus(t('terminal.maxUnavailable'));
    }
  };

  const submit = async () => {
    if (isOffline) return setStatus(t('terminal.offlineBlocked'));
    if (!wallet) return setStatus(t('contracts.accessFirst'));
    try {
      parseSolanaAddress(to);
      const lamports = parseSolana(amount);
      if (lamports <= 0n) throw new Error('invalid-amount');
      setTxStage('sending');
      setStatus(t('terminal.sending'));
      const tx = await sendSolanaTransfer(wallet, to, lamports, chain);
      setTxHash(tx.hash);
      setTxStage('completed');
      setStatus(t('terminal.transactionCompleted'));
      setBalanceLamports(await getSolanaBalance(wallet.address, chain));
    } catch (error) {
      setTxStage('idle');
      setStatus(error?.message || t('errors.transactionFailed'));
    }
  };

  return (
    <section className="screen">
      <Header kicker={`${t('terminal.title')} · ${chain.shortName}`} title={`SOL · ${chain.shortName}`} subtitle={t('terminal.subtitle')} />
      {isOffline && (
        <div className="offline-lock">
          <WifiOff />
          <div>
            <strong>{t('terminal.offlineTitle')}</strong>
            <span>{t('terminal.offlineText')}</span>
          </div>
        </div>
      )}
      <div className="terminal-layout">
        <div className={isOffline ? 'operation-panel disabled-panel' : 'operation-panel'}>
          <label className="form-field">
            <span>{credentialMode === 'phrase' ? t('vault.seedPhrase') : t('vault.privateKey')}</span>
            <CredentialModeToggle mode={credentialMode} onChange={setCredentialMode} t={t} />
            <div className="input-action-field scan-key-field">
              <input type={showPrivateKeyInput ? 'text' : 'password'} value={privateKey} onChange={(event) => setPrivateKey(event.target.value)} placeholder={credentialMode === 'phrase' ? t('vault.seedPhrase') : t('terminal.privateKeyPlaceholder')} autoComplete="off" spellCheck="false" disabled={isOffline} />
              <button type="button" title={showPrivateKeyInput ? t('common.hide') : t('common.show')} onClick={() => setShowPrivateKeyInput((value) => !value)} disabled={isOffline}>{showPrivateKeyInput ? <EyeOff /> : <Eye />}</button>
              <button type="button" className={pasted ? 'paste-button pasted' : 'paste-button'} title={t('common.paste')} onClick={pastePrivateKey} disabled={isOffline}>{pasted ? <Check /> : <ClipboardPaste />}<span>{pasted ? t('common.pasted') : t('common.paste')}</span></button>
              <button type="button" className="scan-button" title={t('scan.privateKeyButton')} onClick={() => requestDesktopScan('privateKey')} disabled={isOffline}><QrCode /><span>{t('scan.button')}</span></button>
            </div>
          </label>
          <button className="primary-action" onClick={accessWallet} disabled={isOffline}><LockKeyhole />{t('terminal.accessButton')}</button>
          {wallet && (
            <div className="wallet-summary">
              <SecretField label={t('terminal.yourAddress')} value={wallet.address} revealed />
              <strong>SOL: {formatSolana(balanceLamports)} SOL</strong>
            </div>
          )}
          {scan?.notice && <p className="status-line scan-status">{scan.notice}</p>}
          {status && <p className="status-line">{status}</p>}
        </div>

        <div className={isOffline ? 'operation-panel disabled-panel' : 'operation-panel'}>
          <label className="form-field">
            <span>{t('terminal.destinationAddress')}</span>
            <div className="input-action-field compact scan-address-field">
              <input value={to} onChange={(event) => setTo(event.target.value)} placeholder={t('terminal.destinationAddress')} disabled={isOffline} />
              <button type="button" className="scan-button" title={t('scan.addressButton')} onClick={() => requestDesktopScan('address')} disabled={isOffline}><QrCode /><span>{t('scan.button')}</span></button>
            </div>
          </label>
          <label className="form-field">
            <span>{t('terminal.amount')}</span>
            <div className="input-action-field amount-field">
              <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.0" disabled={isOffline} />
              <button type="button" className="paste-button" title={t('terminal.maxAmount')} onClick={useMaxAmount} disabled={isOffline || !wallet}>{t('terminal.maxAmount')}</button>
            </div>
          </label>
          <p className="estimate">{t('terminal.estimatedGas')}: {estimate || '-'}</p>
          <button className="primary-action" onClick={submit} disabled={!wallet || isOffline || txStage === 'sending'}><RadioTower />{txStage === 'sending' ? t('terminal.processing') : t('terminal.signButton')}</button>
          {txStage !== 'idle' && <TransactionProgress stage={txStage} />}
          {txHash && <div className="tx-result"><SecretField label={t('terminal.txHash')} value={txHash} revealed /></div>}
        </div>
      </div>
    </section>
  );
}

function BitcoinTerminal({ connection, chain, scan }) {
  const { t } = useTranslation();
  const [credentialMode, setCredentialMode] = useState('privateKey');
  const [privateKey, setPrivateKey] = useState('');
  const [showPrivateKeyInput, setShowPrivateKeyInput] = useState(false);
  const [pasted, setPasted] = useState(false);
  const [wallet, setWallet] = useState(null);
  const [balanceSats, setBalanceSats] = useState(0n);
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [estimate, setEstimate] = useState('');
  const [status, setStatus] = useState('');
  const [txHash, setTxHash] = useState('');
  const [txStage, setTxStage] = useState('idle');
  const isOffline = !connection.online;

  useEffect(() => {
    setWallet(null);
    setBalanceSats(0n);
    setTo('');
    setAmount('');
    setEstimate('');
    setStatus('');
    setTxHash('');
    setTxStage('idle');
  }, [chain.id]);

  useEffect(() => {
    let cancelled = false;
    async function updateEstimate() {
      if (!wallet || !amount) {
        setEstimate('');
        return;
      }
      try {
        const sats = parseBitcoin(amount);
        const fee = await estimateBitcoinTransferFee(wallet, to || wallet.address, sats || 1n, chain);
        if (!cancelled) setEstimate(`${formatBitcoin(fee)} ${chain.nativeSymbol}`);
      } catch {
        if (!cancelled) setEstimate('');
      }
    }
    updateEstimate();
    return () => { cancelled = true; };
  }, [amount, chain, to, wallet]);

  const accessWallet = async () => {
    if (isOffline) return setStatus(t('terminal.offlineBlocked'));
    try {
      const nextWallet = openNetworkWalletFromCredential({ credential: privateKey, mode: credentialMode, chain });
      const balance = await getBitcoinBalance(nextWallet.address, chain);
      setWallet(nextWallet);
      setBalanceSats(balance);
      setStatus(t('terminal.walletNetworkReady', { network: chain.name }));
    } catch (error) {
      setWallet(null);
      setStatus(error?.message || t('errors.invalidPrivateKey'));
    }
  };

  const pastePrivateKey = async () => {
    const text = await readText();
    if (text) {
      setPrivateKey(text.trim());
      setPasted(true);
      window.setTimeout(() => setPasted(false), 1200);
    }
  };

  const requestDesktopScan = async (target) => {
    const label = target === 'privateKey'
      ? (credentialMode === 'phrase' ? t('vault.seedPhrase') : t('scan.privateKeyLabel'))
      : t('scan.addressLabel');
    if (!scan?.request) return setStatus(t('scan.unavailable'));
    const ok = await scan.request({ target, label });
    if (!ok) setStatus(t('scan.unavailable'));
  };

  useEffect(() => {
    return phoneScan.onResult((result) => {
      const value = String(result?.value || '').trim();
      if (!value) return;
      if (result?.target === 'privateKey') {
        const key = credentialMode === 'phrase' ? value : extractPrivateKeyFromScan(value, chain);
        if (!key) return setStatus(t('scan.invalidPrivateKey'));
        setPrivateKey(key);
        setStatus(t('scan.privateKeyReceived'));
      }
      if (result?.target === 'address') {
        setTo(value);
        setStatus(t('scan.addressReceived'));
      }
    });
  }, [chain, credentialMode, t]);

  const useMaxAmount = async () => {
    if (!wallet) return;
    try {
      const fee = await estimateBitcoinTransferFee(wallet, to || wallet.address, 1n, chain);
      const spendable = balanceSats > fee ? balanceSats - fee : 0n;
      setAmount(formatBitcoin(spendable));
      setStatus('');
    } catch {
      setStatus(t('terminal.maxUnavailable'));
    }
  };

  const submit = async () => {
    if (isOffline) return setStatus(t('terminal.offlineBlocked'));
    if (!wallet) return setStatus(t('contracts.accessFirst'));
    try {
      const sats = parseBitcoin(amount);
      if (sats <= 0n) throw new Error('invalid-amount');
      setTxStage('sending');
      setStatus(t('terminal.sending'));
      const tx = await sendBitcoinTransfer(wallet, to, sats, chain);
      setTxHash(tx.hash);
      setTxStage('completed');
      setStatus(t('terminal.transactionCompleted'));
      setBalanceSats(await getBitcoinBalance(wallet.address, chain));
    } catch (error) {
      setTxStage('idle');
      setStatus(error?.message || t('errors.transactionFailed'));
    }
  };

  return (
    <section className="screen">
      <Header kicker={`${t('terminal.title')} · ${chain.shortName}`} title={`${chain.nativeSymbol} · ${chain.shortName}`} subtitle={t('terminal.subtitle')} />
      {isOffline && (
        <div className="offline-lock">
          <WifiOff />
          <div>
            <strong>{t('terminal.offlineTitle')}</strong>
            <span>{t('terminal.offlineText')}</span>
          </div>
        </div>
      )}
      <div className="terminal-layout">
        <div className={isOffline ? 'operation-panel disabled-panel' : 'operation-panel'}>
          <label className="form-field">
            <span>{credentialMode === 'phrase' ? t('vault.seedPhrase') : t('vault.privateKey')}</span>
            <CredentialModeToggle mode={credentialMode} onChange={setCredentialMode} t={t} />
            <div className="input-action-field scan-key-field">
              <input type={showPrivateKeyInput ? 'text' : 'password'} value={privateKey} onChange={(event) => setPrivateKey(event.target.value)} placeholder={credentialMode === 'phrase' ? t('vault.seedPhrase') : t('terminal.privateKeyPlaceholder')} autoComplete="off" spellCheck="false" disabled={isOffline} />
              <button type="button" title={showPrivateKeyInput ? t('common.hide') : t('common.show')} onClick={() => setShowPrivateKeyInput((value) => !value)} disabled={isOffline}>{showPrivateKeyInput ? <EyeOff /> : <Eye />}</button>
              <button type="button" className={pasted ? 'paste-button pasted' : 'paste-button'} title={t('common.paste')} onClick={pastePrivateKey} disabled={isOffline}>{pasted ? <Check /> : <ClipboardPaste />}<span>{pasted ? t('common.pasted') : t('common.paste')}</span></button>
              <button type="button" className="scan-button" title={t('scan.privateKeyButton')} onClick={() => requestDesktopScan('privateKey')} disabled={isOffline}><QrCode /><span>{t('scan.button')}</span></button>
            </div>
          </label>
          <button className="primary-action" onClick={accessWallet} disabled={isOffline}><LockKeyhole />{t('terminal.accessButton')}</button>
          {wallet && (
            <div className="wallet-summary">
              <SecretField label={t('terminal.yourAddress')} value={wallet.address} revealed />
              <strong>{chain.nativeSymbol}: {formatBitcoin(balanceSats)} {chain.nativeSymbol}</strong>
            </div>
          )}
          {scan?.notice && <p className="status-line scan-status">{scan.notice}</p>}
          {status && <p className="status-line">{status}</p>}
        </div>

        <div className={isOffline ? 'operation-panel disabled-panel' : 'operation-panel'}>
          <label className="form-field">
            <span>{t('terminal.destinationAddress')}</span>
            <div className="input-action-field compact scan-address-field">
              <input value={to} onChange={(event) => setTo(event.target.value)} placeholder={t('terminal.destinationAddress')} disabled={isOffline} />
              <button type="button" className="scan-button" title={t('scan.addressButton')} onClick={() => requestDesktopScan('address')} disabled={isOffline}><QrCode /><span>{t('scan.button')}</span></button>
            </div>
          </label>
          <label className="form-field">
            <span>{t('terminal.amount')}</span>
            <div className="input-action-field amount-field">
              <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.0" disabled={isOffline} />
              <button type="button" className="paste-button" title={t('terminal.maxAmount')} onClick={useMaxAmount} disabled={isOffline || !wallet}>{t('terminal.maxAmount')}</button>
            </div>
          </label>
          <p className="estimate">{t('terminal.estimatedGas')}: {estimate || '-'}</p>
          <button className="primary-action" onClick={submit} disabled={!wallet || isOffline || txStage === 'sending'}><RadioTower />{txStage === 'sending' ? t('terminal.processing') : t('terminal.signButton')}</button>
          {txStage !== 'idle' && <TransactionProgress stage={txStage} />}
          {txHash && <div className="tx-result"><SecretField label={t('terminal.txHash')} value={txHash} revealed /></div>}
        </div>
      </div>
    </section>
  );
}

function EvmTerminal({ connection, provider, chain, scan }) {
  const { t } = useTranslation();
  const [credentialMode, setCredentialMode] = useState('privateKey');
  const [privateKey, setPrivateKey] = useState('');
  const [showPrivateKeyInput, setShowPrivateKeyInput] = useState(false);
  const [pasted, setPasted] = useState(false);
  const [wallet, setWallet] = useState(null);
  const [balance, setBalance] = useState('');
  const [nativeBalanceWei, setNativeBalanceWei] = useState(0n);
  const [tokens, setTokens] = useState([]);
  const [tokenChoice, setTokenChoice] = useState(NATIVE_ASSET_ID);
  const [tokenAddressInput, setTokenAddressInput] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [gas, setGas] = useState('normal');
  const [estimate, setEstimate] = useState('');
  const [gasQuote, setGasQuote] = useState(null);
  const [status, setStatus] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [txStage, setTxStage] = useState('idle');
  const [receipt, setReceipt] = useState(null);
  const isOffline = !connection.online;
  const assets = useMemo(() => (wallet ? [
    {
      address: NATIVE_ASSET_ID,
      symbol: chain.nativeSymbol,
      name: chain.nativeName,
      formattedBalance: balance || '0',
      iconSymbol: chain.nativeSymbol,
      risk: { level: 'safe' },
      native: true
    },
    ...tokens
  ] : tokens), [wallet, balance, chain, tokens]);

  useEffect(() => {
    setWallet(null);
    setBalance('');
    setNativeBalanceWei(0n);
    setTokens([]);
    setTokenChoice(NATIVE_ASSET_ID);
    setEstimate('');
    setGasQuote(null);
    setTxHash('');
    setReceipt(null);
    setTxStage('idle');
    setStatus('');
  }, [chain.id]);

  const accessWallet = async () => {
    if (isOffline) return setStatus(t('terminal.offlineBlocked'));
    setStatus(t('terminal.loading'));
    setTxHash('');
    setReceipt(null);
    setTxStage('idle');
    setTokens([]);
    setTokenChoice(NATIVE_ASSET_ID);
    setBalance('');
    setNativeBalanceWei(0n);
    try {
      const nextWallet = openNetworkWalletFromCredential({ credential: privateKey, mode: credentialMode, chain, provider });
      setWallet(nextWallet);
      let nativeBalance;
      try {
        const [balanceResult, quote] = await Promise.all([
          provider.getBalance(nextWallet.address),
          getGasQuote(provider, chain)
        ]);
        nativeBalance = balanceResult;
        setGasQuote(quote);
      } catch {
        setBalance('-');
        setGasQuote(null);
        setStatus(t('errors.networkError'));
        return;
      }
      setBalance(Number(ethers.formatEther(nativeBalance)).toFixed(6));
      setNativeBalanceWei(nativeBalance);
      setStatus(t('terminal.detectingTokens'));
      try {
        const detected = await detectWalletTokens(nextWallet.address, provider, chain);
        const enriched = await Promise.all(detected.map(async (token) => ({ ...token, risk: await analyzeTokenRisk(token, chain) })));
        setTokens(enriched);
        setStatus(t('terminal.walletNetworkReady', { network: chain.name }));
      } catch {
        setTokens([]);
        setStatus(t('terminal.tokensUnavailable'));
      }
    } catch {
      setWallet(null);
      setGasQuote(null);
      setNativeBalanceWei(0n);
      setStatus(t('errors.invalidPrivateKey'));
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!wallet || isOffline) {
      setGasQuote(null);
      return;
    }
    getGasQuote(provider, chain).then((quote) => {
      if (!cancelled) setGasQuote(quote);
    }).catch(() => {
      if (!cancelled) setGasQuote(null);
    });
    return () => { cancelled = true; };
  }, [wallet, provider, chain, isOffline]);

  useEffect(() => {
    let cancelled = false;
    async function runEstimate() {
      if (!wallet || isOffline) return setEstimate('');
      try {
        const selected = tokens.find((token) => token.address === tokenChoice);
        const result = ethers.isAddress(to) && amount
          ? await estimateTransferGas({ wallet, to, amount, token: selected, gasMode: gas, provider, chain })
          : `${Number(ethers.formatEther(await estimateDefaultGasCost({ provider, gasMode: gas, token: selected }))).toFixed(8)} ${chain.nativeSymbol}`;
        if (!cancelled) setEstimate(result);
      } catch {
        if (!cancelled) setEstimate('');
      }
    }
    runEstimate();
    return () => { cancelled = true; };
  }, [wallet, to, amount, tokenChoice, gas, tokens, provider, chain, isOffline]);

  const submit = async () => {
    if (isOffline) return setStatus(t('terminal.offlineBlocked'));
    if (!wallet || !ethers.isAddress(to)) return setStatus(t('errors.invalidAddress'));
    setReceipt(null);
    setTxHash('');
    setTxStage('sending');
    setStatus(t('terminal.sending'));
    try {
      const selected = tokens.find((token) => token.address === tokenChoice);
      const estimatedGasCost = await estimateDefaultGasCost({ provider, gasMode: gas, token: selected });
      if (selected && nativeBalanceWei <= estimatedGasCost) {
        setTxStage('idle');
        setStatus(t('terminal.insufficientGasBalance'));
        return;
      }
      if (!selected && ethers.parseEther(amount || '0') + estimatedGasCost > nativeBalanceWei) {
        setTxStage('idle');
        setStatus(t('terminal.insufficientGasBalance'));
        return;
      }
      const tx = selected
        ? await sendToken({ wallet, token: selected, to, amount, gasMode: gas })
        : await sendEth({ wallet, to, amount, gasMode: gas });
      setTxHash(tx.hash);
      setTxStage('confirming');
      setStatus(t('terminal.confirming'));
      const baseReceipt = {
        hash: tx.hash,
        from: wallet.address,
        to,
        asset: selected ? `${selected.symbol} - ${selected.name}` : chain.nativeSymbol,
        amount,
        network: chain.name,
        nativeSymbol: chain.nativeSymbol,
        explorerUrl: getExplorerTxUrl(chain, tx.hash),
        date: new Date().toISOString()
      };
      setReceipt({
        ...baseReceipt,
        status: t('terminal.pending'),
        blockNumber: '',
        gasCost: ''
      });
      const confirmed = await tx.wait(1);
      const gasCost = confirmed.gasUsed && confirmed.gasPrice ? ethers.formatEther(confirmed.gasUsed * confirmed.gasPrice) : '';
      setReceipt({
        ...baseReceipt,
        status: confirmed?.status === 1 ? t('terminal.completed') : t('errors.transactionFailed'),
        blockNumber: confirmed?.blockNumber || '',
        gasCost
      });
      setTxStage('completed');
      setStatus(t('terminal.transactionCompleted'));
    } catch (error) {
      setTxStage('idle');
      setStatus(error?.shortMessage || t('errors.transactionFailed'));
    }
  };

  const pastePrivateKey = async () => {
    const text = await readText();
    if (text) {
      setPrivateKey(text.trim());
      setPasted(true);
      window.setTimeout(() => setPasted(false), 1200);
    }
  };

  const handleScanResult = useCallback((result) => {
    const target = result?.target;
    const value = String(result?.value || '').trim();
    if (!value) return;

    if (target === 'privateKey') {
      const key = credentialMode === 'phrase' ? value : extractPrivateKeyFromScan(value, chain);
      if (!key) {
        setStatus(t('scan.invalidPrivateKey'));
        return;
      }
      setPrivateKey(key);
      setStatus(t('scan.privateKeyReceived'));
    } else if (target === 'address') {
      const address = extractAddressFromScan(value);
      if (!address) {
        setStatus(t('scan.invalidAddress'));
        return;
      }
      setTo(address);
      setStatus(t('scan.addressReceived'));
    } else if (target === 'contract') {
      const address = extractAddressFromScan(value);
      if (!address) {
        setStatus(t('scan.invalidAddress'));
        return;
      }
      setTokenAddressInput(address);
      setAdvancedOpen(true);
      setStatus(t('scan.contractReceived'));
    }

  }, [chain, credentialMode, t]);

  useEffect(() => {
    return phoneScan.onResult(handleScanResult);
  }, [handleScanResult]);

  const requestDesktopScan = async (target) => {
    if (isOffline) return setStatus(t('terminal.offlineBlocked'));
    if (!scan?.request) return setStatus(t('scan.unavailable'));
    const label = target === 'privateKey' && credentialMode === 'phrase'
      ? t('vault.seedPhrase')
      : t(`scan.${target}Label`);
    const ok = await scan.request({ target, label });
    if (!ok) setStatus(t('scan.unavailable'));
  };

  const addTokenByAddress = async () => {
    if (isOffline) return setStatus(t('terminal.offlineBlocked'));
    if (!wallet) return setStatus(t('terminal.accessButton'));
    if (!ethers.isAddress(tokenAddressInput)) return setStatus(t('errors.invalidAddress'));
    setStatus(t('terminal.loadingToken'));
    try {
      const token = await loadTokenByAddress(tokenAddressInput, wallet.address, provider, {}, chain);
      const enriched = { ...token, risk: await analyzeTokenRisk(token, chain) };
      setTokens((current) => {
        const withoutDuplicate = current.filter((item) => item.address.toLowerCase() !== enriched.address.toLowerCase());
        return [...withoutDuplicate, enriched];
      });
      setTokenChoice(enriched.address);
      setTokenAddressInput('');
      setStatus(t('terminal.tokenAdded'));
    } catch {
      setStatus(t('terminal.tokenNotFound'));
    }
  };

  const useMaxAmount = async () => {
    if (isOffline) return setStatus(t('terminal.offlineBlocked'));
    if (!wallet) return setStatus(t('terminal.accessButton'));
    try {
      const selected = tokens.find((token) => token.address === tokenChoice);
      const gasCost = await estimateDefaultGasCost({ provider, gasMode: gas, token: selected });
      if (selected) {
        if (nativeBalanceWei <= gasCost) {
          setStatus(t('terminal.insufficientGasBalance'));
          return;
        }
        setAmount(selected.formattedBalance);
        setStatus('');
        return;
      }
      const safety = ethers.parseUnits('0.00000001', 'ether');
      const spendable = nativeBalanceWei - gasCost - safety;
      if (spendable <= 0n) {
        setAmount('0');
        setStatus(t('terminal.insufficientGasBalance'));
        return;
      }
      setAmount(ethers.formatEther(spendable));
      setStatus('');
    } catch {
      setStatus(t('terminal.maxUnavailable'));
    }
  };

  return (
    <section className="screen">
      <Header kicker={`${t('terminal.title')} · ${chain.shortName}`} title={`${chain.nativeSymbol} / ${t('terminal.selectToken')}`} subtitle={t('terminal.subtitle')} />
      {isOffline && (
        <div className="offline-lock">
          <WifiOff />
          <div>
            <strong>{t('terminal.offlineTitle')}</strong>
            <span>{t('terminal.offlineText')}</span>
          </div>
        </div>
      )}
      <div className="terminal-layout">
        <div className={isOffline ? 'operation-panel disabled-panel' : 'operation-panel'}>
          <label className="form-field">
            <span>{credentialMode === 'phrase' ? t('vault.seedPhrase') : t('vault.privateKey')}</span>
            <CredentialModeToggle mode={credentialMode} onChange={setCredentialMode} t={t} />
            <div className="input-action-field scan-key-field">
              <input type={showPrivateKeyInput ? 'text' : 'password'} value={privateKey} onChange={(event) => setPrivateKey(event.target.value)} placeholder={credentialMode === 'phrase' ? t('vault.seedPhrase') : t('terminal.privateKeyPlaceholder')} autoComplete="off" spellCheck="false" disabled={isOffline} />
              <button type="button" title={showPrivateKeyInput ? t('common.hide') : t('common.show')} onClick={() => setShowPrivateKeyInput((value) => !value)} disabled={isOffline}>{showPrivateKeyInput ? <EyeOff /> : <Eye />}</button>
              <button type="button" className={pasted ? 'paste-button pasted' : 'paste-button'} title={t('common.paste')} onClick={pastePrivateKey} disabled={isOffline}>{pasted ? <Check /> : <ClipboardPaste />}<span>{pasted ? t('common.pasted') : t('common.paste')}</span></button>
              <button type="button" className="scan-button" title={t('scan.privateKeyButton')} onClick={() => requestDesktopScan('privateKey')} disabled={isOffline}><QrCode /><span>{t('scan.button')}</span></button>
            </div>
          </label>
          <button className="primary-action" onClick={accessWallet} disabled={isOffline}><LockKeyhole />{t('terminal.accessButton')}</button>
          {wallet && (
            <div className="wallet-summary">
              <SecretField label={t('terminal.yourAddress')} value={wallet.address} revealed />
              <strong>{chain.nativeSymbol}: {balance} {chain.nativeSymbol}</strong>
              <GasPanel quote={gasQuote} t={t} chain={chain} />
            </div>
          )}
          {scan?.notice && <p className="status-line scan-status">{scan.notice}</p>}
          {status && <p className="status-line">{status}</p>}
        </div>

        <div className={isOffline ? 'operation-panel disabled-panel' : 'operation-panel'}>
          <label className="form-field">
            <span>{t('terminal.destinationAddress')}</span>
            <div className="input-action-field compact scan-address-field">
              <input value={to} onChange={(event) => setTo(event.target.value)} placeholder="0x..." disabled={isOffline} />
              <button type="button" className="scan-button" title={t('scan.addressButton')} onClick={() => requestDesktopScan('address')} disabled={isOffline}><QrCode /><span>{t('scan.button')}</span></button>
            </div>
          </label>
          <label className="form-field">
            <span>{t('terminal.amount')}</span>
            <div className="input-action-field amount-field">
              <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.0" disabled={isOffline} />
              <button type="button" className="paste-button" title={t('terminal.maxAmount')} onClick={useMaxAmount} disabled={isOffline || !wallet}>{t('terminal.maxAmount')}</button>
            </div>
          </label>
          <label className="form-field">
            <span>{t('terminal.selectToken')}</span>
            <select value={tokenChoice} onChange={(event) => setTokenChoice(event.target.value)} disabled={isOffline}>
              <option value={NATIVE_ASSET_ID}>{chain.nativeSymbol} - {chain.nativeName}</option>
              {tokens.map((token) => <option key={token.address} value={token.address}>{token.symbol} - {token.name}</option>)}
            </select>
          </label>
          <button type="button" className="advanced-toggle" onClick={() => setAdvancedOpen((value) => !value)} disabled={isOffline}>
            <Plus />
            <span>{advancedOpen ? t('terminal.hideAdvanced') : t('terminal.advancedOptions')}</span>
          </button>
          {advancedOpen && (
            <label className="form-field advanced-field">
              <span>{t('terminal.tokenContract')}</span>
              <div className="input-action-field compact scan-token-field">
                <input value={tokenAddressInput} onChange={(event) => setTokenAddressInput(event.target.value)} placeholder="0x..." autoComplete="off" spellCheck="false" disabled={isOffline} />
                <button type="button" className="scan-button" title={t('scan.contractButton')} onClick={() => requestDesktopScan('contract')} disabled={isOffline}><QrCode /><span>{t('scan.button')}</span></button>
                <button type="button" className="paste-button" title={t('terminal.addToken')} onClick={addTokenByAddress} disabled={isOffline}><Plus /><span>{t('terminal.addToken')}</span></button>
              </div>
            </label>
          )}
          <div className="segmented">
            {['slow', 'normal', 'fast'].map((speed) => <button key={speed} type="button" className={gas === speed ? 'selected' : ''} onClick={() => setGas(speed)} disabled={isOffline}>{t(`terminal.${speed}`)}</button>)}
          </div>
          <p className="estimate">{t('terminal.estimatedGas')}: {estimate || '-'}</p>
          <button className="primary-action" onClick={submit} disabled={!wallet || isOffline || txStage === 'sending' || txStage === 'confirming'}><RadioTower />{txStage === 'sending' || txStage === 'confirming' ? t('terminal.processing') : t('terminal.signButton')}</button>
          {txStage !== 'idle' && <TransactionProgress stage={txStage} />}
          {txHash && <div className="tx-result"><SecretField label={t('terminal.txHash')} value={txHash} revealed /><button onClick={() => window.whales?.openExternal(getExplorerTxUrl(chain, txHash))}>{t('terminal.viewOnExplorer')}</button></div>}
          {receipt && <button className="secondary-action" onClick={() => downloadTransactionReceipt(receipt, t)}><Download />{t('terminal.downloadReceipt')}</button>}
        </div>
      </div>
      {wallet && <TokenList tokens={assets} />}
    </section>
  );
}

function extractPrivateKeyFromScan(value, network) {
  if (network?.type === 'solana') {
    try {
      return normalizeSolanaPrivateKey(value).privateKey;
    } catch {
      return '';
    }
  }
  if (network?.type === 'bitcoin') {
    try {
      return normalizeBitcoinPrivateKey(value, network);
    } catch {
      return '';
    }
  }
  const match = String(value || '').match(/(?:0x)?[a-fA-F0-9]{64}/);
  if (!match) return '';
  const raw = match[0].startsWith('0x') ? match[0] : `0x${match[0]}`;
  try {
    return normalizePrivateKey(raw);
  } catch {
    return '';
  }
}

function extractAddressFromScan(value) {
  const match = String(value || '').match(/0x[a-fA-F0-9]{40}/);
  if (!match) return '';
  return ethers.getAddress(match[0]);
}

function extractCalldataFromScan(value) {
  const match = String(value || '').match(/0x[a-fA-F0-9]{8,}/);
  if (!match || match[0].length % 2 !== 0) return '';
  return match[0];
}

function parseContractArgs(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return text.split(',').map((part) => {
      const trimmed = part.trim();
      if (trimmed === 'true') return true;
      if (trimmed === 'false') return false;
      return trimmed.replace(/^["']|["']$/g, '');
    }).filter((part) => part !== '');
  }
}

function buildContractData({ mode, calldata, functionSignature, parameters }) {
  if (mode === 'raw') {
    const data = String(calldata || '').trim();
    if (!/^0x([0-9a-fA-F]{2})+$/.test(data)) throw new Error('invalid-calldata');
    return data;
  }
  const signature = String(functionSignature || '').trim();
  if (!signature) throw new Error('invalid-function');
  const fragment = signature.startsWith('function ') ? signature : `function ${signature}`;
  const iface = new ethers.Interface([fragment]);
  const fn = iface.fragments.find((item) => item.type === 'function');
  if (!fn) throw new Error('invalid-function');
  return iface.encodeFunctionData(fn.name, parseContractArgs(parameters));
}

function ContractsView(props) {
  if (!isEvmNetwork(props.chain) && props.chain.type !== 'solana' && props.chain.type !== 'bitcoin') {
    return <NetworkModeNotice section="contracts" network={props.chain} />;
  }
  return <WalletConnectContractsView {...props} />;
}

function WalletConnectContractsView({ connection, provider, chain, scan }) {
  const { t } = useTranslation();
  const [credentialMode, setCredentialMode] = useState('privateKey');
  const [privateKey, setPrivateKey] = useState('');
  const [showPrivateKeyInput, setShowPrivateKeyInput] = useState(false);
  const [pasted, setPasted] = useState(false);
  const [wallet, setWallet] = useState(null);
  const [walletKit, setWalletKit] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [pendingProposal, setPendingProposal] = useState(null);
  const [pendingRequest, setPendingRequest] = useState(null);
  const [wcUriInput, setWcUriInput] = useState('');
  const [gasQuote, setGasQuote] = useState(null);
  const [status, setStatus] = useState('');
  const [requestProcessing, setRequestProcessing] = useState(false);
  const walletKitRef = useRef(null);
  const walletConnectToolsRef = useRef(null);
  const [walletConnectTools, setWalletConnectTools] = useState(null);
  const isOffline = !connection.online;

  const ensureWalletConnectTools = useCallback(async () => {
    if (walletConnectToolsRef.current) return walletConnectToolsRef.current;
    const tools = await import('./services/walletconnect');
    walletConnectToolsRef.current = tools;
    setWalletConnectTools(tools);
    return tools;
  }, []);

  useEffect(() => {
    const client = walletKitRef.current;
    const tools = walletConnectToolsRef.current;
    if (client?.getActiveSessions && tools) {
      Object.values(client.getActiveSessions() || {}).forEach((session) => {
        client.disconnectSession({ topic: session.topic, reason: tools.getWalletConnectError('USER_DISCONNECTED') }).catch(() => {});
      });
    }
    setWallet(null);
    setGasQuote(null);
    setSessions([]);
    setPendingProposal(null);
    setPendingRequest(null);
    setStatus('');
  }, [chain.id]);

  const refreshSessions = useCallback((client = walletKitRef.current) => {
    const tools = walletConnectToolsRef.current;
    setSessions(tools ? tools.getWalletConnectSessions(client) : []);
  }, []);

  const ensureWalletKit = useCallback(async () => {
    if (walletKitRef.current) return walletKitRef.current;
    const tools = await ensureWalletConnectTools();
    const client = await tools.getSwopWalletKit();
    walletKitRef.current = client;
    setWalletKit(client);
    refreshSessions(client);
    return client;
  }, [ensureWalletConnectTools, refreshSessions]);

  useEffect(() => {
    if (!walletKit) return undefined;
    const onProposal = (proposal) => {
      setPendingProposal(proposal);
      setStatus(t('contracts.proposalReceived'));
    };
    const onRequest = (event) => {
      setPendingRequest(event);
      setStatus(t('contracts.requestReceived'));
    };
    const onDelete = () => {
      refreshSessions(walletKit);
      setStatus(t('contracts.sessionClosed'));
    };
    const onUpdate = () => refreshSessions(walletKit);
    walletKit.on('session_proposal', onProposal);
    walletKit.on('session_request', onRequest);
    walletKit.on('session_delete', onDelete);
    walletKit.on('session_update', onUpdate);
    return () => {
      walletKit.off?.('session_proposal', onProposal);
      walletKit.off?.('session_request', onRequest);
      walletKit.off?.('session_delete', onDelete);
      walletKit.off?.('session_update', onUpdate);
    };
  }, [refreshSessions, t, walletKit]);

  useEffect(() => {
    if (!wallet || isOffline) return;
    ensureWalletKit().catch(() => setStatus(t('contracts.walletConnectUnavailable')));
  }, [ensureWalletKit, isOffline, t, wallet]);

  const accessWallet = async () => {
    if (isOffline) return setStatus(t('contracts.offlineBlocked'));
    try {
      const nextWallet = openNetworkWalletFromCredential({ credential: privateKey, mode: credentialMode, chain, provider });
      setWallet(nextWallet);
      setGasQuote(chain.type === 'solana' || chain.type === 'bitcoin' ? null : await getGasQuote(provider, chain));
      setStatus(t('contracts.walletReady'));
      await ensureWalletKit();
    } catch {
      setWallet(null);
      setStatus(t('errors.invalidPrivateKey'));
    }
  };

  const pastePrivateKey = async () => {
    const text = await readText();
    if (text) {
      setPrivateKey(text.trim());
      setPasted(true);
      window.setTimeout(() => setPasted(false), 1200);
    }
  };

  const connectWalletConnect = useCallback(async (uri) => {
    if (isOffline) return setStatus(t('contracts.offlineBlocked'));
    if (!wallet) return setStatus(t('contracts.accessFirst'));
    const value = String(uri || '').trim();
    if (!isWalletConnectUri(value)) return setStatus(t('contracts.invalidWalletConnectQr'));
    try {
      const tools = await ensureWalletConnectTools();
      const client = await ensureWalletKit();
      setStatus(t('contracts.pairing'));
      await tools.prepareWalletConnectRelay(client);
      await client.pair({ uri: value });
      setWcUriInput('');
      refreshSessions(client);
      setStatus(t('contracts.waitingProposal'));
    } catch (error) {
      const tools = walletConnectToolsRef.current;
      setStatus(tools?.getWalletConnectUserMessage(error, t) || t('contracts.walletConnectUnavailable'));
    }
  }, [ensureWalletConnectTools, ensureWalletKit, isOffline, refreshSessions, t, wallet]);

  const requestContractScan = async (target, label) => {
    if (isOffline) return setStatus(t('contracts.offlineBlocked'));
    if (!scan?.request) return setStatus(t('scan.unavailable'));
    const ok = await scan.request({ target, label });
    if (!ok) setStatus(t('scan.unavailable'));
  };

  const handleScanResult = useCallback((result) => {
    const target = result?.target;
    const value = String(result?.value || '').trim();
    if (!value) return;

    if (target === 'privateKey') {
      const key = credentialMode === 'phrase' ? value : extractPrivateKeyFromScan(value, chain);
      if (!key) return setStatus(t('scan.invalidPrivateKey'));
      setPrivateKey(key);
      setStatus(t('scan.privateKeyReceived'));
    }

    if (target === 'walletConnect') {
      if (!isWalletConnectUri(value)) return setStatus(t('contracts.invalidWalletConnectQr'));
      setStatus(t('scan.walletConnectReceived'));
      connectWalletConnect(value);
    }
  }, [chain, connectWalletConnect, credentialMode, t]);

  useEffect(() => {
    return phoneScan.onResult(handleScanResult);
  }, [handleScanResult]);

  const approveProposal = async () => {
    if (!pendingProposal || !walletKit || !wallet) return;
    try {
      const tools = await ensureWalletConnectTools();
      setStatus(t('contracts.approvingSession'));
      const namespaces = tools.buildSwopApprovedNamespaces(pendingProposal.params, wallet.address, chain);
      await walletKit.approveSession({ id: pendingProposal.id, namespaces });
      setPendingProposal(null);
      refreshSessions(walletKit);
      setStatus(t('contracts.sessionApproved'));
    } catch (error) {
      const tools = walletConnectToolsRef.current;
      setStatus(tools?.getWalletConnectUserMessage(error, t) || t('contracts.requestFailed'));
    }
  };

  const rejectProposal = async () => {
    if (!pendingProposal || !walletKit) return;
    try {
      const tools = await ensureWalletConnectTools();
      await walletKit.rejectSession({ id: pendingProposal.id, reason: tools.getWalletConnectError('USER_REJECTED') });
    } catch {
      // The proposal may already be expired; the local panel can still close.
    }
    setPendingProposal(null);
    setStatus(t('contracts.sessionRejected'));
  };

  const approveRequest = async () => {
    if (!pendingRequest || !walletKit || !wallet) return;
    setRequestProcessing(true);
    try {
      const tools = await ensureWalletConnectTools();
      const result = await tools.executeWalletConnectRequest({ event: pendingRequest, wallet, provider, chain });
      await walletKit.respondSessionRequest({
        topic: pendingRequest.topic,
        response: tools.makeJsonRpcResult(pendingRequest.id, result)
      });
      const completedMethod = tools.getWalletConnectRequest(pendingRequest).method;
      setStatus(completedMethod === 'eth_sendTransaction'
        || completedMethod === 'solana_signAndSendTransaction'
        || completedMethod === 'btc_sendTransfer'
        || completedMethod === 'bip122_sendTransfer'
        ? t('contracts.transactionSent')
        : t('contracts.requestApproved'));
      setPendingRequest(null);
      refreshSessions(walletKit);
    } catch (error) {
      const tools = await ensureWalletConnectTools();
      await walletKit.respondSessionRequest({
        topic: pendingRequest.topic,
        response: tools.makeJsonRpcError(pendingRequest.id, error, t('contracts.requestFailed'))
      }).catch(() => {});
      setStatus(tools.getWalletConnectUserMessage(error, t) || t('contracts.requestFailed'));
      setPendingRequest(null);
    } finally {
      setRequestProcessing(false);
    }
  };

  const rejectRequest = async () => {
    if (!pendingRequest || !walletKit) return;
    setRequestProcessing(true);
    try {
      const tools = await ensureWalletConnectTools();
      await walletKit.respondSessionRequest({
        topic: pendingRequest.topic,
        response: tools.makeJsonRpcError(pendingRequest.id, { code: 5000, message: t('contracts.requestRejected') })
      });
      setStatus(t('contracts.requestRejected'));
      setPendingRequest(null);
    } finally {
      setRequestProcessing(false);
    }
  };

  const disconnectSession = async (session) => {
    if (!walletKit) return;
    try {
      const tools = await ensureWalletConnectTools();
      await walletKit.disconnectSession({ topic: session.topic, reason: tools.getWalletConnectError('USER_DISCONNECTED') });
      refreshSessions(walletKit);
      setStatus(t('contracts.sessionClosed'));
    } catch (error) {
      const tools = walletConnectToolsRef.current;
      setStatus(tools?.getWalletConnectUserMessage(error, t) || t('contracts.requestFailed'));
    }
  };

  const pasteWalletConnectUri = async () => {
    const text = await readText();
    if (text) setWcUriInput(text.trim());
  };

  const activeRequestSession = pendingRequest ? sessions.find((session) => session.topic === pendingRequest.topic) : null;

  return (
    <section className="screen">
      <Header kicker={`${t('contracts.nav')} · ${chain.shortName}`} title={`WalletConnect · ${chain.shortName}`} subtitle={t('contracts.subtitle')} />
      {isOffline && (
        <div className="offline-lock">
          <WifiOff />
          <div>
            <strong>{t('contracts.offlineTitle')}</strong>
            <span>{t('contracts.offlineText')}</span>
          </div>
        </div>
      )}
      <div className="terminal-layout contracts-layout">
        <div className={isOffline ? 'operation-panel disabled-panel' : 'operation-panel'}>
          <label className="form-field">
            <span>{credentialMode === 'phrase' ? t('vault.seedPhrase') : t('vault.privateKey')}</span>
            <CredentialModeToggle mode={credentialMode} onChange={setCredentialMode} t={t} />
            <div className="input-action-field scan-key-field">
              <input type={showPrivateKeyInput ? 'text' : 'password'} value={privateKey} onChange={(event) => setPrivateKey(event.target.value)} placeholder={credentialMode === 'phrase' ? t('vault.seedPhrase') : t('terminal.privateKeyPlaceholder')} autoComplete="off" spellCheck="false" disabled={isOffline} />
              <button type="button" title={showPrivateKeyInput ? t('common.hide') : t('common.show')} onClick={() => setShowPrivateKeyInput((value) => !value)} disabled={isOffline}>{showPrivateKeyInput ? <EyeOff /> : <Eye />}</button>
              <button type="button" className={pasted ? 'paste-button pasted' : 'paste-button'} title={t('common.paste')} onClick={pastePrivateKey} disabled={isOffline}>{pasted ? <Check /> : <ClipboardPaste />}<span>{pasted ? t('common.pasted') : t('common.paste')}</span></button>
              <button type="button" className="scan-button" title={credentialMode === 'phrase' ? t('vault.seedPhrase') : t('scan.privateKeyButton')} onClick={() => requestContractScan('privateKey', credentialMode === 'phrase' ? t('vault.seedPhrase') : t('scan.privateKeyLabel'))} disabled={isOffline}><QrCode /><span>{t('scan.button')}</span></button>
            </div>
          </label>
          <button className="primary-action" onClick={accessWallet} disabled={isOffline}><LockKeyhole />{t('contracts.accessButton')}</button>
          {wallet && (
            <div className="wallet-summary">
              <SecretField label={t('terminal.yourAddress')} value={wallet.address} revealed />
              {chain.type !== 'solana' && chain.type !== 'bitcoin' && <GasPanel quote={gasQuote} t={t} chain={chain} />}
            </div>
          )}
          <button type="button" className="primary-action" onClick={() => requestContractScan('walletConnect', t('scan.walletConnectLabel'))} disabled={isOffline || !wallet}>
            <QrCode />
            {t('contracts.scanWalletConnect')}
          </button>
          <label className="form-field">
            <span>{t('contracts.manualUri')}</span>
            <div className="input-action-field compact scan-address-field">
              <input value={wcUriInput} onChange={(event) => setWcUriInput(event.target.value)} placeholder="wc:..." spellCheck="false" disabled={isOffline || !wallet} />
              <button type="button" className="paste-button" title={t('common.paste')} onClick={pasteWalletConnectUri} disabled={isOffline || !wallet}><ClipboardPaste /><span>{t('common.paste')}</span></button>
            </div>
          </label>
          <button className="secondary-action" onClick={() => connectWalletConnect(wcUriInput)} disabled={isOffline || !wallet || !wcUriInput.trim()}>
            <FileSignature />
            {t('contracts.connectButton')}
          </button>
          {scan?.notice && <p className="status-line scan-status">{scan.notice}</p>}
          {status && <p className="status-line">{status}</p>}
        </div>

        <div className={isOffline ? 'operation-panel disabled-panel' : 'operation-panel'}>
          {pendingProposal && <WalletConnectProposal proposal={pendingProposal} tools={walletConnectTools} onApprove={approveProposal} onReject={rejectProposal} />}
          {pendingRequest && (
            <WalletConnectRequest
              event={pendingRequest}
              session={activeRequestSession}
              chain={chain}
              tools={walletConnectTools}
              processing={requestProcessing}
              onApprove={approveRequest}
              onReject={rejectRequest}
            />
          )}
          <WalletConnectSessions sessions={sessions} tools={walletConnectTools} onDisconnect={disconnectSession} />
        </div>
      </div>
    </section>
  );
}

function WalletConnectProposal({ proposal, tools, onApprove, onReject }) {
  const { t } = useTranslation();
  const peer = tools?.getWalletConnectPeer(proposal);
  return (
    <article className="wc-card active">
      <WalletConnectPeer peer={peer} fallback={t('contracts.unknownDapp')} />
      <h3>{t('contracts.proposalTitle')}</h3>
      <p>{t('contracts.proposalText')}</p>
      <div className="wc-actions">
        <button className="primary-action" type="button" onClick={onApprove}><Check />{t('contracts.approve')}</button>
        <button className="danger-action" type="button" onClick={onReject}>{t('contracts.reject')}</button>
      </div>
    </article>
  );
}

function WalletConnectRequest({ event, session, chain, tools, processing, onApprove, onReject }) {
  const { t } = useTranslation();
  const request = tools?.getWalletConnectRequest(event) || {};
  const peer = tools?.getWalletConnectPeer(session);
  const { rows, insight } = walletConnectRequestView(request, t, chain);
  const [acknowledged, setAcknowledged] = useState(false);
  useEffect(() => setAcknowledged(false), [event?.id]);
  // Aprobaciones de gasto, permits y órdenes: no se pueden aprobar sin marcar antes que se entiende qué es.
  const needsAcknowledge = insight?.risk === 'high';
  const fullData = useMemo(() => {
    try {
      return JSON.stringify(request.params ?? null, null, 2);
    } catch {
      return String(request.params);
    }
  }, [request.params]);
  return (
    <article className="wc-card active">
      <WalletConnectPeer peer={peer} fallback={t('contracts.unknownDapp')} />
      <h3>{walletConnectRequestTitle(request.method, t)}</h3>
      <p>{t('contracts.requestText')}</p>
      {insight?.risk && (
        <div className={`wc-risk ${insight.risk}`}>
          <ShieldAlert />
          <div>
            <strong>{insight.risk === 'high' ? t('contracts.riskHighTitle') : t('contracts.riskMediumTitle')}</strong>
            <span>{t(`contracts.risk_${insight.kind}`)}</span>
          </div>
        </div>
      )}
      <div className="wc-request-lines">
        <div><span>{t('contracts.method')}</span><code>{request.method}</code></div>
        {rows.map((row) => (
          <div key={row.label} className={row.danger ? 'danger' : undefined}>
            <span>{row.label}</span>
            <code>{row.value}</code>
          </div>
        ))}
      </div>
      <details className="wc-full-data">
        <summary>{t('contracts.fullData')}</summary>
        <pre>{fullData}</pre>
      </details>
      {needsAcknowledge && (
        <label className="check-field wc-acknowledge">
          <input type="checkbox" checked={acknowledged} onChange={(changeEvent) => setAcknowledged(changeEvent.target.checked)} />
          <span>{t('contracts.riskAcknowledge')}</span>
        </label>
      )}
      <div className="wc-actions">
        <button className="primary-action" type="button" onClick={onApprove} disabled={processing || (needsAcknowledge && !acknowledged)}><Check />{processing ? t('terminal.processing') : t('contracts.approve')}</button>
        <button className="danger-action" type="button" onClick={onReject} disabled={processing}>{t('contracts.reject')}</button>
      </div>
    </article>
  );
}

function WalletConnectSessions({ sessions, tools, onDisconnect }) {
  const { t } = useTranslation();
  return (
    <section className="wc-sessions">
      <h3>{t('contracts.sessionsTitle')}</h3>
      {sessions.length === 0 && <p>{t('contracts.noSessions')}</p>}
      {sessions.map((session) => (
        <article className="wc-session" key={session.topic}>
          <WalletConnectPeer peer={tools?.getWalletConnectPeer(session)} fallback={t('contracts.unknownDapp')} />
          <button className="secondary-action" type="button" onClick={() => onDisconnect(session)}>{t('contracts.disconnect')}</button>
        </article>
      ))}
    </section>
  );
}

function WalletConnectPeer({ peer, fallback }) {
  const icon = Array.isArray(peer?.icons) ? peer.icons[0] : '';
  return (
    <div className="wc-peer">
      {icon ? <img src={icon} alt="" /> : <span><Globe2 /></span>}
      <div>
        <strong>{peer?.name || fallback}</strong>
        {peer?.url && <small>{peer.url}</small>}
      </div>
    </div>
  );
}

function walletConnectRequestTitle(method, t) {
  if (method === 'eth_sendTransaction') return t('contracts.requestSendTransaction');
  if (method === 'eth_signTransaction') return t('contracts.requestSignTransaction');
  if (method === 'solana_signAndSendTransaction') return t('contracts.requestSendTransaction');
  if (method === 'solana_signTransaction' || method === 'solana_signAllTransactions') return t('contracts.requestSignTransaction');
  if (method === 'solana_signMessage') return t('contracts.requestSignMessage');
  if (method === 'btc_sendTransfer' || method === 'bip122_sendTransfer') return t('contracts.requestSendTransaction');
  if (method === 'btc_signPsbt' || method === 'bip122_signPsbt') return t('contracts.requestSignTransaction');
  if (method === 'btc_signMessage' || method === 'bip122_signMessage') return t('contracts.requestSignMessage');
  if (method === 'personal_sign' || method === 'eth_sign') return t('contracts.requestSignMessage');
  if (String(method || '').startsWith('eth_signTypedData')) return t('contracts.requestTypedData');
  if (method === 'wallet_switchEthereumChain') return t('contracts.requestSwitchChain');
  return t('contracts.requestGeneric');
}

function walletConnectRequestRows(request, t, chain) {
  const method = request?.method;
  const params = Array.isArray(request?.params) ? request.params : [];
  if (method === 'eth_sendTransaction' || method === 'eth_signTransaction') {
    const tx = params[0] || {};
    return [
      { label: t('contracts.to'), value: tx.to || '-' },
      { label: t('contracts.value'), value: formatWalletConnectValue(tx.value, chain) },
      { label: t('contracts.data'), value: shortenMiddle(tx.data || '0x', 96) }
    ];
  }
  if (method === 'solana_signAndSendTransaction' || method === 'solana_signTransaction') {
    const payload = params[0] && typeof params[0] === 'object' ? params[0] : { transaction: params[0] };
    return [
      { label: t('contracts.chain'), value: chain.shortName },
      { label: t('contracts.data'), value: shortenMiddle(payload.transaction || '-', 140) }
    ];
  }
  if (method === 'solana_signAllTransactions') {
    const payload = params[0] && typeof params[0] === 'object' ? params[0] : { transactions: params[0] };
    return [
      { label: t('contracts.chain'), value: chain.shortName },
      { label: t('contracts.parameters'), value: `${payload.transactions?.length || 0} ${t('terminal.transactions')}` }
    ];
  }
  if (method === 'solana_signMessage') {
    const payload = params[0] && typeof params[0] === 'object' ? params[0] : { message: params[0] };
    return [{ label: t('contracts.message'), value: shortenMiddle(String(payload.message || '-'), 220) }];
  }
  if (method === 'btc_sendTransfer' || method === 'bip122_sendTransfer') {
    const payload = params[0] && typeof params[0] === 'object' ? params[0] : {};
    return [
      { label: t('contracts.to'), value: payload.recipient || payload.to || payload.address || '-' },
      { label: t('contracts.value'), value: String(payload.amountSats ?? payload.satoshis ?? payload.amount ?? '-') }
    ];
  }
  if (method === 'btc_signPsbt' || method === 'bip122_signPsbt') {
    const payload = params[0] && typeof params[0] === 'object' ? params[0] : { psbt: params[0] };
    return [{ label: t('contracts.data'), value: shortenMiddle(String(payload.psbt || '-'), 220) }];
  }
  if (method === 'btc_signMessage' || method === 'bip122_signMessage') {
    const payload = params[0] && typeof params[0] === 'object' ? params[0] : { message: params[0] };
    return [{ label: t('contracts.message'), value: shortenMiddle(String(payload.message || '-'), 220) }];
  }
  if (method === 'personal_sign' || method === 'eth_sign') {
    const message = ethers.isAddress(String(params[0] || '')) ? params[1] : (params[1] || params[0]);
    return [{ label: t('contracts.message'), value: shortenMiddle(formatWalletConnectMessage(message), 220) }];
  }
  if (String(method || '').startsWith('eth_signTypedData')) {
    const typed = params.find((param) => typeof param === 'object' || String(param || '').trim().startsWith('{'));
    let parsed = typed;
    try {
      parsed = typeof typed === 'string' ? JSON.parse(typed) : typed;
    } catch {
      parsed = typed;
    }
    return [
      { label: t('contracts.domain'), value: parsed?.domain?.name || '-' },
      { label: t('contracts.primaryType'), value: parsed?.primaryType || '-' }
    ];
  }
  if (method === 'wallet_switchEthereumChain') {
    return [{ label: t('contracts.chain'), value: params?.[0]?.chainId || '0x1' }];
  }
  return [{ label: t('contracts.parameters'), value: shortenMiddle(JSON.stringify(params), 220) }];
}

// Filas y nivel de riesgo de una solicitud. Las transacciones y firmas que se pueden leer se explican
// (a quién se da permiso y por cuánto); las que SWOP no puede leer se marcan para revisar.
function walletConnectRequestView(request, t, chain) {
  const method = request?.method;
  const params = Array.isArray(request?.params) ? request.params : [];
  const detailRows = (details) => details.map(([key, value]) => ({
    label: t(`contracts.${key}`),
    value: value === UNLIMITED ? t('contracts.unlimited') : value,
    danger: value === UNLIMITED
  }));

  if (method === 'eth_sendTransaction' || method === 'eth_signTransaction') {
    const tx = params[0] || {};
    const insight = describeEvmTransaction(tx);
    return {
      insight,
      rows: [
        { label: t('contracts.to'), value: tx.to || '-' },
        { label: t('contracts.value'), value: formatWalletConnectValue(tx.value, chain) },
        ...detailRows(insight.details.filter(([key]) => key !== 'contract'))
      ]
    };
  }
  if (String(method || '').startsWith('eth_signTypedData')) {
    const typed = params.find((param) => typeof param === 'object' || String(param || '').trim().startsWith('{'));
    let parsed = null;
    try {
      parsed = typeof typed === 'string' ? JSON.parse(typed) : typed;
    } catch {
      parsed = null;
    }
    const insight = describeTypedData(parsed);
    return { insight, rows: detailRows(insight.details) };
  }
  if (['solana_signTransaction', 'solana_signAllTransactions', 'solana_signAndSendTransaction', 'btc_signPsbt', 'bip122_signPsbt'].includes(method)) {
    return { insight: { kind: 'opaque', risk: 'medium' }, rows: walletConnectRequestRows(request, t, chain) };
  }
  return { insight: null, rows: walletConnectRequestRows(request, t, chain) };
}

function formatWalletConnectValue(value, chain) {
  const selected = getChainById(chain?.id || chain);
  if (!value) return `0 ${selected.nativeSymbol}`;
  try {
    return `${ethers.formatEther(BigInt(value))} ${selected.nativeSymbol}`;
  } catch {
    return String(value);
  }
}

function formatWalletConnectMessage(value) {
  const text = String(value || '');
  if (!ethers.isHexString(text)) return text;
  try {
    return ethers.toUtf8String(text);
  } catch {
    return text;
  }
}

function shortenMiddle(value, max = 120) {
  const text = String(value || '');
  if (text.length <= max) return text;
  const edge = Math.max(12, Math.floor((max - 3) / 2));
  return `${text.slice(0, edge)}...${text.slice(-edge)}`;
}

function HelpView() {
  const { t } = useTranslation();
  const [open, setOpen] = useState('vault');
  const cards = ['vault', 'send', 'contracts', 'scan', 'gas', 'paper', 'security', 'privacy', 'guard'];
  const faqs = ['privateKey', 'recovery', 'offline', 'networks', 'gas', 'tokens', 'contracts', 'dappRequest', 'scan', 'copy', 'risk', 'batch', 'max', 'update'];
  return (
    <section className="screen">
      <Header kicker={t('help.nav')} title={t('help.title')} subtitle={t('help.subtitle')} />
      <div className="help-hero">
        <img src={logoWhale} alt="" />
        <div>
          <h3>{t('help.quickTitle')}</h3>
          <p>{t('help.quickText')}</p>
        </div>
      </div>

      <div className="help-flow">
        {cards.map((card, index) => (
          <article key={card}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <h3>{t(`help.${card}Title`)}</h3>
            <p>{t(`help.${card}Text`)}</p>
          </article>
        ))}
      </div>

      <div className="help-columns">
        <section className="help-panel">
          <h3>{t('help.faqTitle')}</h3>
          <div className="faq-stack">
            {faqs.map((faq) => (
              <article key={faq} className={open === faq ? 'open' : ''}>
                <button type="button" onClick={() => setOpen(open === faq ? '' : faq)}>
                  <span>{t(`help.${faq}Question`)}</span>
                  <ChevronDown />
                </button>
                {open === faq && <p>{t(`help.${faq}Answer`)}</p>}
              </article>
            ))}
          </div>
        </section>

        <aside className="help-panel guard-panel">
          <h3>{t('help.guardTitle')}</h3>
          <p>{t('help.guardText')}</p>
          <ul>
            <li>{t('help.guardPointVersion')}</li>
            <li>{t('help.guardPointIntegrity')}</li>
            <li>{t('help.guardPointSubscriber')}</li>
          </ul>
        </aside>
      </div>
    </section>
  );
}

function GasPanel({ quote, t, chain }) {
  if (!quote) return <p className="gas-panel">{t('terminal.gasUnavailable')}</p>;
  const symbol = quote.nativeSymbol || chain?.nativeSymbol || 'ETH';
  return (
    <div className="gas-panel">
      <span>{t('terminal.gasNow')}</span>
      <strong>{quote.gasPriceGwei} Gwei</strong>
      <small>{t('terminal.priorityFee')}: {quote.priorityFeeGwei} Gwei</small>
      <small>{quote.nativeTransfer || quote.ethTransferEth} {symbol}</small>
    </div>
  );
}

function TransactionProgress({ stage }) {
  const { t } = useTranslation();
  const steps = ['sending', 'confirming', 'completed'];
  const current = stage === 'pending' ? 1 : Math.max(0, steps.indexOf(stage));
  return (
    <div className={`tx-progress ${stage}`}>
      {steps.map((step, index) => (
        <div key={step} className={index <= current ? 'active' : ''}>
          <i />
          <span>{t(`terminal.${step}`)}</span>
        </div>
      ))}
      {stage === 'pending' && <p>{t('terminal.pendingHint')}</p>}
    </div>
  );
}

function TokenList({ tokens }) {
  const { t } = useTranslation();
  return (
    <section className="token-section">
      <h3>{t('terminal.tokensDetected')}</h3>
      <div className="token-list">
        {tokens.length === 0 && <p>{t('terminal.noTokens')}</p>}
        {tokens.map((token) => (
          <article key={token.address} className="token-row">
            <TokenIcon token={token} />
            <strong>{token.symbol}</strong>
            <span>{token.name}</span>
            <code>{token.formattedBalance}</code>
            <RiskBadge risk={token.risk} />
          </article>
        ))}
      </div>
    </section>
  );
}

function TokenIcon({ token }) {
  const [failed, setFailed] = useState(false);
  if (token.iconUrl && !failed) {
    return <img className="token-icon" src={token.iconUrl} alt="" onError={() => setFailed(true)} />;
  }
  return <span className="token-icon fallback">{token.iconSymbol || token.symbol?.slice(0, 2) || '?'}</span>;
}

function RiskBadge({ risk }) {
  const { t } = useTranslation();
  const key = risk?.level || 'verify';
  return <span className={`risk ${key}`} title={t(`security.${key}Description`)}>{t(`security.${key}`)}</span>;
}

function UpdateGate({ gate, t }) {
  return (
    <div className="update-gate">
      <img src={logoWhale} alt="SWOP" />
      <h1>{t('updateGate.title')}</h1>
      <p>{gate.message || t('updateGate.message')}</p>
      <button className="primary-action" onClick={() => window.whales?.openExternal(gate.downloadUrl)}><RefreshCw />{t('updateGate.downloadButton')}</button>
      <button onClick={() => window.close()}>{t('updateGate.closeButton')}</button>
    </div>
  );
}

function Header({ kicker, title, subtitle }) {
  return (
    <header className="screen-header">
      <span>{kicker}</span>
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </header>
  );
}

function NetworkModeNotice({ section, network }) {
  const { t } = useTranslation();
  return (
    <section className="screen">
      <Header
        kicker={`${section === 'contracts' ? t('contracts.nav') : t('terminal.nav')} · ${network.shortName}`}
        title={t('networkMode.limitedTitle', { network: network.name })}
        subtitle={t('networkMode.limitedText')}
      />
      <div className="network-mode-panel">
        <ShieldCheck />
        <div>
          <strong>{network.name}</strong>
          <span>{t('networkMode.vaultOnlyText')}</span>
        </div>
      </div>
    </section>
  );
}

async function downloadPaperWallet(wallet, t, walletLabel = '', mode = 'full') {
  const accounts = wallet.accounts || [];
  const needsQr = mode !== 'private';
  const safeLabel = walletLabel.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '');
  const firstAccount = accounts[0] || wallet;
  const fileBase = `SWOP-paper-wallet-${mode}-${safeLabel ? `${safeLabel}-` : ''}${String(firstAccount.address || wallet.address || 'wallet').slice(0, 8)}`;
  const [logoDataUrl, qrEntries] = await Promise.all([
    assetToDataUrl(logoWhale),
    needsQr
      ? Promise.all(accounts.map(async (account) => [
        account.id,
        await QRCode.toDataURL(account.address, { margin: 1, width: 220, color: { dark: '#0D1218', light: '#F5F5DC' } })
      ]))
      : []
  ]);
  const qrById = Object.fromEntries(qrEntries);
  const svg = buildPaperWalletSvg({ wallet, accounts, qrById, logoDataUrl, t, walletLabel, mode });
  const pngBlob = await svgToPngBlob(svg, 1800, 1120);
  downloadBlob(pngBlob, `${fileBase}.png`);
  downloadTextFile(buildPaperWalletOcrText({ wallet, accounts, t, walletLabel, mode }), `${fileBase}-OCR.txt`);
}

function formatPrivateKeyLabel(account, t) {
  const format = account?.privateFormat ? ` (${account.privateFormat})` : '';
  return `${t('vault.privateKey')}${format}`;
}

async function downloadEncryptedBatch(wallets, password, network) {
  const payload = {
    app: 'SWOP',
    network: network.name,
    createdAt: new Date().toISOString(),
    wallets: wallets.map((wallet) => ({
      index: wallet.index,
      seedPhrase: wallet.seedPhrase,
      accounts: wallet.accounts.map(({ title, symbols, network: accountNetwork, address, privateKey, path, privateFormat }) => ({
        title, symbols, network: accountNetwork, address, privateKey, path, privateFormat
      }))
    }))
  };
  const fileText = await encryptVault(payload, password);
  downloadBlob(new Blob([fileText], { type: 'application/json' }), `SWOP-wallet-batch-${wallets.length}-${new Date().toISOString().slice(0, 10)}.swopvault`);
}

function downloadBatchWallets(wallets, t) {
  const lines = [
    'SWOP - SIADE WHALES OPERATIONS PLATFORM',
    t('vault.batchFileTitle'),
    new Date().toISOString(),
    'MULTI-NETWORK PAPER WALLET',
    'siadewhales.com',
    '',
    t('vault.batchFileWarning'),
    '',
    ...wallets.flatMap((wallet) => [
      `#${wallet.index}`,
      `${t('vault.seedPhrase')}: ${wallet.seedPhrase}`,
      ...wallet.accounts.flatMap((account) => [
        `${account.title} - ${account.symbols}`,
        `${t('vault.publicAddress')}: ${account.address}`,
        `${formatPrivateKeyLabel(account, t)}: ${account.privateKey}`,
        `Path: ${account.path}`
      ]),
      ''
    ])
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.download = `SWOP-wallet-batch-${wallets.length}-${new Date().toISOString().slice(0, 10)}.txt`;
  link.href = URL.createObjectURL(blob);
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function buildPaperWalletOcrText({ wallet, accounts, t, walletLabel, mode }) {
  const lines = [
    'SWOP - SIADE WHALES OPERATIONS PLATFORM',
    'siadewhales.com',
    new Date().toISOString(),
    '',
    `${t('terminal.network')}: ${wallet.networkName || accounts.map((account) => account.network).join(' / ')}`,
    `${t('vault.walletName')}: ${walletLabel.trim() || '-'}`,
    `${t('terminal.asset')}: ${mode.toUpperCase()}`,
    '',
    t('vault.paperWarning')
  ];

  for (const account of accounts) {
    lines.push(
      '',
      `--- ${account.title} ---`,
      `${t('terminal.network')}: ${account.network}`,
      `${t('terminal.asset')}: ${account.symbols}`,
      `Path: ${account.path}`
    );
    if (mode !== 'private') lines.push(`${t('vault.publicAddress')}: ${account.address}`);
    if (mode !== 'public') lines.push(`${formatPrivateKeyLabel(account, t)}: ${account.privateKey}`);
  }

  if (mode !== 'public') {
    lines.push('', `${t('vault.seedPhrase')}: ${wallet.seedPhrase || wallet.mnemonic?.phrase || ''}`);
  }

  return `${lines.join('\r\n')}\r\n`;
}

async function svgToPngBlob(svg, width, height) {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const image = await loadImage(svgUrl);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, width, height);
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('PNG export failed'));
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function downloadTextFile(text, filename) {
  downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), filename);
}

function downloadBlob(blob, filename) {
  const link = document.createElement('a');
  const href = URL.createObjectURL(blob);
  link.download = filename;
  link.href = href;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function buildPaperWalletSvg({ wallet, accounts, qrById, logoDataUrl, t, walletLabel, mode }) {
  const isPublic = mode === 'public';
  const isPrivate = mode === 'private';
  const isFull = mode === 'full';
  const title = isPublic
    ? t('vault.publicDocumentTitle')
    : isPrivate
      ? t('vault.privateDocumentTitle')
      : t('vault.fullDocumentTitle');
  const label = walletLabel.trim();
  const networkLine = accounts.map((account) => `${account.title} - ${account.symbols}`).join(' / ');
  const rows = accounts.map((account, index) => {
    const x = 120 + (index * 540);
    const y = 355;
    return renderPaperAccount({ account, qr: qrById[account.id], x, y, mode, t });
  }).join('');
  const seedPanel = !isPublic ? renderSvgPanel({
    x: 120,
    y: 860,
    width: 1560,
    height: 128,
    title: t('vault.seedPhrase'),
    value: wallet.seedPhrase || wallet.mnemonic?.phrase || '',
    danger: true,
    chunk: 92
  }) : renderSvgTextBlock(120, 884, [
    t('vault.publicDocumentHint')
  ], 'muted', 28);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1120" viewBox="0 0 1800 1120" role="img" aria-label="${escapeXml(title)}">
  <style>
    .bg{fill:#0A0A0C}.sheet{fill:#101821}.cream{fill:#F5F5DC}.muted{fill:#AEB7C2}.danger{fill:#F07D87}
    .stroke{fill:none;stroke:#F5F5DC;stroke-width:4}.inner{fill:none;stroke:#2A3038;stroke-width:2}
    .panel{fill:#0D1218;stroke:#2A3038;stroke-width:2}.panel-danger{fill:#0D1218;stroke:#C42638;stroke-width:2}
    .serif{font-family:Georgia,serif;font-weight:700}.sans{font-family:Arial,sans-serif}.mono{font-family:"Courier New",monospace}
    .label{font-family:Arial,sans-serif;font-size:18px;font-weight:700;fill:#F5F5DC}.value{font-family:"Courier New",monospace;font-size:17px;fill:#E8E8E8}
  </style>
  <rect class="bg" width="1800" height="1120"/>
  <rect class="sheet" x="36" y="36" width="1728" height="1048"/>
  <rect class="stroke" x="58" y="58" width="1684" height="1004"/>
  <rect class="inner" x="82" y="82" width="1636" height="956"/>
  <circle cx="1420" cy="660" r="280" fill="none" stroke="rgba(245,245,220,.05)" stroke-width="2"/>
  <circle cx="1330" cy="710" r="380" fill="none" stroke="rgba(245,245,220,.04)" stroke-width="2"/>
  <image href="${escapeXml(logoDataUrl)}" x="1338" y="82" width="282" height="176" opacity=".95"/>
  <image href="${escapeXml(logoDataUrl)}" x="1020" y="220" width="610" height="390" opacity=".14"/>
  <text x="120" y="170" class="cream serif" font-size="104">SWOP</text>
  <text x="120" y="222" class="cream sans" font-size="34">SIADE WHALES OPERATIONS PLATFORM</text>
  <text x="122" y="262" class="muted sans" font-size="22">${escapeXml(title).toUpperCase()}</text>
  <text x="122" y="294" class="cream sans" font-size="22" font-weight="700">siadewhales.com</text>
  <rect x="1288" y="276" width="332" height="48" rx="24" fill="none" stroke="#F5F5DC" stroke-width="2"/>
  <text x="1454" y="307" text-anchor="middle" class="cream sans" font-size="18" font-weight="700">OCR READY IMAGE</text>
  ${label ? `<rect x="690" y="288" width="520" height="46" rx="23" fill="none" stroke="#F5F5DC" stroke-width="2"/><text x="950" y="318" text-anchor="middle" class="cream sans" font-size="18" font-weight="700">${escapeXml(label.toUpperCase())}</text>` : ''}
  ${rows}
  ${seedPanel}
  <text x="120" y="1034" class="cream sans" font-size="20" font-weight="700">${new Date().toISOString().slice(0, 10)}</text>
  <text x="1210" y="1034" class="cream sans" font-size="20" font-weight="700">${escapeXml(networkLine)}</text>
  <text x="1210" y="1062" class="muted sans" font-size="18">siadewhales.com</text>
</svg>`;
}

function renderPaperAccount({ account, qr, x, y, mode, t }) {
  const isPublic = mode === 'public';
  const isPrivate = mode === 'private';
  const isFull = mode === 'full';
  const title = `${account.title} - ${account.symbols}`;
  const panels = [];
  if (!isPrivate) {
    panels.push(renderSvgPanel({
      x: x + 22,
      y: y + (isFull ? 180 : 260),
      width: 456,
      height: isFull ? 92 : 118,
      title: t('vault.publicAddress'),
      value: account.address,
      chunk: account.family === 'evm' ? 42 : 38
    }));
  }
  if (!isPublic) {
    panels.push(renderSvgPanel({
      x: x + 22,
      y: y + (isFull ? 292 : 150),
      width: 456,
      height: isFull ? 142 : 206,
      title: formatPrivateKeyLabel(account, t),
      value: account.privateKey,
      danger: true,
      chunk: 38
    }));
  }
  return `
  <g>
    <rect x="${x}" y="${y}" width="500" height="475" rx="18" class="${isPrivate ? 'panel-danger' : 'panel'}"/>
    <text x="${x + 26}" y="${y + 42}" class="cream sans" font-size="25" font-weight="700">${escapeXml(title)}</text>
    <text x="${x + 26}" y="${y + 72}" class="muted mono" font-size="15">${escapeXml(account.path)}</text>
    ${!isPrivate ? `<rect x="${x + 142}" y="${y + 92}" width="216" height="216" rx="14" fill="#F5F5DC"/><image href="${escapeXml(qr)}" x="${x + 160}" y="${y + 110}" width="180" height="180"/>` : ''}
    ${panels.join('')}
  </g>`;
}

function renderSvgPanel({ x, y, width, height, title, value, danger = false, chunk = 44 }) {
  const lines = splitForSvg(value, chunk);
  return `
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="12" class="${danger ? 'panel-danger' : 'panel'}"/>
    <text x="${x + 18}" y="${y + 32}" class="label ${danger ? 'danger' : ''}">${escapeXml(title).toUpperCase()}</text>
    ${renderSvgTextBlock(x + 18, y + 64, lines, 'value', 24)}
  `;
}

function renderSvgTextBlock(x, y, lines, className, lineHeight) {
  return lines.map((line, index) => (
    `<text x="${x}" y="${y + index * lineHeight}" class="${className}">${escapeXml(line)}</text>`
  )).join('');
}

function splitForSvg(value, chunk = 44) {
  const text = String(value || '-');
  if (text.includes(' ')) {
    const words = text.split(/\s+/);
    const lines = [];
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > chunk && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
    return lines.slice(0, 5);
  }
  const lines = [];
  for (let index = 0; index < text.length; index += chunk) lines.push(text.slice(index, index + chunk));
  return lines.slice(0, 6);
}

const assetDataUrlCache = new Map();

async function assetToDataUrl(src) {
  if (assetDataUrlCache.has(src)) return assetDataUrlCache.get(src);
  const response = await fetch(src);
  const blob = await response.blob();
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  assetDataUrlCache.set(src, dataUrl);
  return dataUrl;
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function downloadTransactionReceipt(receipt, t) {
  const page = document.createElement('canvas');
  page.width = 1800;
  page.height = 1120;
  const ctx = page.getContext('2d');
  ctx.direction = 'ltr'; // el recibo mantiene su maquetación también con la app en derecha a izquierda
  ctx.fillStyle = '#0A0A0C';
  ctx.fillRect(0, 0, page.width, page.height);
  ctx.fillStyle = '#101821';
  ctx.fillRect(36, 36, 1728, 1048);
  ctx.strokeStyle = '#F5F5DC';
  ctx.lineWidth = 4;
  ctx.strokeRect(58, 58, 1684, 1004);
  ctx.strokeStyle = '#2A3038';
  ctx.lineWidth = 2;
  ctx.strokeRect(82, 82, 1636, 956);

  const logo = await loadImage(logoWhale);
  ctx.globalAlpha = 0.18;
  ctx.drawImage(logo, 1020, 170, 640, 410);
  ctx.globalAlpha = 1;
  ctx.drawImage(logo, 1340, 82, 280, 170);

  ctx.fillStyle = '#F5F5DC';
  ctx.font = '700 92px Georgia, serif';
  ctx.fillText('SWOP', 120, 168);
  ctx.font = '500 32px Arial, sans-serif';
  ctx.fillText('SIADE WHALES OPERATIONS PLATFORM', 120, 218);
  ctx.fillStyle = '#AEB7C2';
  ctx.font = '22px Arial, sans-serif';
  ctx.fillText(t('terminal.receiptTitle').toUpperCase(), 122, 260);
  ctx.fillStyle = '#F5F5DC';
  ctx.font = '700 22px Arial, sans-serif';
  ctx.fillText('siadewhales.com', 122, 294);

  const isCompleted = receipt.status === t('terminal.completed');
  ctx.strokeStyle = isCompleted ? '#65DC9D' : '#F1C95B';
  ctx.lineWidth = 2;
  roundRect(ctx, 1200, 280, 420, 58, 29, false, true);
  ctx.fillStyle = isCompleted ? '#65DC9D' : '#F1C95B';
  ctx.font = '700 22px Arial, sans-serif';
  ctx.fillText(receipt.status.toUpperCase(), 1242, 317);

  drawReceiptRow(ctx, 120, 375, 700, t('terminal.asset'), receipt.asset);
  drawReceiptRow(ctx, 900, 375, 720, t('terminal.amount'), receipt.amount);
  drawReceiptRow(ctx, 120, 520, 1500, t('terminal.txHash'), receipt.hash);
  drawReceiptRow(ctx, 120, 665, 700, t('terminal.from'), receipt.from);
  drawReceiptRow(ctx, 900, 665, 720, t('terminal.to'), receipt.to);
  drawReceiptRow(ctx, 120, 810, 430, t('terminal.network'), receipt.network);
  drawReceiptRow(ctx, 610, 810, 390, t('terminal.blockNumber'), receipt.blockNumber || t('terminal.pending'));
  drawReceiptRow(ctx, 1060, 810, 560, t('terminal.gasCost'), receipt.gasCost ? `${receipt.gasCost} ${receipt.nativeSymbol || 'ETH'}` : '-');

  ctx.fillStyle = '#AEB7C2';
  ctx.font = '20px Arial, sans-serif';
  ctx.fillText(new Date(receipt.date).toLocaleString(), 120, 1018);
  ctx.fillText(receipt.explorerUrl || `https://etherscan.io/tx/${receipt.hash}`, 900, 1018);

  const link = document.createElement('a');
  link.download = `SWOP-transaction-${receipt.hash.slice(0, 10)}.png`;
  link.href = page.toDataURL('image/png');
  link.click();
}

function drawReceiptRow(ctx, x, y, width, title, value) {
  ctx.fillStyle = '#0D1218';
  roundRect(ctx, x, y, width, 108, 14, true, false);
  ctx.strokeStyle = '#2A3038';
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, width, 108, 14, false, true);
  ctx.fillStyle = '#F5F5DC';
  ctx.font = '700 20px Arial, sans-serif';
  ctx.fillText(String(title).toUpperCase(), x + 24, y + 36);
  drawWrapped(ctx, value || '-', x + 24, y + 72, width - 48, 28, '22px monospace');
}

function drawDataPanel(ctx, x, y, width, height, title, value, danger = false) {
  ctx.fillStyle = '#0D1218';
  roundRect(ctx, x, y, width, height, 14, true, false);
  ctx.strokeStyle = danger ? '#7A1D25' : '#2A3038';
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, width, height, 14, false, true);
  ctx.fillStyle = '#E8E8E8';
  ctx.font = '700 28px Arial, sans-serif';
  ctx.fillText(title.toUpperCase(), x + 28, y + 46);
  drawWrapped(ctx, value, x + 28, y + 88, width - 56, 34, '25px monospace');
}

function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function drawWrapped(ctx, text, x, y, maxWidth, lineHeight, font) {
  ctx.font = font;
  ctx.fillStyle = '#E8E8E8';
  const source = String(text);
  const parts = source.includes(' ') ? source.split(' ') : source.match(/.{1,36}/g) || [];
  let line = '';
  for (const part of parts) {
    const test = line ? `${line} ${part}` : part;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      line = part;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
}

createRoot(document.getElementById('root')).render(<App />);
