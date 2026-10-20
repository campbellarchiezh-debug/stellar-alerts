import { describe, it, expect } from 'vitest';
import { ConfigValidator } from './config-validator.js';
import { ProfileError } from './profile-types.js';

describe('ConfigValidator', () => {
  it('validates a correct ProfilesFile structure', () => {
    const validConfig = {
      version: 1,
      activeProfile: 'main',
      profiles: {
        main: {
          name: 'main',
          network: 'testnet',
          apiUrl: 'https://api.stellar-alerts.com',
          logLevel: 'info',
          createdAt: '2026-10-20T00:00:00Z',
          updatedAt: '2026-10-20T00:00:00Z',
          hasSecrets: true,
        },
      },
    };

    const validated = ConfigValidator.validate(validConfig, '/path/to/profiles.json');
    expect(validated.version).toBe(1);
    expect(validated.activeProfile).toBe('main');
    expect(validated.profiles['main'].apiUrl).toBe('https://api.stellar-alerts.com');
  });

  it('rejects invalid schema version with descriptive error', () => {
    const badVersion = {
      version: 2,
      activeProfile: null,
      profiles: {},
    };

    expect(() => ConfigValidator.validate(badVersion, '/path/to/profiles.json')).toThrow(ProfileError);
    try {
      ConfigValidator.validate(badVersion, '/path/to/profiles.json');
    } catch (err) {
      expect((err as ProfileError).message).toContain("Property 'version' must equal 1");
    }
  });

  it('rejects unexpected root fields', () => {
    const extraField = {
      version: 1,
      activeProfile: null,
      profiles: {},
      unknownField: true,
    };

    expect(() => ConfigValidator.validate(extraField, '/path/to/profiles.json')).toThrow(ProfileError);
    try {
      ConfigValidator.validate(extraField, '/path/to/profiles.json');
    } catch (err) {
      expect((err as ProfileError).message).toContain("Unexpected root property 'unknownField'");
    }
  });

  it('rejects invalid profile key format', () => {
    const invalidProfileName = {
      version: 1,
      activeProfile: null,
      profiles: {
        'invalid name with spaces': {
          name: 'invalid name with spaces',
          apiUrl: 'https://api.stellar-alerts.com',
          createdAt: '2026-10-20T00:00:00Z',
          updatedAt: '2026-10-20T00:00:00Z',
          hasSecrets: false,
        },
      },
    };

    expect(() => ConfigValidator.validate(invalidProfileName, '/path/to/profiles.json')).toThrow(ProfileError);
  });

  it('creates clean fallback default template', () => {
    const template = ConfigValidator.createDefaultTemplate();
    expect(template.version).toBe(1);
    expect(template.activeProfile).toBeNull();
    expect(template.profiles).toEqual({});
  });
});
