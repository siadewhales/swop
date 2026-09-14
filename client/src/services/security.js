const confirmedBadAddresses = new Set([
  '0x0000000000000000000000000000000000000000'
]);

const trustedMainnetAddresses = new Map([
  ['0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', 'Wrapped Ether'],
  ['0xdac17f958d2ee523a2206206994597c13d831ec7', 'Tether USD'],
  ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 'USD Coin'],
  ['0x6b175474e89094c44da98b954eedeac495271d0f', 'Dai Stablecoin'],
  ['0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', 'Uniswap'],
  ['0x514910771af9ca656af840dff83e8264ecf986ca', 'Chainlink'],
  ['0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9', 'Aave'],
  ['0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce', 'Shiba Inu'],
  ['0x6982508145454ce325ddbe47a25d4ec3d2311933', 'Pepe']
]);

const maliciousNamePatterns = [
  /\bFAKE\b/i,
  /\bSCAM\b/i,
  /\bDRAIN(ER)?\b/i,
  /\bCLAIM\b/i,
  /\bAIRDROP\b/i,
  /\bREWARD(S)?\b/i,
  /\bBONUS\b/i,
  /\bVOUCHER\b/i,
  /\bTRUMP\s*STAR\b/i,
  /\bAI\s*CHAIN\s*COIN\b/i,
  /\bETHEREUM\s*GAMES?\b/i,
  /https?:\/\//i,
  /\bwww\./i,
  /\.(com|net|org|xyz|top|vip)\b/i
];

const suspiciousNamePatterns = [
  /\bVISIT\b/i,
  /\bGO\s*TO\b/i,
  /\bCONNECT\b/i,
  /\bAPPROVE\b/i,
  /\bBONK\b/i,
  /\bELON\b/i,
  /\bTRUMP\b/i,
  /\bMUSK\b/i,
  /\bGAMES?\b/i,
  /\bAI\b/i,
  /\bSTAR\b/i
];

function textFor(token) {
  return `${token.name || ''} ${token.symbol || ''}`.replace(/\s+/g, ' ').trim();
}

async function checkHoneypot(address, chainId = 1) {
  const response = await fetch(`https://api.honeypot.is/v2/IsHoneypot?address=${encodeURIComponent(address)}&chainID=${encodeURIComponent(chainId)}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Honeypot unavailable');
  return response.json();
}

function hasPattern(patterns, value) {
  return patterns.some((pattern) => pattern.test(value));
}

export async function analyzeTokenRisk(token, chain) {
  const address = token.address?.toLowerCase();
  const chainId = Number(token.chainId || chain?.id || 1);
  const label = textFor(token);

  if (confirmedBadAddresses.has(address)) {
    return { level: 'malware', details: 'Contrato incluido en lista negra local confirmada.' };
  }

  if (hasPattern(maliciousNamePatterns, label)) {
    return { level: 'malware', details: 'Nombre o simbolo con patron frecuente de token malicioso.' };
  }

  try {
    const report = await checkHoneypot(address, chainId);
    if (report?.honeypotResult?.isHoneypot || report?.summary?.risk === 'high') {
      return { level: 'malware', details: report?.honeypotResult?.honeypotReason || 'Honeypot o riesgo alto detectado.' };
    }
    if (report?.summary?.risk === 'medium' || report?.simulationSuccess === false) {
      return { level: 'verify', details: 'La comprobacion externa recomienda revisar el contrato antes de operar.' };
    }
  } catch {
    // Si no hay verificacion externa, seguimos con reglas locales conservadoras.
  }

  if (chainId === 1 && trustedMainnetAddresses.has(address)) {
    return { level: 'safe', details: `Contrato reconocido: ${trustedMainnetAddresses.get(address)}.` };
  }

  if (!token.name || token.name === 'Unknown ERC-20' || Number(token.formattedBalance) === 0) {
    return { level: 'verify', details: 'Datos incompletos o saldo no confirmable desde el contrato.' };
  }

  if (hasPattern(suspiciousNamePatterns, label)) {
    return { level: 'verify', details: 'Nombre con palabras usadas a menudo en tokens promocionales o de riesgo.' };
  }

  return { level: 'verify', details: 'Token no incluido en la lista local de contratos reconocidos. Verifica el contrato antes de enviarlo.' };
}
