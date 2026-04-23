/**
 * Iowa Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Iowa Default jurisdiction profile. */
export const IA_DEFAULT_PROFILE = createStateDefaultProfile('IA', 'Iowa');
