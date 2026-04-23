/**
 * Louisiana Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Louisiana Default jurisdiction profile. */
export const LA_DEFAULT_PROFILE = createStateDefaultProfile('LA', 'Louisiana');
