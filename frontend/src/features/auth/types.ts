export type AuthUser = {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  groups: string[];
  permissions: string[];
};

export type LoginCredentials = {
  username: string;
  password: string;
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
};

export type StoredSession = {
  token: string;
  user: AuthUser;
};

export type ChangeOwnPasswordPayload = {
  current_password: string;
  new_password: string;
};

export type ChangeOwnPasswordResponse = {
  /** Token nuevo: el anterior queda invalidado al cambiar la contraseña. */
  token: string;
};
