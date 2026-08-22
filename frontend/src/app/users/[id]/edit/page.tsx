"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { StatePanel } from "@/components/feedback/state-panel";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { isAdministrativeUser } from "@/features/auth/permissions";
import { getUser, updateUser } from "@/features/users/api";
import { mapUserApiFieldErrors } from "@/features/users/form-errors";
import {
  buildUserWritePayload,
  userToFormValues,
  type User,
  type UserFormErrors,
  type UserFormValues,
} from "@/features/users/types";
import { UserForm } from "@/features/users/user-form";
import { ApiError, ApiNetworkError, ApiTimeoutError } from "@/lib/api/errors";

type LoadState =
  | {
      status: "loading";
      targetUser: null;
      message: null;
    }
  | {
      status: "success";
      targetUser: User;
      message: null;
    }
  | {
      status: "not-found" | "forbidden" | "error";
      targetUser: null;
      message: string;
    };

function getLoadErrorMessage(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return "La consulta tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible consultar el usuario.";
}

function getSubmitErrorMessage(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return "La actualización tardó demasiado tiempo en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local. Revise el estado del sistema e inténtelo nuevamente.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return "No fue posible guardar los cambios.";
}

export default function EditUserPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const { status: authStatus, user, token, logout, refreshUser } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    targetUser: null,
    message: null,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const [serverErrors, setServerErrors] = useState<UserFormErrors>({});

  const userId = Number(params.id);

  const hasAccess = user ? isAdministrativeUser(user) : false;

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !token ||
      !hasAccess ||
      !Number.isInteger(userId) ||
      userId <= 0
    ) {
      return;
    }

    const controller = new AbortController();

    getUser(token, userId, controller.signal)
      .then((targetUser) => {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({ status: "success", targetUser, message: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        if (error instanceof ApiError && error.status === 401) {
          void logout().then(() => {
            router.replace("/login");
          });

          return;
        }

        if (error instanceof ApiError && error.status === 403) {
          setLoadState({
            status: "forbidden",
            targetUser: null,
            message: "Este usuario no tiene permisos para editar usuarios.",
          });

          return;
        }

        if (error instanceof ApiError && error.status === 404) {
          setLoadState({
            status: "not-found",
            targetUser: null,
            message: "El usuario solicitado no existe o ya no está disponible.",
          });

          return;
        }

        setLoadState({
          status: "error",
          targetUser: null,
          message: getLoadErrorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [authStatus, hasAccess, logout, router, token, userId]);

  async function handleSubmit(values: UserFormValues): Promise<void> {
    if (!token || isSubmitting || loadState.status !== "success") {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setServerErrors({});

    try {
      await updateUser(token, loadState.targetUser.id, buildUserWritePayload(values));

      /*
       * Si la persona administradora se editó a sí misma (por ejemplo,
       * sus propios roles o is_staff), la sesión local guardada en
       * localStorage queda desactualizada hasta el próximo refresh.
       */
      if (user && user.id === loadState.targetUser.id) {
        await refreshUser();
      }

      router.replace(`/users/${loadState.targetUser.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
        router.replace("/login");
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        setSubmitError("Este usuario no tiene permisos para editar usuarios.");
        return;
      }

      if (error instanceof ApiError && error.status === 404) {
        setSubmitError("El usuario ya no existe o dejó de estar disponible.");
        return;
      }

      if (error instanceof ApiError && error.status === 400) {
        const mappedErrors = mapUserApiFieldErrors(error.fieldErrors);

        setServerErrors(mappedErrors);

        if (Object.keys(mappedErrors).length === 0) {
          setSubmitError(error.message);
        }

        return;
      }

      setSubmitError(getSubmitErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  function returnToUserDetail(): void {
    router.push(`/users/${userId}`);
  }

  if (!Number.isInteger(userId) || userId <= 0) {
    return (
      <AppShell
        title="Usuario no válido"
        description="La dirección proporcionada no identifica un usuario."
      >
        <StatePanel
          title="Identificador incorrecto"
          message="Regrese al listado y seleccione un usuario válido."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/users");
              }}
            >
              Volver a usuarios
            </Button>
          }
        />
      </AppShell>
    );
  }

  if (authStatus === "authenticated" && user && !hasAccess) {
    return (
      <AppShell
        title="Acceso restringido"
        description="Esta operación requiere permisos de administración."
      >
        <StatePanel
          title="No puede editar usuarios"
          message="Solicite a una persona administradora que revise los permisos de su usuario."
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/users");
              }}
            >
              Volver a usuarios
            </Button>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={
        loadState.status === "success"
          ? `Editar ${loadState.targetUser.username}`
          : "Editar usuario"
      }
      description="Modifique la información, el acceso y los roles del usuario."
    >
      {loadState.status === "loading" && <LoadingState message="Consultando usuario…" />}

      {loadState.status === "forbidden" && (
        <StatePanel
          title="Acceso restringido"
          message={loadState.message}
          tone="warning"
          action={
            <Button type="button" variant="secondary" onClick={returnToUserDetail}>
              Volver al detalle
            </Button>
          }
        />
      )}

      {loadState.status === "not-found" && (
        <StatePanel
          title="Usuario no encontrado"
          message={loadState.message}
          tone="warning"
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.replace("/users");
              }}
            >
              Volver a usuarios
            </Button>
          }
        />
      )}

      {loadState.status === "error" && (
        <StatePanel
          title="No se pudo cargar el usuario"
          message={loadState.message}
          tone="error"
          action={
            <Button
              type="button"
              onClick={() => {
                globalThis.location.reload();
              }}
            >
              Reintentar
            </Button>
          }
        />
      )}

      {loadState.status === "success" && (
        <UserForm
          key={loadState.targetUser.id}
          mode="edit"
          initialValues={userToFormValues(loadState.targetUser)}
          isSubmitting={isSubmitting}
          submitError={submitError}
          serverErrors={serverErrors}
          onSubmit={handleSubmit}
          onCancel={returnToUserDetail}
        />
      )}
    </AppShell>
  );
}
