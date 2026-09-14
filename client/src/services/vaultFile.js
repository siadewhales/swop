// Archivo cifrado para lotes de carteras. Sustituye al .txt en claro: sin la contraseña el archivo no sirve
// de nada aunque alguien lo copie. PBKDF2-SHA256 (600 000 vueltas) + AES-256-GCM, todo con WebCrypto.
// SWOP no guarda la contraseña ni puede recuperarla.

const FORMAT = 'swop-vault';
const VERSION = 1;
const ITERATIONS = 600000;
export const MIN_PASSWORD_LENGTH = 12;

function toB64(bytes) {
  let text = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(text);
}

function fromB64(text) {
  const binary = atob(String(text || ''));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function deriveKey(password, salt, iterations, usage) {
  const material = await globalThis.crypto.subtle.importKey('raw', new TextEncoder().encode(String(password).normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return globalThis.crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  );
}

export async function encryptVault(payload, password) {
  if (String(password || '').length < MIN_PASSWORD_LENGTH) throw new Error('password_too_short');
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS, 'encrypt');
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  plaintext.fill(0);
  return JSON.stringify({
    format: FORMAT,
    version: VERSION,
    createdAt: new Date().toISOString(),
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: toB64(salt) },
    cipher: { name: 'AES-GCM', iv: toB64(iv) },
    data: toB64(ciphertext)
  }, null, 2);
}

export async function decryptVault(fileText, password) {
  let file;
  try {
    file = JSON.parse(String(fileText || ''));
  } catch {
    throw new Error('invalid_file');
  }
  if (file?.format !== FORMAT || file?.version !== VERSION || file?.kdf?.name !== 'PBKDF2' || file?.cipher?.name !== 'AES-GCM') {
    throw new Error('invalid_file');
  }
  const iterations = Number(file.kdf.iterations);
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 10000000) throw new Error('invalid_file');
  try {
    const key = await deriveKey(password, fromB64(file.kdf.salt), iterations, 'decrypt');
    const plaintext = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(file.cipher.iv) }, key, fromB64(file.data));
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new Error('wrong_password');
  }
}
