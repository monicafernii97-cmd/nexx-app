#!/usr/bin/env tsx
/**
 * State Profile Generator
 *
 * Automated scaffolding tool for batch-creating state jurisdiction profiles.
 * Generates profile files, outputs registry import/entry snippets,
 * and creates regression test matrix entries.
 *
 * Usage:
 *   npx tsx scripts/generate-state-profiles.ts
 *
 * What this automates:
 *   - Profile file creation (state .ts files)
 *   - Registry import + map entry code (printed to stdout)
 *   - Test matrix entries (printed to stdout)
 *   - TODO markers for legal research
 *
 * What stays manual:
 *   - Actual legal formatting rules
 *   - Verifying state-specific court rules
 *   - Promoting accuracy status from thin_default to enriched_verified
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// ═══════════════════════════════════════════════════════════════
// Configuration — Add states here for batch scaffolding
// ═══════════════════════════════════════════════════════════════

type StateDef = {
  code: string;
  name: string;
  causeLabel?: string;
  /** Set to true if the state has enriched overrides ready */
  enriched?: boolean;
};

const BATCH_STATES: StateDef[] = [
  // Future batch example — edit this list and re-run
  // { code: 'WI', name: 'Wisconsin' },
  // { code: 'MN', name: 'Minnesota' },
];

// ═══════════════════════════════════════════════════════════════
// Generator
// ═══════════════════════════════════════════════════════════════

const __filename = fileURLToPath(import.meta.url);
const __scriptDir = path.dirname(__filename);

const PROFILE_DIR = path.resolve(
  __scriptDir,
  '../src/lib/jurisdiction/profiles/states',
);

/** Escape values for safe embedding in single-quoted TypeScript strings. */
function escapeForSingleQuotedString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Generate the TypeScript source code for a state profile file. */
function generateProfileFile(state: StateDef): string {
  const constName = `${state.code.toUpperCase()}_DEFAULT_PROFILE`;
  const causeLabel = escapeForSingleQuotedString(state.causeLabel ?? 'Case No.');
  const safeName = escapeForSingleQuotedString(state.name);
  const safeCode = escapeForSingleQuotedString(state.code);

  if (state.enriched) {
    return `/**
 * ${safeName} Default Jurisdiction Profile
 *
 * Enriched profile with ${safeName}-specific formatting rules.
 * Status: enriched_pending_review — awaiting manual verification.
 *
 * TODO: Verify against ${safeName} court rules
 * TODO: Verify county-specific requirements
 * TODO: Confirm caption/cause line format
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** ${safeName} Default jurisdiction profile. */
export const ${constName} = createStateDefaultProfile('${safeCode}', '${safeName}', {
  accuracyStatus: 'enriched_pending_review',
  sourceNotes: [
    {
      label: '${safeName} Rules of Civil Procedure',
      reviewedAt: '${new Date().toISOString().split('T')[0]}',
      reviewedBy: 'automated_scaffold',
    },
  ],
  overrides: {
    caption: {
      style: 'generic_state_caption',
      causeLabel: '${causeLabel}',
      useThreeColumnTable: false,
    },
    sections: {
      prayerHeadingRequired: true,
      certificateSeparatePage: true,
      signatureKeepTogether: true,
      verificationKeepTogether: true,
    },
    courtDocument: {
      prayerHeadingRequired: true,
      certificateSeparatePage: true,
      signatureKeepTogether: true,
      verificationKeepTogether: true,
    },
    // TODO: Add verified ${safeName} formatting rules here
  },
});
`;
  }

  return `/**
 * ${safeName} Default Jurisdiction Profile (Thin Default)
 *
 * Inherits all formatting from US_DEFAULT_PROFILE.
 * No state-specific research applied yet.
 *
 * To enrich, update this file with state-specific overrides and
 * change accuracyStatus to 'enriched_pending_review'.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** ${safeName} Default jurisdiction profile (thin default). */
export const ${constName} = createStateDefaultProfile('${safeCode}', '${safeName}');
`;
}

/** Generate the import statement for a state profile to add to registry.ts. */
function generateRegistryImport(state: StateDef): string {
  const constName = `${state.code.toUpperCase()}_DEFAULT_PROFILE`;
  return `import { ${constName} } from './states/${state.code.toLowerCase()}';`;
}

/** Generate the STATE_PROFILE_MAP entry for a state. */
function generateRegistryEntry(state: StateDef): string {
  const constName = `${state.code.toUpperCase()}_DEFAULT_PROFILE`;
  return `  ${state.code.toUpperCase()}: ${constName},`;
}

/** Generate the test matrix entry for a state. */
function generateTestEntry(state: StateDef): string {
  return `  { code: '${state.code.toUpperCase()}', name: '${state.name}', expectedKey: '${state.code.toLowerCase()}-default' },`;
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════

/** Main entry point — generates profile files and prints integration snippets. */
function main() {
  if (BATCH_STATES.length === 0) {
    console.log('No states to generate. Edit BATCH_STATES in this script.');
    console.log('Example:');
    console.log("  { code: 'WI', name: 'Wisconsin' },");
    return;
  }

  console.log(`Generating ${BATCH_STATES.length} state profiles...\n`);

  for (const state of BATCH_STATES) {
    const filename = `${state.code.toLowerCase()}.ts`;
    const filepath = path.join(PROFILE_DIR, filename);

    if (fs.existsSync(filepath)) {
      console.log(`  ⚠ SKIP: ${filename} already exists`);
      continue;
    }

    fs.writeFileSync(filepath, generateProfileFile(state));
    console.log(`  ✓ Created: ${filename}`);
  }

  console.log('\n═══ Registry Import Statements ═══\n');
  for (const state of BATCH_STATES) {
    console.log(generateRegistryImport(state));
  }

  console.log('\n═══ STATE_PROFILE_MAP Entries ═══\n');
  for (const state of BATCH_STATES) {
    console.log(generateRegistryEntry(state));
  }

  console.log('\n═══ Test Matrix Entries ═══\n');
  for (const state of BATCH_STATES) {
    console.log(generateTestEntry(state));
  }

  console.log('\n═══ Done ═══');
  console.log('Next steps:');
  console.log('  1. Add imports to registry.ts');
  console.log('  2. Add entries to STATE_PROFILE_MAP');
  console.log('  3. Add keys to convex/courtSettings.ts VALID_PROFILE_KEYS');
  console.log('  4. Run: npx vitest run src/lib/jurisdiction');
  console.log('  5. Manually verify formatting rules for enriched states');
}

main();
