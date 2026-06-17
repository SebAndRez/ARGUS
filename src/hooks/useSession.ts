"use client";

import { useEffect, useState } from "react";
import type { SessionUser } from "@/types/crisis";

interface SessionState {
  user: SessionUser | null;
  loading: boolean;
}

export function useSession() {
  const [session, setSession] = useState<SessionState>({ user: null, loading: true });

  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await res.json();
        setSession({ user: data.user, loading: false });
      } catch {
        setSession({ user: null, loading: false });
      }
    }
    fetchSession();
  }, []);

  return session;
}
