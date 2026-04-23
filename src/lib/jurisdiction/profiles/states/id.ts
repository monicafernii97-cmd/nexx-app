/**
 * Idaho Default Jurisdiction Profile
 *
 * Inherits US default. Override specific fields as state
 * formatting research is completed.
 */

import type { JurisdictionProfile } from '../../types';
import { US_DEFAULT_PROFILE } from '../us-default';

/** Idaho Default jurisdiction profile. */
export const ID_DEFAULT_PROFILE: JurisdictionProfile = {
  ...US_DEFAULT_PROFILE,
  key: 'id-default',
  version: '1.0',
  name: 'Idaho State Pleading',
  state: 'Idaho',

  scope: {
    country: 'US',
    state: 'ID',
  },
};
