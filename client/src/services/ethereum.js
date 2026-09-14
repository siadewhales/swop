import { ethers } from 'ethers';
import { DEFAULT_CHAIN, getChainById, getTrustWalletTokenIconUrl } from './chains';

const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 value) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)'
];

const speedMultiplier = { slow: 80n, normal: 100n, fast: 130n };
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');
const FALLBACK_PRIORITY_FEE = 1500000000n;

export function getProvider(chain = DEFAULT_CHAIN) {
  const selected = getChainById(chain?.id || chain);
  const providers = selected.rpcUrls.map((url, index) => ({
    provider: new ethers.JsonRpcProvider(url, selected.id, { staticNetwork: true }),
    priority: index + 1,
    weight: 1,
    stallTimeout: 900
  }));
  return new ethers.FallbackProvider(providers, 1, { quorum: 1 });
}

export function normalizePrivateKey(value) {
  const trimmed = String(value || '').trim().replace(/\s+/g, '');
  const withPrefix = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(withPrefix)) {
    throw new Error('Invalid private key');
  }
  return withPrefix;
}

async function getFeeSnapshot(provider) {
  const [feeData, block] = await Promise.all([
    provider.getFeeData(),
    provider.getBlock('latest').catch(() => null)
  ]);
  return { ...feeData, lastBaseFeePerGas: block?.baseFeePerGas || null };
}

function getPriorityFee(feeData) {
  if (feeData.maxPriorityFeePerGas && feeData.maxPriorityFeePerGas > 0n) return feeData.maxPriorityFeePerGas;
  if (feeData.maxFeePerGas && feeData.lastBaseFeePerGas && feeData.maxFeePerGas > feeData.lastBaseFeePerGas) {
    return feeData.maxFeePerGas - feeData.lastBaseFeePerGas;
  }
  return FALLBACK_PRIORITY_FEE;
}

function applyGasMode(feeData, gasMode) {
  const multiplier = speedMultiplier[gasMode] || 100n;
  const priorityFee = (getPriorityFee(feeData) * multiplier) / 100n;
  const next = {};
  if (feeData.lastBaseFeePerGas) {
    next.maxPriorityFeePerGas = priorityFee;
    next.maxFeePerGas = (feeData.lastBaseFeePerGas * 2n) + priorityFee;
    return next;
  }
  if (feeData.maxFeePerGas) {
    next.maxFeePerGas = (feeData.maxFeePerGas * multiplier) / 100n;
    next.maxPriorityFeePerGas = priorityFee;
    return next;
  }
  if (!next.maxFeePerGas && feeData.gasPrice) next.gasPrice = (feeData.gasPrice * multiplier) / 100n;
  return next;
}

function formatGwei(value) {
  if (!value) return '0';
  return Number(ethers.formatUnits(value, 'gwei')).toFixed(2);
}

function tokenIconUrl(address, chain = DEFAULT_CHAIN) {
  return getTrustWalletTokenIconUrl(chain, address);
}

export async function getGasQuote(provider, chain = DEFAULT_CHAIN) {
  const selected = getChainById(chain?.id || chain);
  const feeData = await getFeeSnapshot(provider);
  const priorityFee = getPriorityFee(feeData);
  const gasPrice = feeData.gasPrice || (feeData.lastBaseFeePerGas ? feeData.lastBaseFeePerGas + priorityFee : feeData.maxFeePerGas) || 0n;
  const nativeTransfer = Number(ethers.formatEther(21000n * gasPrice)).toFixed(8);
  const tokenTransfer = Number(ethers.formatEther(65000n * gasPrice)).toFixed(8);
  return {
    nativeSymbol: selected.nativeSymbol,
    gasPrice,
    baseFee: feeData.lastBaseFeePerGas || 0n,
    priorityFee,
    gasPriceGwei: formatGwei(gasPrice),
    baseFeeGwei: formatGwei(feeData.lastBaseFeePerGas || 0n),
    priorityFeeGwei: formatGwei(priorityFee),
    nativeTransfer,
    tokenTransfer,
    ethTransferEth: nativeTransfer,
    tokenTransferEth: tokenTransfer
  };
}

async function discoverTokenContractsWithEtherscan(address, chain = DEFAULT_CHAIN) {
  if (getChainById(chain?.id || chain).id !== 1) return [];
  const url = `https://api.etherscan.io/api?module=account&action=tokentx&address=${encodeURIComponent(address)}&startblock=0&endblock=99999999&page=1&offset=10000&sort=desc`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Etherscan unavailable');
  const data = await response.json();
  if (!Array.isArray(data.result)) return [];
  const contracts = new Map();
  for (const tx of data.result) {
    if (!tx.contractAddress || !ethers.isAddress(tx.contractAddress)) continue;
    const checksummed = ethers.getAddress(tx.contractAddress);
    const key = checksummed.toLowerCase();
    if (contracts.has(key)) continue;
    contracts.set(key, {
      address: checksummed,
      name: tx.tokenName || 'ERC-20',
      symbol: tx.tokenSymbol || 'ERC20',
      decimals: Number(tx.tokenDecimal || 18),
      iconUrl: tokenIconUrl(checksummed, chain)
    });
  }
  return [...contracts.values()];
}

