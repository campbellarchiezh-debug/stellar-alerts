/**
 * Soroban ScVal XDR / JSON conversion utility library for frontend applications.
 *
 * Implements bidirectional serialization and deserialization between Soroban ScVal
 * data structures (XDR-compatible JSON, Stellar SDK instances, RPC responses) and
 * idiomatic JavaScript primitives, BigInts, arrays, and objects.
 */

export type ScValTypeHint =
  | 'bool'
  | 'void'
  | 'u32'
  | 'i32'
  | 'u64'
  | 'i64'
  | 'timepoint'
  | 'duration'
  | 'u128'
  | 'i128'
  | 'u256'
  | 'i256'
  | 'bytes'
  | 'string'
  | 'symbol'
  | 'vec'
  | 'map'
  | 'address';

export interface ScValParts128 {
  hi: bigint | number | string;
  lo: bigint | number | string;
}

export interface ScValMapEntry<T = any> {
  key: T;
  val: T;
}

export interface ScValObject {
  type?: string;
  value?: any;
  b?: boolean;
  void?: boolean;
  u32?: number;
  i32?: number;
  u64?: bigint | number | string;
  i64?: bigint | number | string;
  timepoint?: bigint | number | string;
  duration?: bigint | number | string;
  u128?: ScValParts128 | bigint | string;
  i128?: ScValParts128 | bigint | string;
  sym?: string;
  symbol?: string;
  str?: string;
  string?: string;
  bytes?: Uint8Array | string | number[];
  address?: string | { accountId?: string; contractId?: string };
  vec?: any[];
  map?: ScValMapEntry[];
  [key: string]: any;
}

const U64_MASK = 0xffffffffffffffffn;
const I64_MAX = 0x7fffffffffffffffn;

/**
 * Combines 64-bit high and low parts into a signed or unsigned 128-bit BigInt.
 */
function partsToBigInt128(parts: ScValParts128, signed: boolean = false): bigint {
  const hi = BigInt(parts.hi);
  const lo = BigInt(parts.lo) & U64_MASK;
  const combined = (hi << 64n) | lo;

  if (signed && hi > I64_MAX) {
    // Two's complement conversion if high bit set
    return combined - (1n << 128n);
  }
  return combined;
}

/**
 * Splits a 128-bit BigInt into 64-bit high and low parts.
 */
export function bigIntToParts128(val: bigint): { hi: string; lo: string } {
  let unsignedVal = val;
  if (val < 0n) {
    unsignedVal = (1n << 128n) + val;
  }
  const lo = unsignedVal & U64_MASK;
  const hi = (unsignedVal >> 64n) & U64_MASK;
  return {
    hi: hi.toString(),
    lo: lo.toString(),
  };
}

/**
 * Recursively decodes a Soroban ScVal object (RPC JSON or SDK instance) into native JS primitives.
 *
 * - Integers (u32, i32) become native JavaScript `number`s.
 * - 64-bit and 128-bit integers (u64, i64, timepoint, duration, u128, i128) become native `BigInt`s without precision loss.
 * - Strings, symbols, and addresses decode to `string`s.
 * - Booleans decode to `boolean`.
 * - Void decodes to `null`.
 * - Vectors decode to recursive `any[]` arrays.
 * - Maps decode to recursive key-value JavaScript objects (or Map if keys are complex).
 *
 * @param scVal The Soroban ScVal structure to convert
 * @returns The converted JavaScript representation
 */
