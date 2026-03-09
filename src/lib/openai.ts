import OpenAI from 'openai';

let cachedClient: OpenAI | null = null;

/**
 * Lazily initialise the OpenAI client at request-time (not build-time).
 * Validates that the API key is present and throws a descriptive error if not.
 * Caches the client instance for reuse across requests.
 */
export function getOpenAI(): OpenAI {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error(
            'OPENAI_API_KEY environment variable is not configured. ' +
            'Set it in your .env.local file or Vercel environment variables.'
        );
    }
    if (!cachedClient) {
        cachedClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return cachedClient;
}
