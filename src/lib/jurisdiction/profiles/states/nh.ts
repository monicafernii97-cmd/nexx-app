/**
 * New Hampshire Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** New Hampshire Default jurisdiction profile. */
export const NH_DEFAULT_PROFILE = createStateDefaultProfile('NH', 'New Hampshire');
