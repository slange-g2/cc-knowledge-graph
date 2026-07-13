export interface RawSession {
  id: string;
  source: 'claude-code' | 'opencode';
  project: string;
  label: string;
  timestamp: number;      // unix ms
  userMessages: string[]; // text of each user turn
}
