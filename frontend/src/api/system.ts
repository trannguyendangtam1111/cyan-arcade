import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './client'

export interface HealthResponse {
  status: 'UP' | 'DOWN' | 'OUT_OF_SERVICE' | 'UNKNOWN'
}

export const systemKeys = {
  health: ['system', 'health'] as const,
}

export function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/actuator/health', { signal })
}

export function useHealth() {
  return useQuery({
    queryKey: systemKeys.health,
    queryFn: ({ signal }) => fetchHealth(signal),
    refetchInterval: 30_000,
    retry: false,
  })
}
