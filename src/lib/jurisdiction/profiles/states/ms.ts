/**
 * Mississippi Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Mississippi Default jurisdiction profile. */
export const MS_DEFAULT_PROFILE = createStateDefaultProfile('MS', 'Mississippi');