export function scValToJs(scVal: any): any {
  if (scVal === null || scVal === undefined) {
    return null;
  }

  // If already a primitive, return directly
  if (typeof scVal === 'boolean' || typeof scVal === 'number' || typeof scVal === 'bigint') {
    return scVal;
  }

  // Handle Stellar SDK ScVal class instances duck-typed via .switch() or .arm()
  if (typeof scVal === 'object' && typeof scVal.switch === 'function') {
    const sw = scVal.switch();
    const arm = typeof scVal.arm === 'function' ? scVal.arm() : String(sw?.name || sw);
    const value = typeof scVal.value === 'function' ? scVal.value() : scVal[arm];
    return scValToJs({ type: arm.toLowerCase(), value });
  }

  // Normalize explicit typed object { type: '...', value: ... }
  let type = scVal.type ? String(scVal.type).toLowerCase() : undefined;
  let val = scVal.value !== undefined ? scVal.value : undefined;

  // Handle property-shorthand format ({ u32: 123 }, { sym: 'foo' }, { b: true })
  if (!type) {
    if ('void' in scVal) return null;
    if ('b' in scVal) return Boolean(scVal.b);
    if ('bool' in scVal) return Boolean(scVal.bool);
    if ('u32' in scVal) return Number(scVal.u32);
    if ('i32' in scVal) return Number(scVal.i32);
    if ('u64' in scVal) return BigInt(scVal.u64);
    if ('i64' in scVal) return BigInt(scVal.i64);
    if ('timepoint' in scVal) return BigInt(scVal.timepoint);
    if ('duration' in scVal) return BigInt(scVal.duration);
    if ('u128' in scVal) {
      type = 'u128';
      val = scVal.u128;
    } else if ('i128' in scVal) {
      type = 'i128';
      val = scVal.i128;
    } else if ('sym' in scVal) {
      return String(scVal.sym);
    } else if ('symbol' in scVal) {
      return String(scVal.symbol);
    } else if ('str' in scVal) {
      return String(scVal.str);
    } else if ('string' in scVal) {
      return String(scVal.string);
    } else if ('bytes' in scVal) {
      return scVal.bytes;
    } else if ('address' in scVal) {
      type = 'address';
      val = scVal.address;
    } else if ('vec' in scVal) {
      type = 'vec';
      val = scVal.vec;
    } else if ('map' in scVal) {
      type = 'map';
      val = scVal.map;
    }
  }

  switch (type) {
    case 'void':
      return null;

    case 'bool':
      return Boolean(val);

    case 'u32':
    case 'i32':
      return Number(val);

    case 'u64':
    case 'i64':
    case 'timepoint':
    case 'duration':
      return BigInt(val);

    case 'u128': {
      if (typeof val === 'bigint') return val;
      if (typeof val === 'string' || typeof val === 'number') return BigInt(val);
      if (val && typeof val === 'object' && 'hi' in val && 'lo' in val) {
        return partsToBigInt128(val as ScValParts128, false);
      }
      return BigInt(val);
    }

    case 'i128': {
      if (typeof val === 'bigint') return val;
      if (typeof val === 'string' || typeof val === 'number') return BigInt(val);
      if (val && typeof val === 'object' && 'hi' in val && 'lo' in val) {
        return partsToBigInt128(val as ScValParts128, true);
      }
      return BigInt(val);
    }

    case 'u256':
    case 'i256': {
      if (typeof val === 'bigint') return val;
      if (typeof val === 'string' || typeof val === 'number') return BigInt(val);
      return val;
    }

    case 'symbol':
    case 'sym':
    case 'string':
    case 'str':
      return String(val);

    case 'bytes':
      return val;

    case 'address': {
      if (typeof val === 'string') return val;
      if (val && typeof val === 'object') {
        if (typeof val.accountId === 'string') return val.accountId;
        if (typeof val.contractId === 'string') return val.contractId;
        if (typeof val.address === 'string') return val.address;
      }
      return String(val);
    }

    case 'vec': {
      if (!Array.isArray(val)) return [];
      return val.map((elem) => scValToJs(elem));
    }

    case 'map': {
      if (!Array.isArray(val)) return {};
      const obj: Record<string, any> = {};
      for (const entry of val) {
        const key = scValToJs(entry.key);
        const value = scValToJs(entry.val ?? entry.value);
        obj[String(key)] = value;
      }
      return obj;
    }

    default:
      // If object with unrecognized type, recursively parse fields
      if (Array.isArray(scVal)) {
        return scVal.map((item) => scValToJs(item));
      }
      return scVal;
  }
}

/**
 * Checks if a string is a standard Stellar StrKey address (Ed25519 G... or Contract C...).
 */
function isStellarAddress(str: string): boolean {
  return /^[GC][A-Z2-7]{55}$/.test(str);
}

/**
 * Encodes a JavaScript primitive or nested object into a canonical Soroban ScVal structure.
 *
 * @param value The JavaScript value to convert
 * @param typeHint Optional explicit type annotation (e.g. 'symbol', 'i128', 'u32')
 * @returns An ScVal-compliant JSON object suitable for RPC calls and XDR serialization
 */
