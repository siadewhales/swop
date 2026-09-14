// Lectura de lo que una dApp pide firmar, para que nada se apruebe a ciegas.
// Las aprobaciones de gasto (approve, permit, Permit2, setApprovalForAll) y las órdenes de mercado son la vía
// más común para vaciar carteras: se muestran con quién recibe el permiso y por cuánto, y se marcan en rojo.
import { ethers } from 'ethers';

export const UNLIMITED = 'UNLIMITED';

const MAX_UINT160 = (1n << 160n) - 1n;
const HALF_UINT256 = ethers.MaxUint256 / 2n;

const TOKEN_CALLS = new ethers.Interface([
  'function approve(address spender, uint256 amount)',
  'function increaseAllowance(address spender, uint256 addedValue)',
  'function setApprovalForAll(address operator, bool approved)',
  'function transfer(address to, uint256 amount)',
  'function transferFrom(address from, address to, uint256 amount)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)'
]);
const PERMIT2_CALLS = new ethers.Interface([
  'function approve(address token, address spender, uint160 amount, uint48 expiration)'
]);
const PERMIT2_APPROVE = PERMIT2_CALLS.getFunction('approve').selector;

export function isUnlimitedAmount(value) {
  try {
    const amount = BigInt(value);
    return amount >= MAX_UINT160 || amount >= HALF_UINT256;
  } catch {
    return false;
  }
}

function amountValue(value) {
  if (value === undefined || value === null || value === '') return '-';
  return isUnlimitedAmount(value) ? UNLIMITED : BigInt(value).toString();
}

function timeValue(value) {
  if (value === undefined || value === null || value === '') return '-';
  try {
    const seconds = BigInt(value);
    if (seconds <= 0n) return '-';
    if (seconds > 32503680000n) return 'never';          // más allá del año 3000: sin caducidad real
    return new Date(Number(seconds) * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  } catch {
    return String(value);
  }
}

function address(value) {
  try {
    return ethers.getAddress(String(value));
  } catch {
    return String(value || '-');
  }
}

// Transacción (eth_sendTransaction / eth_signTransaction).
export function describeEvmTransaction(tx = {}) {
  const data = String(tx.data || tx.input || '0x').toLowerCase();
  if (data === '0x' || data.length < 10) return { kind: 'plain', risk: null, details: [] };

  try {
    if (data.startsWith(PERMIT2_APPROVE)) {
      const [token, spender, amount, expiration] = PERMIT2_CALLS.decodeFunctionData('approve', data);
      return {
        kind: 'permit2Approve',
        risk: 'high',
        details: [['spender', address(spender)], ['token', address(token)], ['amount', amountValue(amount)], ['expires', timeValue(expiration)]]
      };
    }
    const parsed = TOKEN_CALLS.parseTransaction({ data });
    if (parsed) {
      const args = parsed.args;
      switch (parsed.name) {
        case 'approve': {
          const unlimited = isUnlimitedAmount(args.amount);
          return {
            kind: 'approve',
            risk: BigInt(args.amount) === 0n ? null : unlimited ? 'high' : 'medium',
            details: [['spender', address(args.spender)], ['token', address(tx.to)], ['amount', amountValue(args.amount)]]
          };
        }
        case 'increaseAllowance':
          return {
            kind: 'approve',
            risk: isUnlimitedAmount(args.addedValue) ? 'high' : 'medium',
            details: [['spender', address(args.spender)], ['token', address(tx.to)], ['amount', amountValue(args.addedValue)]]
          };
        case 'setApprovalForAll':
          return {
            kind: 'setApprovalForAll',
            risk: args.approved ? 'high' : null,
            details: [['operator', address(args.operator)], ['contract', address(tx.to)], ['approved', args.approved ? 'true' : 'false']]
          };
        case 'transfer':
          return { kind: 'transfer', risk: null, details: [['recipient', address(args.to)], ['token', address(tx.to)], ['amount', BigInt(args.amount).toString()]] };
        case 'transferFrom':
        case 'safeTransferFrom':
          return {
            kind: 'transferFrom',
            risk: 'medium',
            details: [['owner', address(args.from)], ['recipient', address(args.to)], ['contract', address(tx.to)]]
          };
        case 'permit':
          return {
            kind: 'permit',
            risk: isUnlimitedAmount(args.value) ? 'high' : 'medium',
            details: [['owner', address(args.owner)], ['spender', address(args.spender)], ['amount', amountValue(args.value)], ['expires', timeValue(args.deadline)]]
          };
        default:
          break;
      }
    }
  } catch {
    // Datos que no encajan con ninguna función conocida: se tratan como llamada desconocida.
  }
  return { kind: 'unknownCall', risk: 'medium', details: [['contract', address(tx.to)]] };
}

// Firma de datos estructurados (eth_signTypedData*). Una firma no gasta gas y aun así puede entregar tus tokens.
export function describeTypedData(typed) {
  const type = typed?.primaryType;
  const message = typed?.message || {};
  const domain = typed?.domain || {};
  const base = [['domain', domain.name || '-'], ['contract', domain.verifyingContract ? address(domain.verifyingContract) : '-']];

  if (type === 'Permit' && message.spender) {
    // EIP-2612 (value) y variante DAI (allowed = permiso sin límite).
    const unlimited = message.allowed === true || message.allowed === 'true' || isUnlimitedAmount(message.value ?? 0);
    return {
      kind: 'permit',
      risk: unlimited || message.value === undefined ? 'high' : 'medium',
      details: [...base, ['spender', address(message.spender)], ['amount', message.value !== undefined ? amountValue(message.value) : UNLIMITED], ['expires', timeValue(message.deadline ?? message.expiry)]]
    };
  }
  if (type === 'PermitSingle') {
    return {
      kind: 'permit',
      risk: 'high',
      details: [...base, ['spender', address(message.spender)], ['token', address(message.details?.token)], ['amount', amountValue(message.details?.amount)], ['expires', timeValue(message.details?.expiration)]]
    };
  }
  if (type === 'PermitBatch') {
    const tokens = (message.details || []).map((item) => `${address(item.token)} (${amountValue(item.amount)})`).join(', ');
    return { kind: 'permit', risk: 'high', details: [...base, ['spender', address(message.spender)], ['token', tokens || '-']] };
  }
  if (type === 'PermitTransferFrom' || type === 'PermitWitnessTransferFrom' || type === 'PermitBatchTransferFrom') {
    const permitted = Array.isArray(message.permitted) ? message.permitted : [message.permitted || {}];
    const tokens = permitted.map((item) => `${address(item.token)} (${amountValue(item.amount)})`).join(', ');
    return { kind: 'permit', risk: 'high', details: [...base, ['spender', address(message.spender)], ['token', tokens || '-'], ['expires', timeValue(message.deadline)]] };
  }
  if (type === 'OrderComponents' || type === 'Order' || type === 'BulkOrder') {
    return { kind: 'order', risk: 'high', details: base };
  }
  return { kind: 'typedData', risk: null, details: [...base, ['primaryType', type || '-']] };
}
