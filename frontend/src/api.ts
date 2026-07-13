import type { Filters, GraphResponse, StatusResponse } from './types.js';

const BASE = '/api';

function buildQuery(params: Record<string, string>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== '');
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

export async function fetchGraph(filters: Partial<Filters>): Promise<GraphResponse> {
  const params: Record<string, string> = {};
  if (filters.projects && filters.projects.length > 0) {
    params['project'] = filters.projects.join(',');
  }
  if (filters.dateStart) params['dateStart'] = filters.dateStart;
  if (filters.dateEnd) params['dateEnd'] = filters.dateEnd;
  if (filters.topic) params['topic'] = filters.topic;
  if (filters.granularity) params['granularity'] = filters.granularity;

  const res = await fetch(`${BASE}/graph${buildQuery(params)}`);
  if (!res.ok) throw new Error(`fetchGraph failed: ${res.status}`);
  return res.json() as Promise<GraphResponse>;
}

export async function fetchProjects(): Promise<string[]> {
  const res = await fetch(`${BASE}/projects`);
  if (!res.ok) throw new Error(`fetchProjects failed: ${res.status}`);
  const data = await res.json() as { projects: string[] };
  return data.projects;
}

export async function fetchTopics(): Promise<{ id: string; label: string }[]> {
  const res = await fetch(`${BASE}/topics`);
  if (!res.ok) throw new Error(`fetchTopics failed: ${res.status}`);
  const data = await res.json() as { topics: { id: string; label: string }[] };
  return data.topics;
}

export async function fetchStatus(): Promise<StatusResponse> {
  const res = await fetch(`${BASE}/status`);
  if (!res.ok) throw new Error(`fetchStatus failed: ${res.status}`);
  return res.json() as Promise<StatusResponse>;
}
