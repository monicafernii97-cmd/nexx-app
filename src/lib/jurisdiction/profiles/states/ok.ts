/**
 * Oklahoma Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Oklahoma Default jurisdiction profile. */
export const OK_DEFAULT_PROFILE = createStateDefaultProfile('OK', 'Oklahoma');
