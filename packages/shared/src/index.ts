export const API_HEALTH_PATH = '/api/health';

export const DEFAULT_API_PORT = 3001;
export const DEFAULT_WEB_PORT = 5173;

export interface ApiHealthResponse {
  status: 'ok';
  service: string;
  timestamp: string;
}
