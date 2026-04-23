/**
 * Alabama Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Alabama Default jurisdiction profile. */
export const AL_DEFAULT_PROFILE = createStateDefaultProfile('AL', 'Alabama');
