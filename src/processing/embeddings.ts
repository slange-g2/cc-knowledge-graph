import OpenAI from 'openai';
import { config } from '../config';

const client = new OpenAI({
  baseURL: config.litellmApiBase,
  apiKey: config.litellmApiKey,
});

export async function embedStrings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const response = await client.embeddings.create({
    model: config.embeddingModel,
    input: texts,
  });

  // Response data is ordered by index
  const sorted = response.data.sort((a, b) => a.index - b.index);
  return sorted.map((item) => item.embedding);
}
