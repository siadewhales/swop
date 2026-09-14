import { Core } from '@walletconnect/core';
import { WalletKit } from '@reown/walletkit';
import { buildApprovedNamespaces, getSdkError } from '@walletconnect/utils';
import { ethers } from 'ethers';
import { DEFAULT_CHAIN, EVM_CHAINS, getChainById, getNetworkById, toChainHex } from './chains';
import { executeSolanaWalletConnectRequest } from './solana';
import { executeBitcoinWalletConnectRequest } from './bitcoin';

export const WALLETCONNECT_PROJECT_ID = 'f6a8c767fbe4f3813dabe97dcb46dfc1';
export const WALLETCONNECT_RELAY_URL = 'wss://relay.walletconnect.org';
export const WALLETCONNECT_CHAIN = DEFAULT_CHAIN.caip2;
export const WALLETCONNECT_CHAIN_ID = DEFAULT_CHAIN.id;

export const WALLETCONNECT_METHODS = [
  'eth_accounts',
  'eth_requestAccounts',
  'eth_chainId',
  'net_version',
  'eth_getBalance',
  'eth_blockNumber',
  'eth_call',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_feeHistory',
  'eth_getTransactionCount',
  'personal_sign',
  'eth_signTypedData',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4',
  'eth_sendTransaction',
  'eth_signTransaction',
  'eth_sendRawTransaction',
  'wallet_switchEthereumChain',
  'wallet_addEthereumChain',
  'wallet_getPermissions',
  'wallet_requestPermissions',
  'wallet_watchAsset'
];

export const WALLETCONNECT_EVENTS = [
  'accountsChanged',
  'chainChanged',
  'connect',
  'disconnect',
  'message'
];

export const SOLANA_WALLETCONNECT_METHODS = [
  'solana_getAccounts',
  'solana_requestAccounts',
  'solana_signMessage',
  'solana_signTransaction',
  'solana_signAllTransactions',
  'solana_signAndSendTransaction'
];

export const SOLANA_WALLETCONNECT_EVENTS = [
  'accountsChanged',
  'connect',
  'disconnect'
];

export const BITCOIN_WALLETCONNECT_METHODS = [
  'btc_getAccounts',
  'btc_signMessage',
  'btc_signPsbt',
  'btc_sendTransfer',
  'bip122_getAccountAddresses',
  'bip122_signMessage',
  'bip122_signPsbt',
  'bip122_sendTransfer'
];

export const BITCOIN_WALLETCONNECT_EVENTS = [
  'accountsChanged',
  'connect',
  'disconnect'
];

let walletKit;
let walletKitPromise;

export function isWalletConnectUri(value) {
  return /^wc:[^@]+@2\?/i.test(String(value || '').trim());
}

export async function getSwopWalletKit() {
  if (walletKit) return walletKit;
  if (!walletKitPromise) {
    const core = new Core({
      projectId: WALLETCONNECT_PROJECT_ID,
      relayUrl: WALLETCONNECT_RELAY_URL,
      customStoragePrefix: `swop-runtime-${Date.now()}`
    });

    walletKitPromise = WalletKit.init({
      core,
      metadata: {
        name: 'SWOP',
        description: 'SIADE WHALES OPERATIONS PLATFORM',
        url: 'https://siadewhales.com',
        icons: ['https://siadewhales.com/favicon.ico']
      }
    }).then((client) => {
      walletKit = client;
      return client;
    });
  }
  return walletKitPromise;
}

export function getWalletConnectError(code = 'USER_REJECTED') {
  return getSdkError(code);
}

export function getWalletConnectSessions(client) {
  if (!client?.getActiveSessions) return [];
  return Object.values(client.getActiveSessions() || {});
}

export async function prepareWalletConnectRelay(client) {
  if (!client?.core?.relayer) return;
  if (!client.core.relayer.connected && !client.core.relayer.connecting) {
    await client.core.relayer.transportOpen(WALLETCONNECT_RELAY_URL);
  }
  await client.core.relayer.confirmOnlineStateOrThrow();
}

