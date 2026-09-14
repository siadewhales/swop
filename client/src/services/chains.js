export const EVM_CHAINS = [
  {
    id: 1,
    type: 'evm',
    caip2: 'eip155:1',
    name: 'Ethereum Mainnet',
    shortName: 'Ethereum',
    mode: 'mainnet',
    nativeSymbol: 'ETH',
    nativeName: 'Ethereum',
    trustWalletSlug: 'ethereum',
    explorerTx: 'https://etherscan.io/tx/',
    rpcUrls: [
      'https://eth.llamarpc.com',
      'https://ethereum.publicnode.com',
      'https://rpc.ankr.com/eth',
      'https://cloudflare-eth.com',
      'https://1rpc.io/eth'
    ]
  },
  {
    id: 56,
    type: 'evm',
    caip2: 'eip155:56',
    name: 'BNB Smart Chain',
    shortName: 'BNB Chain',
    mode: 'mainnet',
    nativeSymbol: 'BNB',
    nativeName: 'BNB',
    trustWalletSlug: 'smartchain',
    explorerTx: 'https://bscscan.com/tx/',
    rpcUrls: [
      'https://bsc-dataseed.binance.org',
      'https://bsc.publicnode.com',
      'https://rpc.ankr.com/bsc',
      'https://1rpc.io/bnb'
    ]
  },
  {
    id: 137,
    type: 'evm',
    caip2: 'eip155:137',
    name: 'Polygon PoS',
    shortName: 'Polygon',
    mode: 'mainnet',
    nativeSymbol: 'POL',
    nativeName: 'Polygon',
    trustWalletSlug: 'polygon',
    explorerTx: 'https://polygonscan.com/tx/',
    rpcUrls: [
      'https://polygon-rpc.com',
      'https://polygon-bor-rpc.publicnode.com',
      'https://rpc.ankr.com/polygon',
      'https://1rpc.io/matic'
    ]
  },
  {
    id: 8453,
    type: 'evm',
    caip2: 'eip155:8453',
    name: 'Base',
    shortName: 'Base',
    mode: 'mainnet',
    nativeSymbol: 'ETH',
    nativeName: 'Ethereum',
    trustWalletSlug: 'base',
    explorerTx: 'https://basescan.org/tx/',
    rpcUrls: [
      'https://mainnet.base.org',
      'https://base.llamarpc.com',
      'https://base-rpc.publicnode.com'
    ]
  },
  {
    id: 42161,
    type: 'evm',
    caip2: 'eip155:42161',
    name: 'Arbitrum One',
    shortName: 'Arbitrum',
    mode: 'mainnet',
    nativeSymbol: 'ETH',
    nativeName: 'Ethereum',
    trustWalletSlug: 'arbitrum',
    explorerTx: 'https://arbiscan.io/tx/',
    rpcUrls: [
      'https://arb1.arbitrum.io/rpc',
      'https://arbitrum.llamarpc.com',
      'https://arbitrum-one-rpc.publicnode.com'
    ]
  },
  {
    id: 10,
    type: 'evm',
    caip2: 'eip155:10',
    name: 'OP Mainnet',
    shortName: 'Optimism',
    mode: 'mainnet',
    nativeSymbol: 'ETH',
    nativeName: 'Ethereum',
    trustWalletSlug: 'optimism',
    explorerTx: 'https://optimistic.etherscan.io/tx/',
    rpcUrls: [
      'https://mainnet.optimism.io',
      'https://optimism.llamarpc.com',
      'https://optimism-rpc.publicnode.com'
    ]
  },
  {
    id: 43114,
    type: 'evm',
    caip2: 'eip155:43114',
    name: 'Avalanche C-Chain',
    shortName: 'Avalanche',
    mode: 'mainnet',
    nativeSymbol: 'AVAX',
    nativeName: 'Avalanche',
    trustWalletSlug: 'avalanchec',
    explorerTx: 'https://snowtrace.io/tx/',
    rpcUrls: [
      'https://api.avax.network/ext/bc/C/rpc',
      'https://avalanche-c-chain-rpc.publicnode.com',
      'https://rpc.ankr.com/avalanche'
    ]
  },
  {
    id: 100,
    type: 'evm',
    mode: 'mainnet',
    caip2: 'eip155:100',
    name: 'Gnosis Chain',
    shortName: 'Gnosis',
    nativeSymbol: 'xDAI',
    nativeName: 'xDAI',
    trustWalletSlug: 'xdai',
    explorerTx: 'https://gnosisscan.io/tx/',
    rpcUrls: [
      'https://rpc.gnosischain.com',
      'https://gnosis.publicnode.com',
      'https://rpc.ankr.com/gnosis'
    ]
  },
  {
    id: 250,
    type: 'evm',
    mode: 'mainnet',
    caip2: 'eip155:250',
    name: 'Fantom Opera',
    shortName: 'Fantom',
    nativeSymbol: 'FTM',
    nativeName: 'Fantom',
    trustWalletSlug: 'fantom',
    explorerTx: 'https://ftmscan.com/tx/',
    rpcUrls: [
      'https://rpc.ftm.tools',
      'https://fantom.publicnode.com',
      'https://rpc.ankr.com/fantom'
    ]
  },
  {
    id: 42220,
    type: 'evm',
    mode: 'mainnet',
    caip2: 'eip155:42220',
    name: 'Celo Mainnet',
    shortName: 'Celo',
    nativeSymbol: 'CELO',
    nativeName: 'Celo',
    trustWalletSlug: 'celo',
    explorerTx: 'https://celoscan.io/tx/',
    rpcUrls: [
      'https://forno.celo.org',
      'https://celo.drpc.org',
      'https://rpc.ankr.com/celo'
    ]
  },
  {
    id: 59144,
    type: 'evm',
    mode: 'mainnet',
    caip2: 'eip155:59144',
    name: 'Linea',
    shortName: 'Linea',
    nativeSymbol: 'ETH',
    nativeName: 'Ethereum',
    trustWalletSlug: 'linea',
    explorerTx: 'https://lineascan.build/tx/',
    rpcUrls: [
      'https://rpc.linea.build',
      'https://linea.drpc.org',
      'https://1rpc.io/linea'
    ]
  },
  {
    id: 534352,
    type: 'evm',
    mode: 'mainnet',
    caip2: 'eip155:534352',
    name: 'Scroll',
    shortName: 'Scroll',
    nativeSymbol: 'ETH',
    nativeName: 'Ethereum',
    trustWalletSlug: 'scroll',
    explorerTx: 'https://scrollscan.com/tx/',
    rpcUrls: [
      'https://rpc.scroll.io',
      'https://scroll.drpc.org',
      'https://1rpc.io/scroll'
    ]
  },
  {
    id: 81457,
    type: 'evm',
    mode: 'mainnet',
    caip2: 'eip155:81457',
    name: 'Blast',
    shortName: 'Blast',
    nativeSymbol: 'ETH',
    nativeName: 'Ethereum',
    trustWalletSlug: 'blast',
    explorerTx: 'https://blastscan.io/tx/',
    rpcUrls: [
      'https://rpc.blast.io',
      'https://blast.drpc.org'
    ]
  },
  {
    id: 5000,
    type: 'evm',
    mode: 'mainnet',
    caip2: 'eip155:5000',
    name: 'Mantle',
    shortName: 'Mantle',
    nativeSymbol: 'MNT',
    nativeName: 'Mantle',
    trustWalletSlug: 'mantle',
    explorerTx: 'https://mantlescan.xyz/tx/',
    rpcUrls: [
      'https://rpc.mantle.xyz',
      'https://mantle.publicnode.com'
    ]
  },
  {
    id: 25,
    type: 'evm',
    mode: 'mainnet',
    caip2: 'eip155:25',
    name: 'Cronos',
    shortName: 'Cronos',
    nativeSymbol: 'CRO',
    nativeName: 'Cronos',
    trustWalletSlug: 'cronos',
    explorerTx: 'https://cronoscan.com/tx/',
    rpcUrls: [
      'https://evm.cronos.org',
      'https://cronos-evm-rpc.publicnode.com'
    ]
  },
  {
    id: 1284,
    type: 'evm',
    mode: 'mainnet',
    caip2: 'eip155:1284',
    name: 'Moonbeam',
    shortName: 'Moonbeam',
    nativeSymbol: 'GLMR',
    nativeName: 'Moonbeam',
    trustWalletSlug: 'moonbeam',
    explorerTx: 'https://moonscan.io/tx/',
    rpcUrls: [
      'https://rpc.api.moonbeam.network',
      'https://moonbeam.publicnode.com'
    ]
  },
  {
    id: 11155111,
    type: 'evm',
    mode: 'testnet',
    caip2: 'eip155:11155111',
    name: 'Ethereum Sepolia',
    shortName: 'Sepolia',
    nativeSymbol: 'ETH',
    nativeName: 'Sepolia ETH',
    trustWalletSlug: 'ethereum',
    explorerTx: 'https://sepolia.etherscan.io/tx/',
    rpcUrls: [
      'https://ethereum-sepolia.publicnode.com',
      'https://rpc.sepolia.org',
      'https://sepolia.drpc.org'
    ]
  },
  {
    id: 97,
    type: 'evm',
    mode: 'testnet',
    caip2: 'eip155:97',
    name: 'BNB Smart Chain Testnet',
    shortName: 'BNB Testnet',
    nativeSymbol: 'tBNB',
    nativeName: 'Test BNB',
    trustWalletSlug: 'smartchain',
    explorerTx: 'https://testnet.bscscan.com/tx/',
    rpcUrls: [
      'https://data-seed-prebsc-1-s1.binance.org:8545',
      'https://bsc-testnet.publicnode.com',
      'https://bsc-testnet-rpc.publicnode.com'
    ]
  },
  {
    id: 80002,
    type: 'evm',
    mode: 'testnet',
    caip2: 'eip155:80002',
    name: 'Polygon Amoy',
    shortName: 'Amoy',
    nativeSymbol: 'POL',
    nativeName: 'Test POL',
    trustWalletSlug: 'polygon',
    explorerTx: 'https://amoy.polygonscan.com/tx/',
    rpcUrls: [
      'https://rpc-amoy.polygon.technology',
      'https://polygon-amoy-bor-rpc.publicnode.com'
    ]
  },
  {
    id: 84532,
    type: 'evm',
    mode: 'testnet',
    caip2: 'eip155:84532',
    name: 'Base Sepolia',
    shortName: 'Base Sepolia',
    nativeSymbol: 'ETH',
    nativeName: 'Sepolia ETH',
    trustWalletSlug: 'base',
    explorerTx: 'https://sepolia.basescan.org/tx/',
    rpcUrls: [
      'https://sepolia.base.org',
      'https://base-sepolia-rpc.publicnode.com'
    ]
  },
  {
    id: 421614,
    type: 'evm',
    mode: 'testnet',
    caip2: 'eip155:421614',
    name: 'Arbitrum Sepolia',
    shortName: 'Arbitrum Sepolia',
    nativeSymbol: 'ETH',
    nativeName: 'Sepolia ETH',
    trustWalletSlug: 'arbitrum',
    explorerTx: 'https://sepolia.arbiscan.io/tx/',
    rpcUrls: [
      'https://sepolia-rollup.arbitrum.io/rpc',
      'https://arbitrum-sepolia-rpc.publicnode.com'
    ]
  },
  {
    id: 11155420,
    type: 'evm',
    mode: 'testnet',
    caip2: 'eip155:11155420',
    name: 'OP Sepolia',
    shortName: 'OP Sepolia',
    nativeSymbol: 'ETH',
    nativeName: 'Sepolia ETH',
    trustWalletSlug: 'optimism',
    explorerTx: 'https://sepolia-optimism.etherscan.io/tx/',
    rpcUrls: [
      'https://sepolia.optimism.io',
      'https://optimism-sepolia-rpc.publicnode.com'
    ]
  },
  {
    id: 43113,
    type: 'evm',
    mode: 'testnet',
    caip2: 'eip155:43113',
    name: 'Avalanche Fuji',
    shortName: 'Fuji',
    nativeSymbol: 'AVAX',
    nativeName: 'Test AVAX',
    trustWalletSlug: 'avalanchec',
    explorerTx: 'https://testnet.snowtrace.io/tx/',
    rpcUrls: [
      'https://api.avax-test.network/ext/bc/C/rpc',
      'https://avalanche-fuji-c-chain-rpc.publicnode.com'
    ]
  },
  {
    id: 59141,
    type: 'evm',
    mode: 'testnet',
    caip2: 'eip155:59141',
    name: 'Linea Sepolia',
    shortName: 'Linea Sepolia',
    nativeSymbol: 'ETH',
    nativeName: 'Sepolia ETH',
    trustWalletSlug: 'linea',
    explorerTx: 'https://sepolia.lineascan.build/tx/',
    rpcUrls: [
      'https://rpc.sepolia.linea.build',
      'https://linea-sepolia-rpc.publicnode.com'
    ]
  },
  {
    id: 534351,
    type: 'evm',
    mode: 'testnet',
    caip2: 'eip155:534351',
    name: 'Scroll Sepolia',
    shortName: 'Scroll Sepolia',
    nativeSymbol: 'ETH',
    nativeName: 'Sepolia ETH',
    trustWalletSlug: 'scroll',
    explorerTx: 'https://sepolia.scrollscan.com/tx/',
    rpcUrls: [
      'https://sepolia-rpc.scroll.io',
      'https://scroll-sepolia.drpc.org'
    ]
  },
  {
    id: 5003,
    type: 'evm',
    mode: 'testnet',
    caip2: 'eip155:5003',
    name: 'Mantle Sepolia',
    shortName: 'Mantle Sepolia',
    nativeSymbol: 'MNT',
    nativeName: 'Test Mantle',
    trustWalletSlug: 'mantle',
    explorerTx: 'https://sepolia.mantlescan.xyz/tx/',
    rpcUrls: [
      'https://rpc.sepolia.mantle.xyz',
      'https://mantle-sepolia.drpc.org'
    ]
  },
  {
    id: 338,
    type: 'evm',
    mode: 'testnet',
    caip2: 'eip155:338',
    name: 'Cronos Testnet',
    shortName: 'Cronos Testnet',
    nativeSymbol: 'tCRO',
    nativeName: 'Test Cronos',
    trustWalletSlug: 'cronos',
    explorerTx: 'https://cronos.org/explorer/testnet3/tx/',
    rpcUrls: [
      'https://evm-t3.cronos.org'
    ]
  },
  {
    id: 1287,
    type: 'evm',
    mode: 'testnet',
    caip2: 'eip155:1287',
    name: 'Moonbase Alpha',
    shortName: 'Moonbase',
    nativeSymbol: 'DEV',
    nativeName: 'Moonbase DEV',
    trustWalletSlug: 'moonbeam',
    explorerTx: 'https://moonbase.moonscan.io/tx/',
    rpcUrls: [
      'https://rpc.api.moonbase.moonbeam.network',
      'https://moonbase-alpha.publicnode.com'
    ]
  }
];

