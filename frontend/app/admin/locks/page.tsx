"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  Loader2,
  Lock,
  Save,
  Shield,
  Unlock,
} from "lucide-react";

import { BottomNav } from "@/components/bottomnav";
import { WorldCupLoader } from "@/components/WorldCupLoader";
import { supabase } from "@/lib/supabase/client";
import { useAdminGuard } from "@/lib/useAdminGuard";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

type PredictionLock = {
  id: string;
  lock_key: string;
  lock_name: string;
  open_at?: string | null;
  deadline_at?: string | null;
  is_locked: boolean;
  is_open?: boolean;
  reason?: string | null;
  created_at?: string;
  updated_at?: string;
};

type EditableLock = {
  open_at: string;
  deadline_at: string;
  is_locked: boolean;
};

function isoToDatetimeLocal(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  const localDate = new Date(date.getTime() - timezoneOffset);

  return localDate.toISOString().slice(0, 16);
}

function datetimeLocalToIso(value: string) {
  if (!value) return null;

  return new Date(value).toISOString();
}

function getStatus(lock: PredictionLock) {
  const matchDeadlineManaged = isMatchDeadlineManagedLock(lock.lock_key);

  if (lock.is_locked) {
    return {
      label: "Manually Locked",
      className: "border-red-400/40 bg-red-500/15 text-red-200",
      icon: Lock,
    };
  }

  if (lock.reason === "NOT_OPEN_YET") {
    return {
      label: "Not Open Yet",
      className: "border-yellow-400/40 bg-yellow-500/15 text-yellow-200",
      icon: Clock,
    };
  }

  if (lock.reason === "DEADLINE_PASSED" && !matchDeadlineManaged) {
    return {
      label: "Deadline Passed",
      className: "border-red-400/40 bg-red-500/15 text-red-200",
      icon: Lock,
    };
  }

  return {
    label: "Open",
    className: "border-green-400/40 bg-green-500/15 text-green-200",
    icon: Unlock,
  };
}

function getCategory(lockKey: string) {
  if (lockKey.startsWith("KNOCKOUT_PREDICTIONS")) return "Knockout Predictions";
  if (lockKey.startsWith("KNOCKOUT_WILDCARD")) return "Knockout Wildcards";
  if (lockKey.startsWith("GROUP")) return "Groups";
  if (lockKey.startsWith("CHAMPION")) return "Champion";

  return "Other";
}

function isMatchDeadlineManagedLock(lockKey: string) {
  return (
    lockKey.startsWith("GROUP_MATCHDAY_") ||
    lockKey.startsWith("KNOCKOUT_PREDICTIONS") ||
    lockKey.startsWith("KNOCKOUT_WILDCARD")
  );
}

