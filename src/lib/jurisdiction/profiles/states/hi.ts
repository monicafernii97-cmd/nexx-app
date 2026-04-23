/**
 * Hawaii Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Hawaii Default jurisdiction profile. */
export const HI_DEFAULT_PROFILE = createStateDefaultProfile('HI', 'Hawaii');