export const NON_EVM_NETWORKS = [
  {
    id: 'bitcoin',
    type: 'bitcoin',
    mode: 'mainnet',
    caip2: 'bip122:000000000019d6689c085ae165831e93',
    name: 'Bitcoin',
    shortName: 'Bitcoin',
    nativeSymbol: 'BTC',
    nativeName: 'Bitcoin',
    addressLabel: 'Bitcoin address',
    explorerTx: 'https://mempool.space/tx/',
    apiBase: 'https://mempool.space/api'
  },
  {
    id: 'solana',
    type: 'solana',
    mode: 'mainnet',
    caip2: 'solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ',
    name: 'Solana',
    shortName: 'Solana',
    nativeSymbol: 'SOL',
    nativeName: 'Solana',
    addressLabel: 'Solana address',
    explorerTx: 'https://solscan.io/tx/',
    rpcUrls: [
      'https://api.mainnet-beta.solana.com'
    ]
  },
  {
    id: 'bitcoin-testnet',
    type: 'bitcoin',
    mode: 'testnet',
    caip2: 'bip122:000000000933ea01ad0ee984209779ba',
    name: 'Bitcoin Testnet',
    shortName: 'Bitcoin Testnet',
    nativeSymbol: 'tBTC',
    nativeName: 'Test Bitcoin',
    addressLabel: 'Bitcoin testnet address',
    explorerTx: 'https://mempool.space/testnet/tx/',
    apiBase: 'https://mempool.space/testnet/api'
  },
  {
    id: 'solana-devnet',
    type: 'solana',
    mode: 'testnet',
    caip2: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
    name: 'Solana Devnet',
    shortName: 'Solana Devnet',
    nativeSymbol: 'SOL',
    nativeName: 'Devnet SOL',
    addressLabel: 'Solana devnet address',
    explorerTx: 'https://solscan.io/tx/',
    explorerQuery: '?cluster=devnet',
    rpcUrls: [
      'https://api.devnet.solana.com'
    ]
  }
];

