"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/client";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

export function useAdminGuard() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [checkingAdmin, setCheckingAdmin] = useState(true);

  useEffect(() => {
    async function checkAdmin() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login");
        return;
      }

      setToken(session.access_token);

      const response = await fetch(`${API_BASE_URL}/me`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const profile = await response.json().catch(() => null);

      if (!response.ok) {
        router.replace("/login");
        return;
      }

      if (!profile?.profile?.is_admin) {
        router.replace("/me");
        return;
      }

      setCheckingAdmin(false);
    }

    checkAdmin();
  }, [router]);

  return { token, checkingAdmin };
}
