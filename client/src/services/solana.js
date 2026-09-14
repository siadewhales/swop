import { ed25519 } from '@noble/curves/ed25519';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_MAP = new Map([...BASE58_ALPHABET].map((char, index) => [char, BigInt(index)]));
const SOLANA_SYSTEM_PROGRAM = '11111111111111111111111111111111';
const LAMPORTS_PER_SOL = 1_000_000_000n;

export function createSolanaWallet(privateKey, network) {
  const keypair = normalizeSolanaPrivateKey(privateKey);
  return {
    type: 'solana',
    address: keypair.address,
    privateKey: keypair.privateKey,
    seed: keypair.seed,
    publicKey: keypair.publicKey,
    network
  };
}

export function normalizeSolanaPrivateKey(value) {
  const text = String(value || '').trim();
  if (!text) throw new Error('Invalid Solana private key.');

  let bytes;
  if (text.startsWith('[')) {
    bytes = Uint8Array.from(JSON.parse(text).map((item) => Number(item)));
  } else if (/^(0x)?[a-fA-F0-9]{64}$/.test(text) || /^(0x)?[a-fA-F0-9]{128}$/.test(text)) {
    bytes = hexToBytes(text.replace(/^0x/i, ''));
  } else {
    bytes = base58Decode(text);
  }

  if (bytes.length !== 32 && bytes.length !== 64) throw new Error('Invalid Solana private key length.');

  const seed = bytes.slice(0, 32);
  const publicKey = ed25519.getPublicKey(seed);
  const secretKey = new Uint8Array(64);
  secretKey.set(seed);
  secretKey.set(publicKey, 32);

  if (bytes.length === 64 && !sameBytes(bytes.slice(32), publicKey)) {
    throw new Error('Solana private key does not match its public key.');
  }

  return {
    address: base58Encode(publicKey),
    privateKey: base58Encode(secretKey),
    seed,
    publicKey,
    secretKey
  };
}

export async function executeSolanaWalletConnectRequest({ request, wallet, chain }) {
  const method = request?.method;
  const params = Array.isArray(request?.params) ? request.params : [];

  switch (method) {
    case 'solana_getAccounts':
    case 'solana_requestAccounts':
      return [wallet.address];
    case 'solana_signMessage':
      return signSolanaMessage(wallet, params);
    case 'solana_signTransaction':
      return signSolanaTransaction(wallet, params);
    case 'solana_signAllTransactions':
      return signSolanaAllTransactions(wallet, params);
    case 'solana_signAndSendTransaction':
      return signAndSendSolanaTransaction(wallet, params, chain);
    default:
      throw Object.assign(new Error(`Unsupported method: ${method}`), { code: -32601 });
  }
}

export async function getSolanaBalance(address, chain) {
  const result = await solanaRpc(chain, 'getBalance', [address]);
  return BigInt(result?.value || 0);
}

