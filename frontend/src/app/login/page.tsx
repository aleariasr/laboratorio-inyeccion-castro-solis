"use client";

import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { AppLogo } from "@/components/branding/app-logo";
import { FormError } from "@/components/feedback/form-error";
import { LoadingState } from "@/components/feedback/loading-state";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyboardShortcut } from "@/components/ui/keyboard-shortcut";
import { useAuth } from "@/features/auth/auth-context";
import {
  ApiError,
  ApiNetworkError,
  ApiTimeoutError,
} from "@/lib/api/errors";

function getLoginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "El usuario o la contraseña son incorrectos.";
    }

    if (error.status === 403) {
      return "Este usuario no tiene acceso al sistema.";
    }

    return error.message;
  }

  if (error instanceof ApiTimeoutError) {
    return "El sistema tardó demasiado en responder.";
  }

  if (error instanceof ApiNetworkError) {
    return "No fue posible comunicarse con el sistema local.";
  }

  return "No fue posible iniciar sesión.";
}

export default function LoginPage() {
  const router = useRouter();
  const { status, login } = useAuth();

  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [router, status]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const normalizedUsername = username.trim();

    if (!normalizedUsername) {
      setErrorMessage("Ingrese el usuario.");
      usernameRef.current?.focus();
      return;
    }

    if (!password) {
      setErrorMessage("Ingrese la contraseña.");
      passwordRef.current?.focus();
      return;
    }

    setErrorMessage("");
    setIsSubmitting(true);

    try {
      await login({
        username: normalizedUsername,
        password,
      });

      router.replace("/dashboard");
    } catch (error) {
      setErrorMessage(getLoginErrorMessage(error));
      passwordRef.current?.focus();
      passwordRef.current?.select();
    } finally {
      setIsSubmitting(false);
    }
  }

  if (status === "loading") {
    return (
      <LoadingState
        fullScreen
        message="Verificando sesión…"
      />
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-8 sm:px-8">

      <section className="motion-enter relative w-full max-w-[440px]">
        <div className="mb-8">
          <AppLogo
            size="large"
            align="center"
          />
        </div>

        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border-soft)] bg-surface px-6 py-7 shadow-[var(--shadow-lg)] sm:px-9 sm:py-9">
          <header className="mb-8">
            <h1 className="text-[28px] font-semibold tracking-[-0.035em] text-foreground">
              Iniciar sesión
            </h1>

            <p className="mt-2 text-[15px] text-muted-foreground">
              Ingrese sus credenciales.
            </p>
          </header>

          <form
            className="space-y-5"
            onSubmit={handleSubmit}
            noValidate
          >
            <Field
              id="username"
              label="Usuario"
              required
            >
              <Input
                ref={usernameRef}
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);

                  if (errorMessage) {
                    setErrorMessage("");
                  }
                }}
                disabled={isSubmitting}
                placeholder="Usuario"
                autoFocus
              />
            </Field>

            <Field
              id="password"
              label="Contraseña"
              required
            >
              <div className="relative">
                <Input
                  ref={passwordRef}
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);

                    if (errorMessage) {
                      setErrorMessage("");
                    }
                  }}
                  disabled={isSubmitting}
                  placeholder="Contraseña"
                  className="pr-16"
                />

                <button
                  type="button"
                  onClick={() => {
                    setShowPassword((current) => !current);
                    passwordRef.current?.focus();
                  }}
                  disabled={isSubmitting}
                  className="absolute inset-y-0 right-0 flex min-w-14 items-center justify-center rounded-r-[var(--radius-md)] px-3 text-sm font-medium text-primary transition-colors duration-[var(--motion-fast)] hover:bg-[var(--color-primary-soft)] focus-visible:outline-offset-[-3px] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={
                    showPassword
                      ? "Ocultar contraseña"
                      : "Mostrar contraseña"
                  }
                  aria-pressed={showPassword}
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </Field>

            {errorMessage ? (
              <FormError message={errorMessage} />
            ) : null}

            <Button
              type="submit"
              isLoading={isSubmitting}
              loadingText="Ingresando…"
              className="mt-1 w-full"
            >
              Ingresar
            </Button>
          </form>

          <footer className="mt-7 flex items-center justify-center gap-2 border-t border-[var(--color-border-soft)] pt-5 text-xs text-muted-foreground">
            <KeyboardShortcut keys={["Enter"]} />
            <span>Iniciar sesión</span>
          </footer>
        </div>
      </section>
    </main>
  );
}