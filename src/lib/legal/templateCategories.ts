/**
 * Template Categories for DocuVault UI
 *
 * Maps the existing 60+ legal templates to the 6 UI tab categories
 * used in the DocuVault document generator interface.
 */

import type { DocumentCategory, DocumentTemplate } from './types';
import { TEMPLATE_LIBRARY, getTemplatesByCategory } from './templates';

/** UI tab categories for the DocuVault generator */
export type UITabCategory = 'lead' | 'affidavit' | 'exhibits' | 'proposed_order' | 'response' | 'create_own';

export interface UITab {
  id: UITabCategory;
  label: string;
  description: string;
}

/** The 6 category tabs shown in the DocuVault generator */
export const UI_TABS: UITab[] = [
  { id: 'lead', label: 'LEAD', description: 'Petitions, motions & primary filings' },
  { id: 'affidavit', label: 'Affidavit', description: 'Declarations & sworn statements' },
  { id: 'exhibits', label: 'Exhibits', description: 'Exhibit covers, indexes & packets' },
  { id: 'proposed_order', label: 'Proposed Order', description: 'Proposed orders for court signature' },
  { id: 'response', label: 'Response/Answer', description: 'Responses, answers & counter-filings' },
  { id: 'create_own', label: '+Create Own', description: 'Blank template with court structure' },
];

/** Map UI tab categories to internal DocumentCategory types */
const CATEGORY_MAP: Record<UITabCategory, DocumentCategory[]> = {
  lead: [
    'petition',
    'motion_temporary',
    'motion_procedure',
    'motion_custody',
    'motion_enforcement',
    'motion_discovery',
    'notice_hearing',
    'notice_filing',
    'notice_case_status',
    'notice_parenting',
  ],
  affidavit: ['declaration'],
  exhibits: ['exhibit', 'certificate'],
  proposed_order: ['order'],
  response: ['response', 'counter_filing'],
  create_own: [],
};

/** Get templates for a specific UI tab category */
export function getTemplatesForTab(tabId: UITabCategory): DocumentTemplate[] {
  if (tabId === 'create_own') return [];

  const categories = CATEGORY_MAP[tabId];
  const templates: DocumentTemplate[] = [];

  for (const cat of categories) {
    templates.push(...getTemplatesByCategory(cat));
  }

  return templates;
}

/** Get all templates grouped by UI tab */
export function getAllTabTemplates(): Record<UITabCategory, DocumentTemplate[]> {
  return {
    lead: getTemplatesForTab('lead'),
    affidavit: getTemplatesForTab('affidavit'),
    exhibits: getTemplatesForTab('exhibits'),
    proposed_order: getTemplatesForTab('proposed_order'),
    response: getTemplatesForTab('response'),
    create_own: [],
  };
}

/** Count of templates per tab (for display) */
export function getTabTemplateCounts(): Record<UITabCategory, number> {
  const grouped = getAllTabTemplates();
  return {
    lead: grouped.lead.length,
    affidavit: grouped.affidavit.length,
    exhibits: grouped.exhibits.length,
    proposed_order: grouped.proposed_order.length,
    response: grouped.response.length,
    create_own: 1,
  };
}