export function formatSolana(lamports) {
  const value = BigInt(lamports || 0);
  const whole = value / LAMPORTS_PER_SOL;
  const fraction = String(value % LAMPORTS_PER_SOL).padStart(9, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function parseSolana(value) {
  const text = String(value || '').trim();
  if (!/^\d+(\.\d{0,9})?$/.test(text)) throw new Error('Invalid SOL amount.');
  const [whole, fraction = ''] = text.split('.');
  return (BigInt(whole || '0') * LAMPORTS_PER_SOL) + BigInt(fraction.padEnd(9, '0'));
}

export async function estimateSolanaTransferFee(wallet, to, lamports, chain) {
  const message = await buildSolanaTransferMessage(wallet, to, lamports, chain);
  try {
    const result = await solanaRpc(chain, 'getFeeForMessage', [bytesToBase64(message)]);
    return BigInt(result?.value || 5000);
  } catch {
    return 5000n;
  }
}

export async function sendSolanaTransfer(wallet, to, lamports, chain) {
  const transaction = await buildSignedSolanaTransfer(wallet, to, lamports, chain);
  const signature = await sendSolanaTransaction(transaction, chain);
  return { hash: signature };
}

function signSolanaMessage(wallet, params) {
  const payload = getPayload(params);
  const message = payload?.message ?? params[0] ?? '';
  const bytes = decodePayloadBytes(message, payload?.encoding);
  const signature = ed25519.sign(bytes, wallet.seed);
  return {
    publicKey: wallet.address,
    signature: base58Encode(signature)
  };
}

function signSolanaTransaction(wallet, params) {
  const payload = getPayload(params);
  const transaction = payload?.transaction ?? params[0] ?? '';
  const encoding = payload?.encoding || detectEncoding(transaction);
  const signed = signSerializedSolanaTransaction(decodePayloadBytes(transaction, encoding), wallet);
  return {
    publicKey: wallet.address,
    signature: base58Encode(signed.signature),
    transaction: encodePayloadBytes(signed.serialized, encoding)
  };
}

function signSolanaAllTransactions(wallet, params) {
  const payload = getPayload(params);
  const transactions = payload?.transactions || params[0] || [];
  const encoding = payload?.encoding || 'base64';
  return {
    publicKey: wallet.address,
    transactions: transactions.map((transaction) => {
      const selectedEncoding = payload?.encoding || detectEncoding(transaction) || encoding;
      const signed = signSerializedSolanaTransaction(decodePayloadBytes(transaction, selectedEncoding), wallet);
      return encodePayloadBytes(signed.serialized, selectedEncoding);
    })
  };
}

async function signAndSendSolanaTransaction(wallet, params, chain) {
  const payload = getPayload(params);
  const transaction = payload?.transaction ?? params[0] ?? '';
  const encoding = payload?.encoding || detectEncoding(transaction);
  const signed = signSerializedSolanaTransaction(decodePayloadBytes(transaction, encoding), wallet);
  const signature = await sendSolanaTransaction(signed.serialized, chain);
  return {
    publicKey: wallet.address,
    signature,
    transaction: encodePayloadBytes(signed.serialized, encoding)
  };
}

function signSerializedSolanaTransaction(serialized, wallet) {
  const bytes = new Uint8Array(serialized);
  const [signatureCount, signaturesOffset] = readShortVec(bytes, 0);
  const messageOffset = signaturesOffset + (signatureCount * 64);
  if (!signatureCount || messageOffset >= bytes.length) throw new Error('Invalid Solana transaction.');

  const message = bytes.slice(messageOffset);
  const versioned = (message[0] & 0x80) !== 0;
  const headerOffset = versioned ? 1 : 0;
  const requiredSignatures = message[headerOffset];
  const [accountCount, accountKeysOffset] = readShortVec(message, headerOffset + 3);
  const searchLimit = Math.min(requiredSignatures, accountCount, signatureCount);
  let signerIndex = -1;

  for (let index = 0; index < searchLimit; index += 1) {
    const start = accountKeysOffset + (index * 32);
    const key = message.slice(start, start + 32);
    if (sameBytes(key, wallet.publicKey)) {
      signerIndex = index;
      break;
    }
  }

  if (signerIndex < 0) throw new Error('The Solana transaction does not request the open SWOP account.');

  const signature = ed25519.sign(message, wallet.seed);
  bytes.set(signature, signaturesOffset + (signerIndex * 64));
  return { serialized: bytes, signature };
}

async function sendSolanaTransaction(serialized, chain) {
  const rpcUrl = chain?.rpcUrls?.[0];
  if (!rpcUrl) throw new Error('Solana RPC is not configured.');
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'sendTransaction',
      params: [bytesToBase64(serialized), { encoding: 'base64', skipPreflight: false }]
    })
  });
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || 'Solana transaction failed.');
  return payload.result;
}

async function buildSignedSolanaTransfer(wallet, to, lamports, chain) {
  const message = await buildSolanaTransferMessage(wallet, to, lamports, chain);
  const signature = ed25519.sign(message, wallet.seed);
  return concatBytes(encodeShortVec(1), signature, message);
}

