import { HDNodeWallet, SigningKey, Wallet, getBytes } from 'ethers';
import { ed25519 } from '@noble/curves/ed25519';
import { hmac } from '@noble/hashes/hmac';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { sha256 } from '@noble/hashes/sha256';
import { sha512 } from '@noble/hashes/sha512';
import { bytesToHex, concatBytes, utf8ToBytes } from '@noble/hashes/utils';
import { getNetworkById } from './chains';

const BTC_PATH = "m/44'/0'/0'/0/0";
const SOLANA_PATH = "m/44'/501'/0'/0'";
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function createNetworkWallet(networkValue) {
  const network = getNetworkById(networkValue);
  const evmWallet = Wallet.createRandom();
  const phrase = evmWallet.mnemonic?.phrase || '';
  const account = createAccountForNetwork(network, evmWallet, phrase);

  return {
    address: account.address,
    privateKey: account.privateKey,
    mnemonic: evmWallet.mnemonic,
    seedPhrase: phrase,
    networkId: network.id,
    networkName: network.name,
    networkType: network.type,
    accounts: [account]
  };
}

export function createNetworkWalletFromPhrase(phraseValue, networkValue) {
  const network = getNetworkById(networkValue);
  const phrase = String(phraseValue || '').trim().replace(/\s+/g, ' ');
  const evmWallet = Wallet.fromPhrase(phrase);
  const account = createAccountForNetwork(network, evmWallet, phrase);

  return {
    address: account.address,
    privateKey: account.privateKey,
    mnemonic: evmWallet.mnemonic,
    seedPhrase: phrase,
    networkId: network.id,
    networkName: network.name,
    networkType: network.type,
    accounts: [account]
  };
}

export function createNetworkWalletBatch(count, networkValue) {
  return Array.from({ length: count }, (_, index) => ({
    index: index + 1,
    ...createNetworkWallet(networkValue)
  }));
}

function createAccountForNetwork(network, evmWallet, phrase) {
  if (network.type === 'bitcoin') return deriveBitcoinWallet(phrase, network);
  if (network.type === 'solana') return deriveSolanaWallet(phrase, network);
  return {
    id: `evm-${network.id}`,
    family: 'evm',
    network: network.name,
    title: network.shortName,
    symbols: network.nativeSymbol,
    address: evmWallet.address,
    privateKey: evmWallet.privateKey,
    path: "m/44'/60'/0'/0/0"
  };
}

function deriveBitcoinWallet(phrase, network) {
  const node = HDNodeWallet.fromPhrase(phrase, undefined, BTC_PATH);
  const privateBytes = getBytes(node.privateKey);
  const publicKey = getBytes(SigningKey.computePublicKey(node.privateKey, true));
  const publicKeyHash = hash160(publicKey);
  const addressVersion = network.mode === 'testnet' ? 0x6f : 0x00;
  const privateVersion = network.mode === 'testnet' ? 0xef : 0x80;
  const address = base58Check(new Uint8Array([addressVersion, ...publicKeyHash]));
  const privateKey = base58Check(new Uint8Array([privateVersion, ...privateBytes, 0x01]));
  return {
    id: network.id,
    family: 'Bitcoin',
    network: network.name,
    title: network.shortName,
    symbols: network.nativeSymbol,
    address,
    privateKey,
    rawPrivateKey: node.privateKey,
    path: BTC_PATH,
    privateFormat: 'WIF'
  };
}

function deriveSolanaWallet(phrase, network) {
  const seed = mnemonicToSeed(phrase);
  const key = deriveSlip10Ed25519(seed, SOLANA_PATH);
  const publicKey = ed25519.getPublicKey(key);
  const secretKey = concatBytes(key, publicKey);
  return {
    id: network.id,
    family: 'Solana',
    network: network.name,
    title: network.shortName,
    symbols: network.nativeSymbol,
    address: base58Encode(publicKey),
    privateKey: base58Encode(secretKey),
    rawPrivateKey: bytesToHex(key),
    path: SOLANA_PATH,
    privateFormat: 'Base58'
  };
}

function mnemonicToSeed(phrase) {
  const password = utf8ToBytes(String(phrase || '').normalize('NFKD'));
  const salt = utf8ToBytes('mnemonic');
  return pbkdf2(sha512, password, salt, { c: 2048, dkLen: 64 });
}

function deriveSlip10Ed25519(seed, path) {
  let digest = hmac(sha512, utf8ToBytes('ed25519 seed'), seed);
  let key = digest.slice(0, 32);
  let chainCode = digest.slice(32);

  for (const index of parseHardenedPath(path)) {
    const data = concatBytes(new Uint8Array([0]), key, uint32Be(index));
    digest = hmac(sha512, chainCode, data);
    key = digest.slice(0, 32);
    chainCode = digest.slice(32);
  }
  return key;
}

function parseHardenedPath(path) {
  return String(path || '')
    .split('/')
    .slice(1)
    .map((part) => {
      const hardened = part.endsWith("'");
      if (!hardened) throw new Error('Solana derivation requires hardened path segments.');
      return Number.parseInt(part.slice(0, -1), 10) + 0x80000000;
    });
}

function uint32Be(value) {
  const result = new Uint8Array(4);
  result[0] = (value >>> 24) & 0xff;
  result[1] = (value >>> 16) & 0xff;
  result[2] = (value >>> 8) & 0xff;
  result[3] = value & 0xff;
  return result;
}

function hash160(bytes) {
  return ripemd160(sha256(bytes));
}

function base58Check(payload) {
  const checksum = sha256(sha256(payload)).slice(0, 4);
  return base58Encode(concatBytes(payload, checksum));
}

function base58Encode(bytes) {
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