export default function AdminLocksPage() {
  const router = useRouter();
  const { checkingAdmin } = useAdminGuard();

  const [token, setToken] = useState<string | null>(null);
  const [locks, setLocks] = useState<PredictionLock[]>([]);
  const [editableLocks, setEditableLocks] = useState<Record<string, EditableLock>>(
    {}
  );

  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadLocks() {
    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
        return;
      }

      setToken(session.access_token);

      const response = await fetch(`${API_BASE_URL}/admin/locks`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(json?.detail || "Failed to load prediction locks");
      }

      const loadedLocks: PredictionLock[] = json.data || [];

      setLocks(loadedLocks);

      const nextEditableLocks: Record<string, EditableLock> = {};

      loadedLocks.forEach((lock) => {
        nextEditableLocks[lock.lock_key] = {
          open_at: isoToDatetimeLocal(lock.open_at),
          deadline_at: isoToDatetimeLocal(lock.deadline_at),
          is_locked: lock.is_locked,
        };
      });

      setEditableLocks(nextEditableLocks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (checkingAdmin) return;

    void Promise.resolve().then(loadLocks);
  }, [checkingAdmin]);

  const groupedLocks = useMemo(() => {
    const grouped: Record<string, PredictionLock[]> = {};

    locks.forEach((lock) => {
      const category = getCategory(lock.lock_key);

      if (!grouped[category]) {
        grouped[category] = [];
      }

      grouped[category].push(lock);
    });

    return grouped;
  }, [locks]);

  function updateEditableLock(
    lockKey: string,
    field: keyof EditableLock,
    value: string | boolean
  ) {
    setEditableLocks((previous) => ({
      ...previous,
      [lockKey]: {
        ...previous[lockKey],
        [field]: value,
      },
    }));
  }

  async function saveLock(lock: PredictionLock) {
    try {
      if (!token) {
        router.push("/login");
        return;
      }

      const editable = editableLocks[lock.lock_key];
      const matchDeadlineManaged = isMatchDeadlineManagedLock(lock.lock_key);

      if (!editable) return;

      setSavingKey(lock.lock_key);
      setError("");
      setSuccess("");

      const response = await fetch(`${API_BASE_URL}/admin/locks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          lock_key: lock.lock_key,
          open_at: datetimeLocalToIso(editable.open_at),
          deadline_at: matchDeadlineManaged
            ? null
            : datetimeLocalToIso(editable.deadline_at),
          is_locked: editable.is_locked,
        }),
      });

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(json?.detail || "Failed to update prediction lock");
      }

      setSuccess(`${lock.lock_name} updated successfully.`);
      await loadLocks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSavingKey(null);
    }
  }

  function clearTimes(lockKey: string) {
    setEditableLocks((previous) => ({
      ...previous,
      [lockKey]: {
        ...previous[lockKey],
        open_at: "",
        deadline_at: "",
      },
    }));
  }

  if (checkingAdmin) {
    return (
      <main className="wc-page flex min-h-screen items-center justify-center p-6 text-white">
        <WorldCupLoader />
      </main>
    );
  }

  return (
    <main className="wc-page min-h-screen p-4 pb-28 text-white md:p-6">
      <section className="mx-auto max-w-6xl">
        <div className="mb-6 text-center">
          <p className="wc-gold mb-2 text-sm font-bold uppercase tracking-[0.25em]">
            Admin
          </p>

          <h1 className="text-3xl font-black md:text-5xl">
            Prediction Locks
          </h1>

          <p className="wc-muted mt-2">
            Control when each prediction opens, closes, or gets manually locked.
          </p>
        </div>

        {loading && (
          <div className="py-8">
            <WorldCupLoader />
          </div>
        )}

        {error && (
          <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-300">
            {error}
          </p>
        )}

        {success && (
          <p className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-green-300">
            <CheckCircle2 className="h-4 w-4" />
            {success}
          </p>
        )}

        {!loading && (
          <div className="space-y-6">
            {Object.entries(groupedLocks).map(([category, categoryLocks]) => (
              <div key={category} className="wc-card p-5">
                <h2 className="mb-4 flex items-center gap-2 text-2xl font-black">
                  <Shield className="h-6 w-6 text-blue-300" />
                  {category}
                </h2>

                <div className="grid gap-4 md:grid-cols-2">
                  {categoryLocks.map((lock) => {
                    const editable = editableLocks[lock.lock_key];
                    const status = getStatus(lock);
                    const StatusIcon = status.icon;
                    const isSaving = savingKey === lock.lock_key;
                    const matchDeadlineManaged = isMatchDeadlineManagedLock(
                      lock.lock_key
                    );

                    if (!editable) return null;

                    return (
                      <div
                        key={lock.lock_key}
                        className="rounded-3xl border border-white/10 bg-black/25 p-4"
                      >
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-black">
                              {lock.lock_name}
                            </h3>

                            <p className="wc-muted mt-1 break-all text-xs">
                              {lock.lock_key}
                            </p>
                          </div>

                          <span
                            className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-black ${status.className}`}
                          >
                            <StatusIcon className="h-3.5 w-3.5" />
                            {status.label}
                          </span>
                        </div>

                        <div className="grid gap-3">
                          <label className="grid gap-2">
                            <span className="text-sm font-bold text-slate-300">
                              Open At
                            </span>

                            <input
                              type="datetime-local"
                              value={editable.open_at}
                              onChange={(event) =>
                                updateEditableLock(
                                  lock.lock_key,
                                  "open_at",
                                  event.target.value
                                )
                              }
                              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-blue-400"
                            />
                          </label>

                          {matchDeadlineManaged ? (
                            <div className="rounded-2xl border border-blue-400/20 bg-blue-500/10 p-4 text-sm font-semibold text-blue-100">
                              Deadline is automatic: each game closes at its
                              own kickoff time.
                            </div>
                          ) : (
                            <label className="grid gap-2">
                              <span className="text-sm font-bold text-slate-300">
                                Deadline At
                              </span>

                              <input
                                type="datetime-local"
                                value={editable.deadline_at}
                                onChange={(event) =>
                                  updateEditableLock(
                                    lock.lock_key,
                                    "deadline_at",
                                    event.target.value
                                  )
                                }
                                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-blue-400"
                              />
                            </label>
                          )}

                          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                            <input
                              type="checkbox"
                              checked={editable.is_locked}
                              onChange={(event) =>
                                updateEditableLock(
                                  lock.lock_key,
                                  "is_locked",
                                  event.target.checked
                                )
                              }
                            />

                            <span className="font-bold">Manual Lock</span>
                          </label>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <button
                            onClick={() => clearTimes(lock.lock_key)}
                            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-bold text-white hover:bg-white/10"
                          >
                            Clear Times
                          </button>

                          <button
                            onClick={() => saveLock(lock)}
                            disabled={isSaving}
                            className="wc-button flex items-center justify-center gap-2 px-4 py-3 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isSaving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4" />
                            )}
                            Save
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <BottomNav />
    </main>
  );
}
