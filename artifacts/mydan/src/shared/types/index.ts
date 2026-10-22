export * from '@/types/database';

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

export type EntityId = string;
