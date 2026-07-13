// Canonical types — mirror API contract from docs/structure/global.md verbatim

export interface SessionNode {
  id: string;
  type: 'session';
  label: string;
  project: string;
  source: 'claude-code' | 'opencode';
  timestamp: number;    // unix ms
  size: number;         // 0–1 composite
  color: string;        // hex
}

export interface TopicNode {
  id: string;
  type: 'topic';
  label: string;
  cluster: number;
  avgTimestamp: number; // weighted avg unix ms of its sessions
  size: number;
  color: string;
}

export type GraphNode = SessionNode | TopicNode;

export interface Edge {
  source: string;       // node id
  target: string;       // node id
  type: 'session-topic' | 'topic-similarity';
  weight: number;       // 0–1
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: Edge[];
}

export interface Filters {
  projects: string[];
  dateStart: string;
  dateEnd: string;
  topic: string;
  granularity: 'day' | 'week' | 'month';
}

export interface ProjectsResponse {
  projects: string[];
}

export interface TopicsResponse {
  topics: { id: string; label: string }[];
}

export interface StatusResponse {
  sessionCount: number;
  topicCount: number;
  lastIngested: string | null;
}
