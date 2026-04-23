/**
 * Oregon Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Oregon Default jurisdiction profile. */
export const OR_DEFAULT_PROFILE = createStateDefaultProfile('OR', 'Oregon');