async function discoverTokenContractsWithEthplorer(address, chain = DEFAULT_CHAIN) {
  if (getChainById(chain?.id || chain).id !== 1) return [];
  const response = await fetch(`https://api.ethplorer.io/getAddressInfo/${encodeURIComponent(address)}?apiKey=freekey`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Ethplorer unavailable');
  const data = await response.json();
  if (!Array.isArray(data.tokens)) return [];
  const contracts = new Map();
  for (const item of data.tokens) {
    const info = item.tokenInfo || {};
    if (!info.address || !ethers.isAddress(info.address)) continue;
    const checksummed = ethers.getAddress(info.address);
    contracts.set(checksummed.toLowerCase(), {
      address: checksummed,
      name: info.name || 'ERC-20',
      symbol: info.symbol || 'ERC20',
      decimals: Number(info.decimals || 18),
      iconUrl: info.image || tokenIconUrl(checksummed, chain)
    });
  }
  return [...contracts.values()];
}

async function discoverTokenContractsWithLogs(address, provider, chain = DEFAULT_CHAIN) {
  const latest = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latest - 500000);
  const paddedAddress = ethers.zeroPadValue(address, 32);
  const [inboundLogs, outboundLogs] = await Promise.all([
    provider.getLogs({ fromBlock, toBlock: latest, topics: [TRANSFER_TOPIC, null, paddedAddress] }),
    provider.getLogs({ fromBlock, toBlock: latest, topics: [TRANSFER_TOPIC, paddedAddress, null] })
  ]);
  const logs = [...inboundLogs, ...outboundLogs].slice(-1200);
  return [...new Set(logs.map((log) => log.address.toLowerCase()))].map((tokenAddress) => ({
    address: ethers.getAddress(tokenAddress),
    name: 'ERC-20',
    symbol: 'ERC20',
    decimals: 18,
    iconUrl: tokenIconUrl(ethers.getAddress(tokenAddress), chain)
  }));
}

async function safeContractValue(promise, fallback) {
  try {
    const value = await promise;
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export async function loadTokenByAddress(tokenAddress, ownerAddress, provider, metadata = {}, chain = DEFAULT_CHAIN) {
  if (!ethers.isAddress(tokenAddress)) throw new Error('Invalid token address');
  const selected = getChainById(chain?.id || chain);
  const address = ethers.getAddress(tokenAddress);
  const contract = new ethers.Contract(address, ERC20_ABI, provider);
  const [name, symbol, decimalsResult, balance] = await Promise.all([
    safeContractValue(metadata.name ? Promise.resolve(metadata.name) : contract.name(), metadata.name || 'ERC-20'),
    safeContractValue(metadata.symbol ? Promise.resolve(metadata.symbol) : contract.symbol(), metadata.symbol || 'ERC20'),
    safeContractValue(metadata.decimals !== undefined ? Promise.resolve(metadata.decimals) : contract.decimals(), metadata.decimals ?? 18),
    contract.balanceOf(ownerAddress)
  ]);
  const decimals = Number(decimalsResult || 18);
  return {
    address,
    name: String(name || 'ERC-20'),
    symbol: String(symbol || 'ERC20'),
    decimals,
    balance: balance.toString(),
    formattedBalance: ethers.formatUnits(balance, decimals),
    chainId: selected.id,
    iconUrl: metadata.iconUrl || metadata.image || tokenIconUrl(address, selected)
  };
}

export async function detectWalletTokens(address, provider, chain = DEFAULT_CHAIN) {
  const candidates = new Map();
  for (const discover of [discoverTokenContractsWithEthplorer, discoverTokenContractsWithEtherscan, discoverTokenContractsWithLogs]) {
    try {
      const found = discover === discoverTokenContractsWithLogs
        ? await discover(address, provider, chain)
        : await discover(address, chain);
      for (const token of found) {
        candidates.set(token.address.toLowerCase(), token);
      }
    } catch {
      // A single indexer or RPC node failing should not hide the whole wallet.
    }
  }
  const tokens = [];
  for (const token of candidates.values()) {
    try {
      const loaded = await loadTokenByAddress(token.address, address, provider, token, chain);
      if (BigInt(loaded.balance) > 0n) tokens.push(loaded);
    } catch {
      // Skip contracts that do not behave like standard ERC-20 tokens.
    }
  }

  return tokens;
}

export async function estimateTransferGas({ wallet, to, amount, token, gasMode, provider, chain = DEFAULT_CHAIN }) {
  const selected = getChainById(chain?.id || chain);
  const feeData = await getFeeSnapshot(provider);
  const fees = applyGasMode(feeData, gasMode);
  let gasLimit;
  try {
    if (token) {
      const contract = new ethers.Contract(token.address, ERC20_ABI, wallet);
      gasLimit = await contract.transfer.estimateGas(to, ethers.parseUnits(amount, token.decimals));
    } else {
      gasLimit = await wallet.estimateGas({ to, value: ethers.parseEther(amount) });
    }
  } catch {
    gasLimit = token ? 65000n : 21000n;
  }
  const price = fees.maxFeePerGas || fees.gasPrice || feeData.gasPrice || feeData.maxFeePerGas || 0n;
  return `${Number(ethers.formatEther(gasLimit * price)).toFixed(8)} ${selected.nativeSymbol}`;
}

export async function estimateDefaultGasCost({ provider, gasMode, token }) {
  const feeData = await getFeeSnapshot(provider);
  const fees = applyGasMode(feeData, gasMode);
  const gasLimit = token ? 65000n : 21000n;
  const price = fees.maxFeePerGas || fees.gasPrice || feeData.gasPrice || feeData.maxFeePerGas || 0n;
  return gasLimit * price;
}

export async function sendEth({ wallet, to, amount, gasMode }) {
  const feeData = await getFeeSnapshot(wallet.provider);
  return wallet.sendTransaction({ to, value: ethers.parseEther(amount), ...applyGasMode(feeData, gasMode) });
}

export async function sendToken({ wallet, token, to, amount, gasMode }) {
  const feeData = await getFeeSnapshot(wallet.provider);
  const contract = new ethers.Contract(token.address, ERC20_ABI, wallet);
  return contract.transfer(to, ethers.parseUnits(amount, token.decimals), applyGasMode(feeData, gasMode));
}
