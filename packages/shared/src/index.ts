export const NOVA_APP_NAME = 'nova' as const;

export type HealthStatus = {
  status: 'ok';
};

export function createHealthResponse(): HealthStatus {
  return { status: 'ok' };
}