export function buildSwopApprovedNamespaces(proposal, address, chain = DEFAULT_CHAIN) {
  const selectedNetwork = getNetworkById(chain?.id || chain);
  if (selectedNetwork.type === 'solana') {
    const account = `${selectedNetwork.caip2}:${address}`;
    return buildApprovedNamespaces({
      proposal,
      supportedNamespaces: {
        solana: {
          chains: [selectedNetwork.caip2],
          methods: SOLANA_WALLETCONNECT_METHODS,
          events: SOLANA_WALLETCONNECT_EVENTS,
          accounts: [account]
        }
      }
    });
  }
  if (selectedNetwork.type === 'bitcoin') {
    const account = `${selectedNetwork.caip2}:${address}`;
    return buildApprovedNamespaces({
      proposal,
      supportedNamespaces: {
        bip122: {
          chains: [selectedNetwork.caip2],
          methods: BITCOIN_WALLETCONNECT_METHODS,
          events: BITCOIN_WALLETCONNECT_EVENTS,
          accounts: [account]
        }
      }
    });
  }

  const selected = getChainById(selectedNetwork.id);
  const account = `${selected.caip2}:${ethers.getAddress(address)}`;
  return buildApprovedNamespaces({
    proposal,
    supportedNamespaces: {
      eip155: {
        chains: [selected.caip2],
        methods: WALLETCONNECT_METHODS,
        events: WALLETCONNECT_EVENTS,
        accounts: [account]
      }
    }
  });
}

export function getWalletConnectPeer(payload) {
  return payload?.params?.proposer?.metadata
    || payload?.peer?.metadata
    || payload?.params?.requester?.metadata
    || {};
}

export function getWalletConnectRequest(event) {
  return event?.params?.request || {};
}

export function makeJsonRpcResult(id, result) {
  return { id, jsonrpc: '2.0', result };
}

export function makeJsonRpcError(id, error, fallback = 'Request rejected.') {
  const code = Number(error?.code || error?.error?.code || 5000);
  const message = error?.shortMessage || error?.reason || error?.message || error?.error?.message || fallback;
  return { id, jsonrpc: '2.0', error: { code, message } };
}

export function getWalletConnectUserMessage(error, translate) {
  const message = String(error?.shortMessage || error?.message || error || '').trim();
  if (/subscribing to .* failed/i.test(message)) {
    return translate?.('contracts.relaySubscriptionFailed') || message;
  }
  if (/no internet|no wss|websocket|network|relay/i.test(message)) {
    return translate?.('contracts.relayConnectionFailed') || message;
  }
  return message || translate?.('contracts.walletConnectUnavailable') || 'WalletConnect could not complete the connection.';
}

export async function executeWalletConnectRequest({ event, wallet, provider, chain = DEFAULT_CHAIN }) {
  const selectedNetwork = getNetworkById(chain?.id || chain);
  const request = getWalletConnectRequest(event);
  const method = request.method;
  const params = Array.isArray(request.params) ? request.params : [];

  if (!wallet) throw new Error('Wallet is not open.');
  if (selectedNetwork.type === 'solana') {
    return executeSolanaWalletConnectRequest({ request, wallet, chain: selectedNetwork });
  }
  if (selectedNetwork.type === 'bitcoin') {
    return executeBitcoinWalletConnectRequest({ request, wallet, chain: selectedNetwork });
  }

  const selected = getChainById(selectedNetwork.id);

  switch (method) {
    case 'eth_accounts':
    case 'eth_requestAccounts':
      return [wallet.address];
    case 'eth_chainId':
      return toChainHex(selected);
    case 'net_version':
      return String(selected.id);
    case 'personal_sign':
      return wallet.signMessage(getPersonalSignMessage(params));
    case 'eth_sign':
      // eth_sign firma cualquier cosa, incluida una transacción que vacíe la cartera sin que se vea qué es.
      throw Object.assign(new Error('eth_sign is disabled in SWOP for your safety. Ask the dApp to use personal_sign.'), { code: 4200 });
    case 'eth_signTypedData':
    case 'eth_signTypedData_v3':
    case 'eth_signTypedData_v4':
      return signTypedData(wallet, params, selected);
    case 'eth_sendTransaction':
      return sendWalletConnectTransaction(wallet, params, selected);
    case 'eth_signTransaction':
      return wallet.signTransaction(normalizeTransaction(params[0] || {}, wallet.address, selected));
    case 'eth_sendRawTransaction':
      return provider.broadcastTransaction(String(params[0] || '')).then((tx) => tx.hash);
    case 'wallet_switchEthereumChain':
    case 'wallet_addEthereumChain':
      return confirmSelectedChain(params, selected);
    case 'wallet_getPermissions':
      return [];
    case 'wallet_requestPermissions':
      return [{ parentCapability: 'eth_accounts' }];
    case 'wallet_watchAsset':
      return true;
    default:
      if (isReadOnlyRpc(method)) return provider.send(method, params);
      throw Object.assign(new Error(`Unsupported method: ${method}`), { code: -32601 });
  }
}

