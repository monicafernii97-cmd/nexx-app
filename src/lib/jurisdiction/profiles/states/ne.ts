/**
 * Nebraska Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Nebraska Default jurisdiction profile. */
export const NE_DEFAULT_PROFILE = createStateDefaultProfile('NE', 'Nebraska');
