/**
 * Vermont Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Vermont Default jurisdiction profile. */
export const VT_DEFAULT_PROFILE = createStateDefaultProfile('VT', 'Vermont');
