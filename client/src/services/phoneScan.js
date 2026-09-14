// SWOP Scan con el navegador del móvil, cifrado de extremo a extremo.
// SWOP crea una sala y una clave AES-256 y las mete en el QR: https://siadewhales.com/scan#v1.<sala>.<clave>.
// El navegador nunca envía al servidor lo que va tras el #, así que siadewhales.com solo reenvía sobres cifrados.
// No hace falta instalar nada en el móvil: sirve cualquier teléfono o tableta con cámara, navegador e internet.

export const SCAN_RELAY_BASE = 'https://siadewhales.com';
const PHONE_ALIVE_MS = 12000;          // el móvil manda "hello" cada 4 s
const SESSION_IDLE_MS = 20 * 60 * 1000;
const MSG_MAX_AGE_MS = 5 * 60 * 1000;
const POLL_MS = 1000;

function toB64u(bytes) {
  let text = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64u(text) {
  const b64 = String(text).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function createPhoneScan({ base = SCAN_RELAY_BASE, fetchImpl } = {}) {
  const doFetch = fetchImpl || ((...args) => globalThis.fetch(...args));
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const resultListeners = new Set();
  const cancelListeners = new Set();
  let session = null;

  const aad = (room, box) => encoder.encode(`swop-scan-v1|${room}|${box}`);

  function newSession() {
    const room = toB64u(globalThis.crypto.getRandomValues(new Uint8Array(16)));
    const keyBytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const current = {
      room,
      url: `${base}/scan#v1.${room}.${toB64u(keyBytes)}`,
      key: null,
      after: 0,
      lastPhone: 0,
      lastActivity: Date.now(),
      request: null,
      timer: null,
      closed: false
    };
    current.ready = globalThis.crypto.subtle
      .importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
      .then((key) => { current.key = key; keyBytes.fill(0); });
    session = current;
    current.ready.then(() => schedulePoll(current, 0));
    return current;
  }

  async function seal(current, box, payload) {
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const plaintext = encoder.encode(JSON.stringify({ ...payload, at: Date.now() }));
    const ciphertext = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(current.room, box) }, current.key, plaintext));
    const envelope = new Uint8Array(iv.length + ciphertext.length);
    envelope.set(iv);
    envelope.set(ciphertext, iv.length);
    return toB64u(envelope);
  }

  async function unseal(current, box, envelope) {
    const raw = fromB64u(envelope);
    const plaintext = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12), additionalData: aad(current.room, box) }, current.key, raw.slice(12));
    return JSON.parse(decoder.decode(plaintext));
  }

  async function post(current, payload) {
    await current.ready;
    const c = await seal(current, 'p', payload);
    const response = await doFetch(`${base}/api/scan-relay/${current.room}/p`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ c }),
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`SWOP Scan relay error ${response.status}`);
  }

  function schedulePoll(current, delay = POLL_MS) {
    if (current.closed) return;
    current.timer = setTimeout(() => poll(current), delay);
  }

  async function poll(current) {
    if (current.closed || session !== current) return;
    try {
      const response = await doFetch(`${base}/api/scan-relay/${current.room}/d?after=${current.after}`, { cache: 'no-store' });
      if (response.ok) {
        const body = await response.json();
        for (const message of body.msgs || []) {
          current.after = Math.max(current.after, Number(message.n) || 0);
          let payload;
          try {
            payload = await unseal(current, 'd', message.c);
          } catch {
            continue;                                   // sobre ajeno o manipulado: se descarta
          }
          if (!payload || Date.now() - Number(payload.at || 0) > MSG_MAX_AGE_MS) continue;
          handle(current, payload);
        }
        current.after = Math.max(current.after, Number(body.last) || 0);
      }
    } catch {
      // Sin conexión: el estado "conectado" caduca solo y se reintenta en el siguiente ciclo.
    }
    if (Date.now() - current.lastActivity > SESSION_IDLE_MS) {
      close();
      return;
    }
    schedulePoll(current);
  }

  function handle(current, payload) {
    if (payload.t === 'hello') {
      current.lastPhone = Date.now();
      return;
    }
    current.lastPhone = Date.now();
    current.lastActivity = Date.now();
    const request = current.request;
    if (!request || payload.id !== request.id) return;
    if (payload.t === 'result') {
      current.request = null;
      const result = { target: request.target, value: String(payload.value || ''), receivedAt: Date.now() };
      post(current, { t: 'ack', id: request.id }).catch(() => {});
      resultListeners.forEach((listener) => {
        try { listener(result); } catch { /* un oyente roto no debe tumbar a los demás */ }
      });
    } else if (payload.t === 'cancel') {
      current.request = null;
      cancelListeners.forEach((listener) => {
        try { listener({ target: request.target }); } catch { /* idem */ }
      });
    }
  }

  function state() {
    if (!session) return { ok: false };
    return {
      ok: true,
      url: session.url,
      connected: Date.now() - session.lastPhone < PHONE_ALIVE_MS,
      request: session.request ? { target: session.request.target, label: session.request.label } : null
    };
  }

  async function ensureSession() {
    if (!session || session.closed) newSession();
    await session.ready;
    return state();
  }

  async function request({ target, label }) {
    const current = session && !session.closed ? session : newSession();
    await current.ready;
    const id = globalThis.crypto.randomUUID();
    current.request = { id, target: String(target || ''), label: String(label || '') };
    current.lastActivity = Date.now();
    await post(current, { t: 'request', id, target: current.request.target, label: current.request.label });
    return state();
  }

  function close() {
    const current = session;
    if (!current) return;
    session = null;
    current.closed = true;
    clearTimeout(current.timer);
    if (current.key) post(current, { t: 'bye' }).catch(() => {});
  }

  return {
    ensureSession,
    request,
    state,
    close,
    onResult(listener) {
      resultListeners.add(listener);
      return () => resultListeners.delete(listener);
    },
    onCancel(listener) {
      cancelListeners.add(listener);
      return () => cancelListeners.delete(listener);
    }
  };
}

export const phoneScan = createPhoneScan();
