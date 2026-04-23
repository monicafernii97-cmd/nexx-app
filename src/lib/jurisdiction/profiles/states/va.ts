/**
 * Virginia Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Virginia Default jurisdiction profile. */
export const VA_DEFAULT_PROFILE = createStateDefaultProfile('VA', 'Virginia');
