import { SigningKey, getBytes } from 'ethers';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { sha256 } from '@noble/hashes/sha256';
import { base58Decode, base58Encode } from './solana';

const SATS_PER_BTC = 100_000_000n;
const SIGHASH_ALL = 1;
const DUST_SATS = 546n;

export function createBitcoinWallet(privateKey, network) {
  const selected = parseBitcoinPrivateKey(privateKey, network);
  const publicKey = getBytes(SigningKey.computePublicKey(selected.privateKeyHex, true));
  const publicKeyHash = hash160(publicKey);
  const addressVersion = isBitcoinTestnet(network) ? 0x6f : 0x00;
  return {
    type: 'bitcoin',
    address: base58CheckEncode(new Uint8Array([addressVersion, ...publicKeyHash])),
    privateKey: selected.wif,
    privateKeyHex: selected.privateKeyHex,
    publicKey,
    publicKeyHex: bytesToHex(publicKey),
    publicKeyHash,
    network
  };
}

export function normalizeBitcoinPrivateKey(value, network) {
  return createBitcoinWallet(value, network).privateKey;
}

export async function getBitcoinBalance(address, network) {
  const utxos = await getBitcoinUtxos(address, network);
  return utxos.reduce((total, utxo) => total + BigInt(utxo.value || 0), 0n);
}

export async function estimateBitcoinTransferFee(wallet, to, amountSats, network) {
  const utxos = await getBitcoinUtxos(wallet.address, network);
  const feeRate = await getBitcoinFeeRate(network);
  const selected = selectBitcoinUtxos(utxos, BigInt(amountSats), feeRate);
  return selected.fee;
}

export async function sendBitcoinTransfer(wallet, to, amountSats, network) {
  const destinationScript = bitcoinAddressToScript(to, network);
  const utxos = await getBitcoinUtxos(wallet.address, network);
  const feeRate = await getBitcoinFeeRate(network);
  const selected = selectBitcoinUtxos(utxos, BigInt(amountSats), feeRate);
  const change = selected.total - BigInt(amountSats) - selected.fee;
  const outputs = [
    { value: BigInt(amountSats), script: destinationScript }
  ];
  if (change > DUST_SATS) outputs.push({ value: change, script: p2pkhScript(wallet.publicKeyHash) });
  const rawTx = signP2pkhTransaction({ inputs: selected.utxos, outputs, wallet });
  const txid = await broadcastBitcoinTransaction(rawTx, network);
  return { hash: txid };
}

export function parseBitcoin(value) {
  const text = String(value || '').trim();
  if (!/^\d+(\.\d{0,8})?$/.test(text)) throw new Error('Invalid BTC amount.');
  const [whole, fraction = ''] = text.split('.');
  return (BigInt(whole || '0') * SATS_PER_BTC) + BigInt(fraction.padEnd(8, '0'));
}