export function jsToScVal(value: any, typeHint?: ScValTypeHint): ScValObject {
  if (value === null || value === undefined) {
    return { type: 'void' };
  }

  if (typeHint) {
    switch (typeHint) {
      case 'void':
        return { type: 'void' };
      case 'bool':
        return { type: 'bool', value: Boolean(value), b: Boolean(value) };
      case 'u32':
        return { type: 'u32', value: Number(value), u32: Number(value) };
      case 'i32':
        return { type: 'i32', value: Number(value), i32: Number(value) };
      case 'u64':
        return { type: 'u64', value: BigInt(value).toString(), u64: BigInt(value).toString() };
      case 'i64':
        return { type: 'i64', value: BigInt(value).toString(), i64: BigInt(value).toString() };
      case 'timepoint':
        return { type: 'timepoint', value: BigInt(value).toString(), timepoint: BigInt(value).toString() };
      case 'duration':
        return { type: 'duration', value: BigInt(value).toString(), duration: BigInt(value).toString() };
      case 'u128': {
        const parts = bigIntToParts128(BigInt(value));
        return { type: 'u128', value: parts, u128: parts };
      }
      case 'i128': {
        const parts = bigIntToParts128(BigInt(value));
        return { type: 'i128', value: parts, i128: parts };
      }
      case 'symbol':
        return { type: 'symbol', value: String(value), sym: String(value) };
      case 'string':
        return { type: 'string', value: String(value), str: String(value) };
      case 'address':
        return { type: 'address', value: String(value), address: String(value) };
      case 'bytes':
        return { type: 'bytes', value, bytes: value };
      case 'vec':
        return {
          type: 'vec',
          value: Array.isArray(value) ? value.map((v) => jsToScVal(v)) : [],
          vec: Array.isArray(value) ? value.map((v) => jsToScVal(v)) : [],
        };
      case 'map':
        return jsToScValMap(value);
    }
  }

  // Automatic type inference
  if (typeof value === 'boolean') {
    return { type: 'bool', value, b: value };
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      if (value >= 0 && value <= 0xffffffff) {
        return { type: 'u32', value, u32: value };
      }
      return { type: 'i32', value, i32: value };
    }
    // Float representation as string or round
    return { type: 'string', value: value.toString(), str: value.toString() };
  }

  if (typeof value === 'bigint') {
    if (value >= 0n && value <= U64_MASK) {
      return { type: 'u64', value: value.toString(), u64: value.toString() };
    }
    if (value >= -0x8000000000000000n && value <= 0x7fffffffffffffffn) {
      return { type: 'i64', value: value.toString(), i64: value.toString() };
    }
    // 128-bit BigInt
    const parts = bigIntToParts128(value);
    return { type: value >= 0n ? 'u128' : 'i128', value: parts, [value >= 0n ? 'u128' : 'i128']: parts };
  }

  if (typeof value === 'string') {
    if (isStellarAddress(value)) {
      return { type: 'address', value, address: value };
    }
    return { type: 'string', value, str: value };
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => jsToScVal(item));
    return { type: 'vec', value: items, vec: items };
  }

  if (typeof value === 'object') {
    return jsToScValMap(value);
  }

  return { type: 'string', value: String(value), str: String(value) };
}

function jsToScValMap(obj: Record<string, any> | Map<any, any>): ScValObject {
  const entries: ScValMapEntry[] = [];
  if (obj instanceof Map) {
    for (const [k, v] of obj.entries()) {
      entries.push({
        key: jsToScVal(k, typeof k === 'string' && /^[a-zA-Z0-9_]{1,32}$/.test(k) ? 'symbol' : undefined),
        val: jsToScVal(v),
      });
    }
  } else {
    for (const [k, v] of Object.entries(obj)) {
      entries.push({
        key: jsToScVal(k, /^[a-zA-Z0-9_]{1,32}$/.test(k) ? 'symbol' : 'string'),
        val: jsToScVal(v),
      });
    }
  }
  return { type: 'map', value: entries, map: entries };
}

/**
 * Safe JSON stringification helper handling BigInt serialization.
 */
export function formatScVal(scVal: any, indent: number = 2): string {
  return JSON.stringify(
    scVal,
    (_key, value) => (typeof value === 'bigint' ? value.toString() + 'n' : value),
    indent
  );
}
