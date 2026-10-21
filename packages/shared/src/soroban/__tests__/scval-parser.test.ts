import { describe, it, expect } from 'vitest';
import {
  scValToJs,
  jsToScVal,
  bigIntToParts128,
  formatScVal,
} from '../scval-parser';

describe('scval-parser', () => {
  describe('scValToJs - Primitives & Integers', () => {
    it('decodes void / null', () => {
      expect(scValToJs({ type: 'void' })).toBeNull();
      expect(scValToJs({ void: true })).toBeNull();
      expect(scValToJs(null)).toBeNull();
    });

    it('decodes booleans', () => {
      expect(scValToJs({ type: 'bool', value: true })).toBe(true);
      expect(scValToJs({ b: false })).toBe(false);
      expect(scValToJs(true)).toBe(true);
    });

    it('decodes u32 and i32 numbers', () => {
      expect(scValToJs({ type: 'u32', value: 12345 })).toBe(12345);
      expect(scValToJs({ u32: 999 })).toBe(999);
      expect(scValToJs({ type: 'i32', value: -42 })).toBe(-42);
      expect(scValToJs({ i32: -100 })).toBe(-100);
    });

    it('decodes u64 and i64 without precision loss into BigInt', () => {
      expect(scValToJs({ type: 'u64', value: '18446744073709551615' })).toBe(
        18446744073709551615n
      );
      expect(scValToJs({ u64: '100000000000000' })).toBe(100000000000000n);
      expect(scValToJs({ type: 'i64', value: '-9223372036854775808' })).toBe(
        -9223372036854775808n
      );
    });

    it('decodes timepoint and duration', () => {
      expect(scValToJs({ type: 'timepoint', value: '1700000000' })).toBe(1700000000n);
      expect(scValToJs({ duration: '86400' })).toBe(86400n);
    });

    it('decodes u128 high/low parts into 128-bit BigInt', () => {
      // 1 << 64 = hi: 1, lo: 0
      const res = scValToJs({
        type: 'u128',
        value: { hi: '1', lo: '0' },
      });
      expect(res).toBe(18446744073709551616n);

      const maxU128 = (1n << 128n) - 1n;
      const parts = bigIntToParts128(maxU128);
      expect(scValToJs({ u128: parts })).toBe(maxU128);
    });

    it('decodes i128 signed high/low parts into BigInt', () => {
      const partsPos = bigIntToParts128(500000000000000000000n);
      expect(scValToJs({ type: 'i128', value: partsPos })).toBe(500000000000000000000n);
    });
  });

  describe('scValToJs - Strings, Symbols & Addresses', () => {
    it('decodes symbols and strings', () => {
      expect(scValToJs({ type: 'symbol', value: 'transfer' })).toBe('transfer');
      expect(scValToJs({ sym: 'mint' })).toBe('mint');
      expect(scValToJs({ type: 'string', value: 'hello stellar' })).toBe('hello stellar');
      expect(scValToJs({ str: 'welcome' })).toBe('welcome');
    });

    it('decodes address variants', () => {
      const gAddr = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ';
      const cAddr = 'CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ';
      expect(scValToJs({ type: 'address', value: gAddr })).toBe(gAddr);
      expect(scValToJs({ address: { accountId: gAddr } })).toBe(gAddr);
      expect(scValToJs({ address: { contractId: cAddr } })).toBe(cAddr);
    });
  });

  describe('scValToJs - Vectors & Maps', () => {
    it('recursively decodes vectors', () => {
      const vecScVal = {
        type: 'vec',
        value: [
          { type: 'u32', value: 1 },
          { type: 'u32', value: 2 },
          { type: 'symbol', value: 'test' },
        ],
      };
      expect(scValToJs(vecScVal)).toEqual([1, 2, 'test']);
    });

    it('recursively decodes maps to JS objects', () => {
      const mapScVal = {
        type: 'map',
        value: [
          { key: { type: 'symbol', value: 'name' }, val: { type: 'string', value: 'Alice' } },
          { key: { type: 'symbol', value: 'age' }, val: { type: 'u32', value: 30 } },
          {
            key: { type: 'symbol', value: 'balance' },
            val: { type: 'u128', value: { hi: '0', lo: '1000' } },
          },
        ],
      };
      expect(scValToJs(mapScVal)).toEqual({
        name: 'Alice',
        age: 30,
        balance: 1000n,
      });
    });
  });

  describe('jsToScVal & Roundtrip Fidelity', () => {
    it('encodes primitives correctly', () => {
      expect(jsToScVal(null)).toEqual({ type: 'void' });
      expect(jsToScVal(true)).toEqual({ type: 'bool', value: true, b: true });
      expect(jsToScVal(42)).toEqual({ type: 'u32', value: 42, u32: 42 });
      expect(jsToScVal('transfer', 'symbol')).toEqual({
        type: 'symbol',
        value: 'transfer',
        sym: 'transfer',
      });
    });

    it('encodes BigInts and roundtrips u128', () => {
      const bigVal = 123456789012345678901234567890n;
      const encoded = jsToScVal(bigVal, 'u128');
      expect(encoded.type).toBe('u128');
      const decoded = scValToJs(encoded);
      expect(decoded).toBe(bigVal);
    });

    it('encodes nested objects and roundtrips', () => {
      const original = {
        owner: 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ',
        active: true,
        count: 5,
      };

      const scVal = jsToScVal(original);
      expect(scVal.type).toBe('map');
      const reconstructed = scValToJs(scVal);
      expect(reconstructed).toEqual(original);
    });

    it('formatScVal safely formats BigInts', () => {
      const str = formatScVal({ balance: 1000000000000000000n });
      expect(str).toContain('1000000000000000000n');
    });
  });
});
