/**
 * Artifact parsing utilities for Responses API output.
 * Handles the extraction of output_text from the response object.
 */

/**
 * Extract the raw text from a Responses API response object.
 * The response shape varies between streaming and non-streaming modes.
 */
export function extractOutputText(response: unknown): string {
  if (!response || typeof response !== 'object') return '';

  const r = response as Record<string, unknown>;

  // Direct output_text (most common for non-streaming)
  if (typeof r.output_text === 'string') {
    return r.output_text;
  }

  // Nested output array format
  if (Array.isArray(r.output)) {
    const parts: string[] = [];
    for (const item of r.output) {
      if (item && typeof item === 'object') {
        const outputItem = item as Record<string, unknown>;
        if (outputItem.type === 'message' && Array.isArray(outputItem.content)) {
          for (const content of outputItem.content) {
            if (content && typeof content === 'object') {
              const c = content as Record<string, unknown>;
              if (c.type === 'output_text' && typeof c.text === 'string') {
                parts.push(c.text);
              }
            }
          }
        }
      }
    }
    if (parts.length > 0) return parts.join('');
  }

  return '';
}
