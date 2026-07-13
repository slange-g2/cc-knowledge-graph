import OpenAI from 'openai';
import { config } from '../config';
import type { RawSession } from '../ingestion/types';

const client = new OpenAI({
  baseURL: config.litellmApiBase,
  apiKey: config.litellmApiKey,
});

const SYSTEM_PROMPT =
  'You extract topics and concepts from software engineering conversations. Return ONLY a JSON array of strings, no explanation, no markdown.';

export async function extractTopics(
  session: RawSession,
): Promise<{ topics: string[]; tokens: number }> {
  let messagesText: string;

  if (config.extractionMode === 'brief') {
    // title + first user message only
    const firstMsg = session.userMessages[0] ?? '';
    messagesText = firstMsg;
  } else {
    // full: all user messages
    messagesText = session.userMessages.join('\n\n');
  }

  const userPrompt = `Extract key topics and concepts.\n\nTitle: ${session.label}\n\nUser messages:\n${messagesText}`;

  if (!messagesText.trim()) {
    return { topics: [], tokens: 0 };
  }

  const response = await client.chat.completions.create({
    model: config.extractionModel,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  });

  const rawContent = response.choices[0]?.message?.content ?? '';
  const totalTokens = response.usage?.total_tokens ?? 0;

  // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
  const stripped = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  let topics: string[];
  try {
    const parsed: unknown = JSON.parse(stripped);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      topics = parsed as string[];
    } else {
      topics = [];
    }
  } catch {
    topics = [];
  }

  return { topics, tokens: totalTokens };
}
