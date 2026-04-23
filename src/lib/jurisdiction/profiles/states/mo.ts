/**
 * Missouri Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Missouri Default jurisdiction profile. */
export const MO_DEFAULT_PROFILE = createStateDefaultProfile('MO', 'Missouri');
