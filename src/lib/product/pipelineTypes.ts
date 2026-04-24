/**
 * Product Pipeline Types
 *
 * The four canonical pipelines in NEXX. Each pipeline has its own
 * entry point, state model, and rendering path. They do not overlap.
 */

export type ProductPipeline =
  | 'court_document'
  | 'workspace_export'
  | 'exhibit_packet'
  | 'incident_report';

/** Map pipeline to its primary route */
export const PIPELINE_ROUTES: Record<ProductPipeline, string> = {
  court_document: '/docuvault',
  workspace_export: '/chat/overview',
  exhibit_packet: '/docuvault/exhibits',
  incident_report: '/incident-report',
};

/** Map pipeline to display label */
export const PIPELINE_LABELS: Record<ProductPipeline, string> = {
  court_document: 'Court Document',
  workspace_export: 'Workspace Export',
  exhibit_packet: 'Exhibit Packet',
  incident_report: 'Incident Report',
};
