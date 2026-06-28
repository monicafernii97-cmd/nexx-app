import { describe, expect, it } from 'vitest';
import { NEXX_RESPONSE_SCHEMA } from '../schemas';

function collectObjectsWithMissingRequiredKeys(schema: unknown, path = '$'): string[] {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return [];

  const node = schema as {
    type?: unknown;
    properties?: Record<string, unknown>;
    required?: unknown;
    items?: unknown;
  };
  const missing: string[] = [];
  if (node.properties && (node.type === 'object' || node.type === undefined)) {
    const required = Array.isArray(node.required) ? new Set(node.required) : new Set();
    for (const key of Object.keys(node.properties)) {
      if (!required.has(key)) {
        missing.push(`${path}.${key}`);
      }
    }
  }

  for (const [key, value] of Object.entries(node.properties ?? {})) {
    missing.push(...collectObjectsWithMissingRequiredKeys(value, `${path}.properties.${key}`));
  }
  if (node.items) {
    missing.push(...collectObjectsWithMissingRequiredKeys(node.items, `${path}.items`));
  }

  return missing;
}

describe('NEXX_RESPONSE_SCHEMA', () => {
  it('requires every declared object property for structured output compatibility', () => {
    expect(collectObjectsWithMissingRequiredKeys(NEXX_RESPONSE_SCHEMA.schema)).toEqual([]);
  });
});
