import { apiGet, apiPatch, apiPost } from "@/lib/api/client";
import type { PaginatedResponse } from "@/lib/api/types";

import type {
  User,
  UserCreatePayload,
  UserFilters,
  UserWritePayload,
} from "./types";

function buildUsersQuery(filters: UserFilters): string {
  const searchParams = new URLSearchParams();

  const normalizedQuery = filters.query.trim();

  if (normalizedQuery) {
    searchParams.set("q", normalizedQuery);
  }

  if (filters.activeState === "active") {
    searchParams.set("is_active", "true");
  }

  if (filters.activeState === "inactive") {
    searchParams.set("is_active", "false");
  }

  searchParams.set("page", String(filters.page));
  searchParams.set("page_size", String(filters.pageSize));

  return searchParams.toString();
}

export function getUsers(
  token: string,
  filters: UserFilters,
  signal?: AbortSignal,
): Promise<PaginatedResponse<User>> {
  const query = buildUsersQuery(filters);

  return apiGet<PaginatedResponse<User>>(`/api/accounts/users/?${query}`, {
    token,
    signal,
  });
}

export function getUser(
  token: string,
  userId: number,
  signal?: AbortSignal,
): Promise<User> {
  return apiGet<User>(`/api/accounts/users/${userId}/`, {
    token,
    signal,
  });
}

export function createUser(
  token: string,
  payload: UserCreatePayload,
): Promise<User> {
  return apiPost<User>("/api/accounts/users/", payload, {
    token,
  });
}

export function updateUser(
  token: string,
  userId: number,
  payload: UserWritePayload,
): Promise<User> {
  return apiPatch<User>(`/api/accounts/users/${userId}/`, payload, {
    token,
  });
}

/**
 * Restablece la contraseña de otro usuario. Cierra las sesiones abiertas de
 * esa persona (el backend borra su token). Para la contraseña propia está
 * changeOwnPassword en features/auth/api.ts, que sí pide la actual.
 */
export function setUserPassword(
  token: string,
  userId: number,
  password: string,
): Promise<null> {
  return apiPost<null>(
    `/api/accounts/users/${userId}/set-password/`,
    { password },
    { token },
  );
}
