import {
  apiGet,
  apiPost,
} from "@/lib/api/client";

import type {
  AuthUser,
  ChangeOwnPasswordPayload,
  ChangeOwnPasswordResponse,
  LoginCredentials,
  LoginResponse,
} from "./types";

const LOGIN_ENDPOINT = "/api/accounts/login/";
const LOGOUT_ENDPOINT = "/api/accounts/logout/";
const CURRENT_USER_ENDPOINT = "/api/accounts/me/";
const CHANGE_OWN_PASSWORD_ENDPOINT = "/api/accounts/me/password/";

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

/**
 * Cambia la contraseña de la persona que está en sesión. El backend borra
 * el token viejo y devuelve uno nuevo, así que hay que guardarlo (ver
 * replaceToken en auth-context) o la sesión queda inválida.
 */
export function changeOwnPassword(
  token: string,
  payload: ChangeOwnPasswordPayload,
): Promise<ChangeOwnPasswordResponse> {
  return apiPost<ChangeOwnPasswordResponse>(
    CHANGE_OWN_PASSWORD_ENDPOINT,
    payload,
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