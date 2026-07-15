export type SystemEnvironment = {
  name: "development" | "production";
  debug: boolean;
};

export type SystemStatusUser = {
  id: number;
  username: string;
  is_staff: boolean;
  is_superuser: boolean;
  groups: string[];
};

export type SystemStatusResponse = {
  status: "healthy";
  service: string;
  version: string;
  server_time: string;
  environment: SystemEnvironment;
  user: SystemStatusUser;
  modules: string[];
};