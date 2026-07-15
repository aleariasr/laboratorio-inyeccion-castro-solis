import {
  apiGet,
  apiPost,
} from "@/lib/api/client";

import type {
  AuthUser,
  LoginCredentials,
  LoginResponse,
} from "./types";

const LOGIN_ENDPOINT = "/api/accounts/login/";
const LOGOUT_ENDPOINT = "/api/accounts/logout/";
const CURRENT_USER_ENDPOINT = "/api/accounts/me/";

export function login(
  credentials: LoginCredentials,
): Promise<LoginResponse> {
  return apiPost<LoginResponse>(
    LOGIN_ENDPOINT,
    credentials,
  );
}

export function getCurrentUser(
  token: string,
): Promise<AuthUser> {
  return apiGet<AuthUser>(
    CURRENT_USER_ENDPOINT,
    {
      token,
    },
  );
}

export function logout(
  token: string,
): Promise<null> {
  return apiPost<null>(
    LOGOUT_ENDPOINT,
    {},
    {
      token,
    },
  );
}