async function buildSolanaTransferMessage(wallet, to, lamports, chain) {
  const toPublicKey = parseSolanaAddress(to);
  const fromPublicKey = wallet.publicKey;
  const systemProgram = base58Decode(SOLANA_SYSTEM_PROGRAM);
  const latest = await solanaRpc(chain, 'getLatestBlockhash', [{ commitment: 'finalized' }]);
  const recentBlockhash = base58Decode(latest?.value?.blockhash);
  const transferData = concatBytes(uint32Le(2), uint64Le(lamports));
  const instruction = concatBytes(
    new Uint8Array([2]),
    encodeShortVec(2),
    new Uint8Array([0, 1]),
    encodeShortVec(transferData.length),
    transferData
  );
  return concatBytes(
    new Uint8Array([1, 0, 1]),
    encodeShortVec(3),
    fromPublicKey,
    toPublicKey,
    systemProgram,
    recentBlockhash,
    encodeShortVec(1),
    instruction
  );
}

export function parseSolanaAddress(address) {
  const bytes = base58Decode(address);
  if (bytes.length !== 32) throw new Error('Invalid Solana address.');
  return bytes;
}

async function solanaRpc(chain, method, params = []) {
  const rpcUrl = chain?.rpcUrls?.[0];
  if (!rpcUrl) throw new Error('Solana RPC is not configured.');
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
  });
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || `${method} failed.`);
  return payload.result;
}

function getPayload(params) {
  const first = params?.[0];
  return first && typeof first === 'object' && !Array.isArray(first) ? first : {};
}

function detectEncoding(value) {
  const text = String(value || '').trim();
  if (!text) return 'base64';
  if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(text) && !/[+/=]/.test(text)) return 'base58';
  return 'base64';
}

function decodePayloadBytes(value, encoding = '') {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return Uint8Array.from(value.map((item) => Number(item)));
  const selected = String(encoding || '').toLowerCase();
  const text = String(value || '').trim();
  if (selected === 'utf8' || selected === 'text') return new TextEncoder().encode(text);
  if (selected === 'base58') return base58Decode(text);
  if (selected === 'hex') return hexToBytes(text.replace(/^0x/i, ''));
  try {
    return base64ToBytes(text);
  } catch {
    return base58Decode(text);
  }
}

function encodePayloadBytes(bytes, encoding = 'base64') {
  return String(encoding || '').toLowerCase() === 'base58'
    ? base58Encode(bytes)
    : bytesToBase64(bytes);
}

function readShortVec(bytes, offset) {
  let value = 0;
  let shift = 0;
  let cursor = offset;
  while (cursor < bytes.length) {
    const byte = bytes[cursor];
    value |= (byte & 0x7f) << shift;
    cursor += 1;
    if ((byte & 0x80) === 0) return [value, cursor];
    shift += 7;
  }
  throw new Error('Invalid Solana compact length.');
}

export function base58Decode(value) {
  let result = 0n;
  for (const char of String(value || '')) {
    const digit = BASE58_MAP.get(char);
    if (digit === undefined) throw new Error('Invalid base58 value.');
    result = (result * 58n) + digit;
  }
  const bytes = [];
  while (result > 0n) {
    bytes.unshift(Number(result & 0xffn));
    result >>= 8n;
  }
  for (const char of String(value || '')) {
    if (char !== BASE58_ALPHABET[0]) break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

export function base58Encode(bytes) {
  let value = 0n;
  for (const byte of bytes) value = (value * 256n) + BigInt(byte);
  let encoded = '';
  while (value > 0n) {
    const mod = Number(value % 58n);
    encoded = BASE58_ALPHABET[mod] + encoded;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded = BASE58_ALPHABET[0] + encoded;
  }
  return encoded || BASE58_ALPHABET[0];
}

function hexToBytes(hex) {
  if (hex.length % 2) throw new Error('Invalid hex value.');
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function concatBytes(...arrays) {
  const length = arrays.reduce((total, item) => total + item.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const item of arrays) {
    result.set(item, offset);
    offset += item.length;
  }
  return result;
}

function encodeShortVec(value) {
  const bytes = [];
  let remaining = Number(value);
  while (remaining >= 0x80) {
    bytes.push((remaining & 0x7f) | 0x80);
    remaining >>= 7;
  }
  bytes.push(remaining);
  return Uint8Array.from(bytes);
}

function uint32Le(value) {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, Number(value), true);
  return bytes;
}

function uint64Le(value) {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(0, BigInt(value), true);
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function sameBytes(left, right) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}
