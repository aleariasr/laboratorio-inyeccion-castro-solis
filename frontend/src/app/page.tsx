"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { LoadingState } from "@/components/feedback/loading-state";
import { useAuth } from "@/features/auth/auth-context";

export default function HomePage() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }

    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [router, status]);

  return (
    <LoadingState
      fullScreen
      message="Verificando sesión…"
    />
  );
}