export const APP_NETWORKS = [...EVM_CHAINS, ...NON_EVM_NETWORKS];
export const NETWORK_MODES = ['mainnet', 'testnet'];
export const NETWORKS_BY_MODE = {
  mainnet: APP_NETWORKS.filter((network) => network.mode !== 'testnet'),
  testnet: APP_NETWORKS.filter((network) => network.mode === 'testnet')
};
export const DEFAULT_CHAIN_ID = 1;
export const DEFAULT_CHAIN = EVM_CHAINS.find((chain) => chain.id === DEFAULT_CHAIN_ID);
export const DEFAULT_NETWORK_ID = DEFAULT_CHAIN_ID;
export const NATIVE_ASSET_ID = 'NATIVE';

export function getChainById(value) {
  const id = Number(value);
  return EVM_CHAINS.find((chain) => chain.id === id) || DEFAULT_CHAIN;
}

export function getNetworkById(value) {
  const key = String(value?.id ?? value);
  return APP_NETWORKS.find((network) => String(network.id) === key) || DEFAULT_CHAIN;
}

export function getNetworksByMode(mode = 'mainnet') {
  return NETWORKS_BY_MODE[mode] || NETWORKS_BY_MODE.mainnet;
}

export function isEvmNetwork(value) {
  return getNetworkById(value).type === 'evm';
}

export function toChainHex(chain) {
  return `0x${getChainById(chain?.id || chain).id.toString(16)}`;
}

export function getExplorerTxUrl(chain, hash) {
  const selected = getChainById(chain?.id || chain);
  return `${selected.explorerTx}${hash}`;
}

export function getTrustWalletTokenIconUrl(chain, address) {
  const selected = getChainById(chain?.id || chain);
  return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${selected.trustWalletSlug}/assets/${address}/logo.png`;
}