export function formatBitcoin(sats) {
  const value = BigInt(sats || 0);
  const whole = value / SATS_PER_BTC;
  const fraction = String(value % SATS_PER_BTC).padStart(8, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export async function executeBitcoinWalletConnectRequest({ request, wallet, chain }) {
  const method = request?.method;
  const params = Array.isArray(request?.params) ? request.params : [];
  if (method === 'btc_getAccounts') return [wallet.address];
  if (method === 'bip122_getAccountAddresses') return [{ address: wallet.address, publicKey: wallet.publicKeyHex }];
  if (method === 'btc_signMessage' || method === 'bip122_signMessage') return signBitcoinMessageResponse(wallet, params);
  if (method === 'btc_sendTransfer' || method === 'bip122_sendTransfer') return sendBitcoinDappTransfer(wallet, params, chain);
  if (method === 'btc_signPsbt' || method === 'bip122_signPsbt') return signBitcoinPsbtResponse(wallet, params);
  throw Object.assign(new Error(`Unsupported method: ${method}`), { code: -32601 });
}

function signBitcoinMessageResponse(wallet, params) {
  const payload = getPayload(params);
  const message = payload.message ?? params[0] ?? '';
  return {
    address: wallet.address,
    publicKey: wallet.publicKeyHex,
    signature: signBitcoinMessage(wallet, String(message))
  };
}

async function sendBitcoinDappTransfer(wallet, params, chain) {
  const payload = getPayload(params);
  const recipient = payload.recipient || payload.to || payload.address;
  const amount = payload.amountSats ?? payload.satoshis ?? payload.amount;
  const amountSats = typeof amount === 'string' && amount.includes('.') ? parseBitcoin(amount) : BigInt(amount || 0);
  const tx = await sendBitcoinTransfer(wallet, recipient, amountSats, chain);
  return { txid: tx.hash, hash: tx.hash };
}

function signBitcoinPsbtResponse(wallet, params) {
  const payload = getPayload(params);
  const psbt = payload.psbt || params[0] || '';
  const encoding = payload.encoding || (String(psbt).startsWith('70736274ff') ? 'hex' : 'base64');
  const signed = signBitcoinPsbt(wallet, decodeBinary(psbt, encoding));
  return {
    psbt: encodeBinary(signed, encoding),
    publicKey: wallet.publicKeyHex
  };
}

function parseBitcoinPrivateKey(value, network) {
  const text = String(value || '').trim();
  const testnet = isBitcoinTestnet(network);
  if (/^(0x)?[a-fA-F0-9]{64}$/.test(text)) {
    const privateKeyHex = `0x${text.replace(/^0x/i, '')}`;
    const privateVersion = testnet ? 0xef : 0x80;
    const wif = base58CheckEncode(new Uint8Array([privateVersion, ...getBytes(privateKeyHex), 0x01]));
    return { privateKeyHex, wif };
  }
  const decoded = base58CheckDecode(text);
  const expectedVersion = testnet ? 0xef : 0x80;
  if (decoded[0] !== expectedVersion) throw new Error('Bitcoin key does not belong to the selected network.');
  const compressed = decoded.length === 34 && decoded[33] === 0x01;
  if (decoded.length !== 33 && !compressed) throw new Error('Invalid Bitcoin WIF.');
  const privateBytes = decoded.slice(1, 33);
  const privateKeyHex = `0x${bytesToHex(privateBytes)}`;
  const wif = compressed ? text : base58CheckEncode(new Uint8Array([expectedVersion, ...privateBytes, 0x01]));
  return { privateKeyHex, wif };
}

async function getBitcoinUtxos(address, network) {
  const response = await fetch(`${bitcoinApiBase(network)}/address/${address}/utxo`);
  if (!response.ok) throw new Error('Could not load Bitcoin UTXOs.');
  return response.json();
}

async function getBitcoinFeeRate(network) {
  try {
    const response = await fetch(`${bitcoinApiBase(network)}/v1/fees/recommended`);
    const fees = await response.json();
    return Math.max(1, Number(fees.fastestFee || fees.halfHourFee || fees.hourFee || 5));
  } catch {
    return isBitcoinTestnet(network) ? 1 : 5;
  }
}

async function broadcastBitcoinTransaction(rawTx, network) {
  const response = await fetch(`${bitcoinApiBase(network)}/tx`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: bytesToHex(rawTx)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || 'Bitcoin broadcast failed.');
  return text.trim();
}

function selectBitcoinUtxos(utxos, amountSats, feeRate) {
  const sorted = [...utxos].sort((left, right) => Number(right.value || 0) - Number(left.value || 0));
  const selected = [];
  let total = 0n;
  for (const utxo of sorted) {
    selected.push(utxo);
    total += BigInt(utxo.value || 0);
    const fee = BigInt(Math.ceil(estimateBitcoinTxSize(selected.length, 2) * feeRate));
    if (total >= amountSats + fee) return { utxos: selected, total, fee };
  }
  throw new Error('Insufficient BTC balance.');
}

function estimateBitcoinTxSize(inputCount, outputCount) {
  return 10 + (inputCount * 148) + (outputCount * 34);
}

function signP2pkhTransaction({ inputs, outputs, wallet }) {
  const scriptCode = p2pkhScript(wallet.publicKeyHash);
  const preparedInputs = inputs.map((input) => ({
    txid: input.txid,
    vout: input.vout,
    scriptSig: new Uint8Array(),
    sequence: 0xffffffff,
    scriptCode
  }));
  const baseTx = { version: 2, inputs: preparedInputs, outputs, locktime: 0 };
  for (let index = 0; index < preparedInputs.length; index += 1) {
    const digest = signatureHashLegacy(baseTx, index, scriptCode);
    const der = signDigestDer(wallet.privateKeyHex, digest);
    preparedInputs[index].scriptSig = pushData(concatBytes(der, new Uint8Array([SIGHASH_ALL])), wallet.publicKey);
  }
  return serializeBitcoinTransaction(baseTx);
}

function signatureHashLegacy(tx, inputIndex, scriptCode) {
  const signingInputs = tx.inputs.map((input, index) => ({
    ...input,
    scriptSig: index === inputIndex ? scriptCode : new Uint8Array()
  }));
  const serialized = serializeBitcoinTransaction({ ...tx, inputs: signingInputs });
  return hash256(concatBytes(serialized, uint32Le(SIGHASH_ALL)));
}

function serializeBitcoinTransaction(tx) {
  return concatBytes(
    uint32Le(tx.version || 2),
    varInt(tx.inputs.length),
    ...tx.inputs.map(serializeInput),
    varInt(tx.outputs.length),
    ...tx.outputs.map(serializeOutput),
    uint32Le(tx.locktime || 0)
  );
}

function serializeInput(input) {
  return concatBytes(
    reverseBytes(hexToBytes(input.txid)),
    uint32Le(input.vout),
    varInt(input.scriptSig.length),
    input.scriptSig,
    uint32Le(input.sequence ?? 0xffffffff)
  );
}

function serializeOutput(output) {
  return concatBytes(
    uint64Le(output.value),
    varInt(output.script.length),
    output.script
  );
}

function bitcoinAddressToScript(address, network) {
  const text = String(address || '').trim();
  if (/^(bc1|tb1)/i.test(text)) return bech32AddressToScript(text, network);
  const decoded = base58CheckDecode(text);
  const testnet = isBitcoinTestnet(network);
  const p2pkhVersion = testnet ? 0x6f : 0x00;
  const p2shVersion = testnet ? 0xc4 : 0x05;
  const version = decoded[0];
  const hash = decoded.slice(1);
  if (hash.length !== 20) throw new Error('Invalid Bitcoin address.');
  if (version === p2pkhVersion) return p2pkhScript(hash);
  if (version === p2shVersion) return concatBytes(hexToBytes('a914'), hash, hexToBytes('87'));
  throw new Error('Bitcoin address is for another network.');
}

function bech32AddressToScript(address, network) {
  const decoded = bech32Decode(address);
  const expectedHrp = isBitcoinTestnet(network) ? 'tb' : 'bc';
  if (decoded.hrp !== expectedHrp) throw new Error('Bitcoin address is for another network.');
  const version = decoded.words[0];
  const program = convertBits(decoded.words.slice(1), 5, 8, false);
  if (version === 0 && program.length === 20) return concatBytes(new Uint8Array([0x00, 0x14]), program);
  if (version === 0 && program.length === 32) return concatBytes(new Uint8Array([0x00, 0x20]), program);
  if (version === 1 && program.length === 32) return concatBytes(new Uint8Array([0x51, 0x20]), program);
  throw new Error('Unsupported Bitcoin address type.');
}

function p2pkhScript(publicKeyHash) {
  return concatBytes(hexToBytes('76a914'), publicKeyHash, hexToBytes('88ac'));
}

function signBitcoinMessage(wallet, message) {
  const prefix = new TextEncoder().encode('Bitcoin Signed Message:\n');
  const payload = new TextEncoder().encode(message);
  const digest = hash256(concatBytes(varInt(prefix.length), prefix, varInt(payload.length), payload));
  const signature = new SigningKey(wallet.privateKeyHex).sign(digest);
  const compact = concatBytes(
    new Uint8Array([31 + Number(signature.yParity || 0)]),
    hexToBytes(signature.r.replace(/^0x/i, '')),
    hexToBytes(signature.s.replace(/^0x/i, ''))
  );
  return bytesToBase64(compact);
}

function signDigestDer(privateKeyHex, digest) {
  const signature = new SigningKey(privateKeyHex).sign(digest);
  return derEncodeSignature(hexToBytes(signature.r.replace(/^0x/i, '')), hexToBytes(signature.s.replace(/^0x/i, '')));
}

function derEncodeSignature(r, s) {
  const rValue = derInteger(r);
  const sValue = derInteger(s);
  return concatBytes(new Uint8Array([0x30, rValue.length + sValue.length]), rValue, sValue);
}

function derInteger(bytes) {
  let value = bytes;
  while (value.length > 1 && value[0] === 0) value = value.slice(1);
  if (value[0] & 0x80) value = concatBytes(new Uint8Array([0]), value);
  return concatBytes(new Uint8Array([0x02, value.length]), value);
}

function signBitcoinPsbt(wallet, psbtBytes) {
  const psbt = parsePsbt(psbtBytes);
  const unsignedTx = parseUnsignedTx(psbt.unsignedTx);
  const scriptCode = p2pkhScript(wallet.publicKeyHash);
  for (let index = 0; index < psbt.inputs.length; index += 1) {
    const inputMap = psbt.inputs[index];
    const prevScript = getPsbtInputScript(inputMap, unsignedTx.inputs[index]);
    if (!prevScript || !sameBytes(prevScript, scriptCode)) continue;
    const digest = signatureHashLegacy({ ...unsignedTx, inputs: unsignedTx.inputs.map((input) => ({ ...input, scriptSig: new Uint8Array() })) }, index, scriptCode);
    const der = signDigestDer(wallet.privateKeyHex, digest);
    inputMap.push({
      key: concatBytes(new Uint8Array([0x02]), wallet.publicKey),
      value: concatBytes(der, new Uint8Array([SIGHASH_ALL]))
    });
  }
  return serializePsbt(psbt);
}

function parsePsbt(bytes) {
  const data = new Uint8Array(bytes);
  if (bytesToHex(data.slice(0, 5)) !== '70736274ff') throw new Error('Invalid PSBT.');
  let offset = 5;
  const global = readPsbtMap(data, offset);
  offset = global.offset;
  const unsigned = global.entries.find((entry) => entry.key[0] === 0x00)?.value;
  if (!unsigned) throw new Error('PSBT unsigned transaction missing.');
  const unsignedTx = parseUnsignedTx(unsigned);
  const inputs = [];
  const outputs = [];
  for (let index = 0; index < unsignedTx.inputs.length; index += 1) {
    const map = readPsbtMap(data, offset);
    inputs.push(map.entries);
    offset = map.offset;
  }
  for (let index = 0; index < unsignedTx.outputs.length; index += 1) {
    const map = readPsbtMap(data, offset);
    outputs.push(map.entries);
    offset = map.offset;
  }
  return { global: global.entries, unsignedTx: unsigned, inputs, outputs };
}

function serializePsbt(psbt) {
  return concatBytes(
    hexToBytes('70736274ff'),
    serializePsbtMap(psbt.global),
    ...psbt.inputs.map(serializePsbtMap),
    ...psbt.outputs.map(serializePsbtMap)
  );
}

function readPsbtMap(data, offset) {
  const entries = [];
  let cursor = offset;
  while (cursor < data.length) {
    const [keyLength, keyOffset] = readVarInt(data, cursor);
    cursor = keyOffset;
    if (keyLength === 0n) return { entries, offset: cursor };
    const key = data.slice(cursor, cursor + Number(keyLength));
    cursor += Number(keyLength);
    const [valueLength, valueOffset] = readVarInt(data, cursor);
    cursor = valueOffset;
    const value = data.slice(cursor, cursor + Number(valueLength));
    cursor += Number(valueLength);
    entries.push({ key, value });
  }
  throw new Error('Invalid PSBT map.');
}

function serializePsbtMap(entries) {
  return concatBytes(
    ...entries.map((entry) => concatBytes(varInt(entry.key.length), entry.key, varInt(entry.value.length), entry.value)),
    new Uint8Array([0])
  );
}

function getPsbtInputScript(inputMap, txInput) {
  const witness = inputMap.find((entry) => entry.key[0] === 0x01)?.value;
  if (witness) {
    let cursor = 8;
    const [scriptLength, scriptOffset] = readVarInt(witness, cursor);
    cursor = scriptOffset;
    return witness.slice(cursor, cursor + Number(scriptLength));
  }
  const nonWitness = inputMap.find((entry) => entry.key[0] === 0x00)?.value;
  if (!nonWitness) return null;
  const tx = parseUnsignedTx(nonWitness);
  return tx.outputs[txInput.vout]?.script || null;
}

function parseUnsignedTx(bytes) {
  const data = new Uint8Array(bytes);
  let cursor = 0;
  const version = readUint32Le(data, cursor);
  cursor += 4;
  const inputCountResult = readVarInt(data, cursor);
  const inputCount = Number(inputCountResult[0]);
  cursor = inputCountResult[1];
  const inputs = [];
  for (let index = 0; index < inputCount; index += 1) {
    const txid = bytesToHex(reverseBytes(data.slice(cursor, cursor + 32)));
    cursor += 32;
    const vout = readUint32Le(data, cursor);
    cursor += 4;
    const scriptLengthResult = readVarInt(data, cursor);
    const scriptLength = Number(scriptLengthResult[0]);
    cursor = scriptLengthResult[1];
    const scriptSig = data.slice(cursor, cursor + scriptLength);
    cursor += scriptLength;
    const sequence = readUint32Le(data, cursor);
    cursor += 4;
    inputs.push({ txid, vout, scriptSig, sequence });
  }
  const outputCountResult = readVarInt(data, cursor);
  const outputCount = Number(outputCountResult[0]);
  cursor = outputCountResult[1];
  const outputs = [];
  for (let index = 0; index < outputCount; index += 1) {
    const value = readUint64Le(data, cursor);
    cursor += 8;
    const scriptLengthResult = readVarInt(data, cursor);
    const scriptLength = Number(scriptLengthResult[0]);
    cursor = scriptLengthResult[1];
    const script = data.slice(cursor, cursor + scriptLength);
    cursor += scriptLength;
    outputs.push({ value, script });
  }
  const locktime = readUint32Le(data, cursor);
  return { version, inputs, outputs, locktime };
}

function base58CheckEncode(payload) {
  return base58Encode(concatBytes(payload, hash256(payload).slice(0, 4)));
}

function base58CheckDecode(value) {
  const bytes = base58Decode(value);
  if (bytes.length < 5) throw new Error('Invalid base58check value.');
  const payload = bytes.slice(0, -4);
  const checksum = bytes.slice(-4);
  if (!sameBytes(hash256(payload).slice(0, 4), checksum)) throw new Error('Invalid base58check checksum.');
  return payload;
}

function bech32Decode(address) {
  const text = String(address || '').toLowerCase();
  const separator = text.lastIndexOf('1');
  if (separator < 1) throw new Error('Invalid bech32 address.');
  const hrp = text.slice(0, separator);
  const words = [...text.slice(separator + 1)].map((char) => {
    const index = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'.indexOf(char);
    if (index < 0) throw new Error('Invalid bech32 address.');
    return index;
  });
  if (words.length < 6 || !bech32VerifyChecksum(hrp, words)) throw new Error('Invalid bech32 checksum.');
  return { hrp, words: words.slice(0, -6) };
}

function bech32VerifyChecksum(hrp, words) {
  return bech32Polymod([...bech32HrpExpand(hrp), ...words]) === 1
    || bech32Polymod([...bech32HrpExpand(hrp), ...words]) === 0x2bc830a3;
}

function bech32Polymod(values) {
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const value of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (let index = 0; index < 5; index += 1) {
      if ((top >> index) & 1) chk ^= generators[index];
    }
  }
  return chk;
}

function bech32HrpExpand(hrp) {
  return [...hrp].map((char) => char.charCodeAt(0) >> 5)
    .concat([0], [...hrp].map((char) => char.charCodeAt(0) & 31));
}

function convertBits(data, from, to, pad) {
  let acc = 0;
  let bits = 0;
  const ret = [];
  const maxv = (1 << to) - 1;
  for (const value of data) {
    acc = (acc << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad && bits) ret.push((acc << (to - bits)) & maxv);
  return Uint8Array.from(ret);
}

function bitcoinApiBase(network) {
  return network?.apiBase || (isBitcoinTestnet(network) ? 'https://mempool.space/testnet/api' : 'https://mempool.space/api');
}

function isBitcoinTestnet(network) {
  return network?.mode === 'testnet' || String(network?.id || '').includes('testnet');
}

function getPayload(params) {
  const first = params?.[0];
  return first && typeof first === 'object' && !Array.isArray(first) ? first : {};
}

function pushData(...items) {
  return concatBytes(...items.map((item) => concatBytes(pushLength(item.length), item)));
}

function pushLength(length) {
  if (length < 0x4c) return new Uint8Array([length]);
  if (length <= 0xff) return new Uint8Array([0x4c, length]);
  throw new Error('Pushdata too large.');
}

function varInt(value) {
  const big = BigInt(value);
  if (big < 0xfdn) return new Uint8Array([Number(big)]);
  if (big <= 0xffffn) return concatBytes(new Uint8Array([0xfd]), uint16Le(big));
  if (big <= 0xffffffffn) return concatBytes(new Uint8Array([0xfe]), uint32Le(big));
  return concatBytes(new Uint8Array([0xff]), uint64Le(big));
}

function readVarInt(bytes, offset) {
  const prefix = bytes[offset];
  if (prefix < 0xfd) return [BigInt(prefix), offset + 1];
  if (prefix === 0xfd) return [BigInt(bytes[offset + 1] | (bytes[offset + 2] << 8)), offset + 3];
  if (prefix === 0xfe) return [BigInt(readUint32Le(bytes, offset + 1)), offset + 5];
  return [readUint64Le(bytes, offset + 1), offset + 9];
}

function uint16Le(value) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, Number(value), true);
  return bytes;
}

function uint32Le(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, Number(value), true);
  return bytes;
}

function uint64Le(value) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true);
  return bytes;
}

function readUint32Le(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

function readUint64Le(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getBigUint64(0, true);
}

function hash160(bytes) {
  return ripemd160(sha256(bytes));
}

function hash256(bytes) {
  return sha256(sha256(bytes));
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

function reverseBytes(bytes) {
  return Uint8Array.from([...bytes].reverse());
}

function sameBytes(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const clean = String(hex || '').replace(/^0x/i, '');
  const bytes = new Uint8Array(clean.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16);
  }
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

function decodeBinary(value, encoding) {
  if (encoding === 'hex') return hexToBytes(value);
  return base64ToBytes(value);
}

function encodeBinary(value, encoding) {
  if (encoding === 'hex') return bytesToHex(value);
  return bytesToBase64(value);
}
