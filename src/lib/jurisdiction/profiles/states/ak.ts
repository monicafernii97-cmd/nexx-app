/**
 * Alaska Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Alaska Default jurisdiction profile. */
export const AK_DEFAULT_PROFILE = createStateDefaultProfile('AK', 'Alaska');
