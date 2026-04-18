/**
 * Server-Sent Events (SSE) encoder utility.
 *
 * Follows the SSE spec (event/data/id line format per MDN).
 * Handles multi-line JSON safely by splitting on newlines
 * and emitting each as a separate `data:` line.
 */

export type SseEventName =
  | 'connected'
  | 'progress'
  | 'complete'
  | 'error'
  | 'heartbeat';

/**
 * Encode a typed SSE event as a UTF-8 Uint8Array ready for stream enqueue.
 *
 * Output format:
 *   id: <id>           (optional)
 *   event: <eventName>
 *   data: <json-line-1>
 *   data: <json-line-2>
 *   \n
 */
export function encodeSseEvent(
  event: SseEventName,
  payload: unknown,
  id?: string,
): Uint8Array {
  const encoder = new TextEncoder();
  const json = JSON.stringify(payload);

  const lines: string[] = [];
  if (id) lines.push(`id: ${id}`);
  lines.push(`event: ${event}`);

  // Split multi-line JSON across separate data: lines (SSE spec compliance)
  for (const line of json.split(/\r?\n/)) {
    lines.push(`data: ${line}`);
  }

  // Double newline terminates the event
  lines.push('', '');
  return encoder.encode(lines.join('\n'));
}

/** Encode an SSE comment (keep-alive heartbeat). */
export function encodeSseComment(comment: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(`: ${comment}\n\n`);
}
