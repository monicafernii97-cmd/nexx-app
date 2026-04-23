/**
 * Michigan Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Michigan Default jurisdiction profile. */
export const MI_DEFAULT_PROFILE = createStateDefaultProfile('MI', 'Michigan');
