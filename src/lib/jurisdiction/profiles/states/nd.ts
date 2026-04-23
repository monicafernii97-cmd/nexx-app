/**
 * North Dakota Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** North Dakota Default jurisdiction profile. */
export const ND_DEFAULT_PROFILE = createStateDefaultProfile('ND', 'North Dakota');
