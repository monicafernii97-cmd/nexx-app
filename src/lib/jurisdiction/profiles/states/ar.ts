/**
 * Arkansas Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Arkansas Default jurisdiction profile. */
export const AR_DEFAULT_PROFILE = createStateDefaultProfile('AR', 'Arkansas');
