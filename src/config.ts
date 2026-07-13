import 'dotenv/config';

export const config = Object.freeze({
  litellmApiBase: process.env['LITELLM_API_BASE'] ?? 'http://localhost:4000',
  litellmApiKey: process.env['LITELLM_API_KEY'] ?? 'sk-no-key',
  extractionModel: process.env['EXTRACTION_MODEL'] ?? 'claude-haiku-4-5-20251001',
  embeddingModel: process.env['EMBEDDING_MODEL'] ?? 'text-embedding-3-small',
  extractionMode: (process.env['EXTRACTION_MODE'] ?? 'full') as 'full' | 'brief',
  similarityThreshold: parseFloat(process.env['SIMILARITY_THRESHOLD'] ?? '0.92'),
  recencyWeight: parseFloat(process.env['RECENCY_WEIGHT'] ?? '0.5'),
  connectionWeight: parseFloat(process.env['CONNECTION_WEIGHT'] ?? '0.5'),
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  parallelWorkers: parseInt(process.env['PARALLEL_WORKERS'] ?? '3', 10),
  forceReingest: process.env['FORCE_REINGEST'] === 'true',
});