function isReadOnlyRpc(method) {
  return [
    'eth_getBalance',
    'eth_blockNumber',
    'eth_call',
    'eth_estimateGas',
    'eth_gasPrice',
    'eth_feeHistory',
    'eth_getTransactionCount'
  ].includes(method);
}

function getPersonalSignMessage(params) {
  const [first, second] = params;
  const message = ethers.isAddress(String(first || '')) ? second : first;
  return decodeMessage(message);
}

function decodeMessage(message) {
  const value = String(message || '');
  if (ethers.isHexString(value)) {
    try {
      return ethers.toUtf8String(value);
    } catch {
      return ethers.getBytes(value);
    }
  }
  return value;
}

async function signTypedData(wallet, params, chain = DEFAULT_CHAIN) {
  const selected = getChainById(chain?.id || chain);
  const typed = parseTypedData(params);
  const typedChainId = parseChainId(typed?.domain?.chainId);
  if (typedChainId && typedChainId !== selected.id) {
    throw new Error(`Typed data is for another network. Open ${selected.name} before signing.`);
  }
  const types = { ...(typed.types || {}) };
  delete types.EIP712Domain;
  return wallet.signTypedData(typed.domain || {}, types, typed.message || {});
}

function parseTypedData(params) {
  const candidate = params.find((param) => {
    if (!param) return false;
    if (typeof param === 'object') return true;
    return String(param).trim().startsWith('{');
  });
  if (!candidate) throw new Error('Typed data payload not found.');
  return typeof candidate === 'string' ? JSON.parse(candidate) : candidate;
}

async function sendWalletConnectTransaction(wallet, params, chain = DEFAULT_CHAIN) {
  const tx = await wallet.sendTransaction(normalizeTransaction(params[0] || {}, wallet.address, chain));
  return tx.hash;
}

function normalizeTransaction(raw, address, chain = DEFAULT_CHAIN) {
  const selected = getChainById(chain?.id || chain);
  const tx = { ...raw };
  if (tx.from && ethers.getAddress(tx.from) !== ethers.getAddress(address)) {
    throw new Error('The requested account does not match the open SWOP wallet.');
  }
  delete tx.from;
  if (tx.to) tx.to = ethers.getAddress(tx.to);
  if (tx.gas && !tx.gasLimit) tx.gasLimit = tx.gas;
  delete tx.gas;
  if (tx.chainId && parseChainId(tx.chainId) !== selected.id) {
    throw new Error(`SWOP is open on ${selected.name}. Change network before signing this request.`);
  }
  tx.chainId = selected.id;
  return tx;
}

function confirmSelectedChain(params, chain = DEFAULT_CHAIN) {
  const selected = getChainById(chain?.id || chain);
  const requested = parseChainId(params?.[0]?.chainId);
  if (!requested || requested === selected.id) return null;
  const supported = EVM_CHAINS.find((item) => item.id === requested);
  if (supported) {
    throw Object.assign(new Error(`Open ${supported.name} in SWOP before approving this request.`), { code: 4902 });
  }
  throw Object.assign(new Error('SWOP does not support the requested network.'), { code: 4902 });
}

function parseChainId(value) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return value;
  const text = String(value).trim().toLowerCase();
  if (text.startsWith('0x')) return Number.parseInt(text, 16);
  return Number.parseInt(text, 10);
}
