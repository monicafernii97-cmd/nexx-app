/**
 * Delaware Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Delaware Default jurisdiction profile. */
export const DE_DEFAULT_PROFILE = createStateDefaultProfile('DE', 'Delaware');
