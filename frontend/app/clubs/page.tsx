"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Copy,
  Loader2,
  Plus,
  Shield,
  Users,
} from "lucide-react";

import { BottomNav } from "@/components/bottomnav";
import { WorldCupLoader } from "@/components/WorldCupLoader";
import { supabase } from "@/lib/supabase/client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

type Club = {
  id: string;
  name: string;
  invite_code: string;
  my_role: string;
  members_count: number;
};

type ClubMember = {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profile: {
    id: string;
    display_name: string | null;
    total_points: number | null;
    avatar?: {
      image_url?: string | null;
    } | null;
  } | null;
};

export default function ClubsPage() {
  const [token, setToken] = useState<string | null>(null);

  const [clubs, setClubs] = useState<Club[]>([]);
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [members, setMembers] = useState<ClubMember[]>([]);

  const [newClubName, setNewClubName] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copiedCode, setCopiedCode] = useState("");

  async function loadClubs(accessToken?: string, preferredClubId?: string) {
  const activeToken = accessToken || token;

  if (!activeToken) return;

  const response = await fetch(`${API_BASE_URL}/clubs/my`, {
    headers: {
      Authorization: `Bearer ${activeToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to load clubs");
  }

  const json = await response.json();
  const loadedClubs: Club[] = json.data || [];

  setClubs(loadedClubs);

  if (loadedClubs.length === 0) {
    setSelectedClub(null);
    setMembers([]);
    return;
  }

  const clubToSelect =
    loadedClubs.find((club) => club.id === preferredClubId) ||
    loadedClubs.find((club) => club.id === selectedClub?.id) ||
    loadedClubs[0];

  setSelectedClub(clubToSelect);
  await loadMembers(clubToSelect.id, activeToken);
}

  async function loadMembers(clubId: string, accessToken?: string) {
  const activeToken = accessToken || token;

  if (!activeToken) return;

  try {
    setMembersLoading(true);
    setError("");

    const response = await fetch(`${API_BASE_URL}/clubs/${clubId}/members`, {
      headers: {
        Authorization: `Bearer ${activeToken}`,
      },
      cache: "no-store",
    });

    const json = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(json?.detail || "Failed to load club members");
    }

    setMembers(json.data || []);
  } catch (err) {
    setMembers([]);
    setError(err instanceof Error ? err.message : "Failed to load club members");
  } finally {
    setMembersLoading(false);
  }
}

  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        setError("");

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          window.location.href = "/login";
          return;
        }

        setToken(session.access_token);
        await loadClubs(session.access_token);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }

    init();
  }, []);

  async function createClub() {
    try {
      if (!token) return;

      setCreating(true);
      setError("");
      setSuccess("");

      const response = await fetch(`${API_BASE_URL}/clubs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newClubName,
        }),
      });

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(json?.detail || "Failed to create club");
      }

      setNewClubName("");
      setSuccess("Club created successfully.");

      await loadClubs(token, json.data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setCreating(false);
    }
  }

  async function joinClub() {
    try {
      if (!token) return;

      setJoining(true);
      setError("");
      setSuccess("");

      const response = await fetch(`${API_BASE_URL}/clubs/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          invite_code: inviteCode,
        }),
      });

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(json?.detail || "Failed to join club");
      }

      setInviteCode("");
      setSuccess(json?.message || "Joined club successfully.");

      await loadClubs(token, json.data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setJoining(false);
    }
  }

  function selectClub(club: Club) {
    setSelectedClub(club);
    loadMembers(club.id);
  }

  async function copyInviteCode(code: string) {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);

    setTimeout(() => {
      setCopiedCode("");
    }, 1500);
  }

  return (
    <main className="wc-page min-h-screen pb-28">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-6">
          <p className="wc-muted text-xs font-bold uppercase tracking-[0.3em]">
            Friends League
          </p>
          <h1 className="mt-2 text-3xl font-black text-white">Clubs</h1>
          <p className="mt-2 text-sm text-slate-400">
            Create a private club or join your friends with an invite code.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-semibold text-red-200">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 flex items-center gap-2 rounded-2xl border border-green-500/30 bg-green-500/10 p-3 text-sm font-semibold text-green-200">
            <CheckCircle2 className="h-4 w-4" />
            {success}
          </div>
        )}

        <div className="mb-5 grid grid-cols-1 gap-4">
          <section className="wc-card">
            <div className="mb-3 flex items-center gap-2">
              <Plus className="h-5 w-5 text-blue-300" />
              <h2 className="text-lg font-black text-white">Create Club</h2>
            </div>

            <input
              value={newClubName}
              onChange={(event) => setNewClubName(event.target.value)}
              placeholder="Example: Friday Football Crew"
              className="mb-3 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-blue-400"
            />

            <button
              onClick={createClub}
              disabled={creating || newClubName.trim().length < 3}
              className="wc-button w-full disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? (
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              ) : (
                "Create Club"
              )}
            </button>
          </section>

          <section className="wc-card">
            <div className="mb-3 flex items-center gap-2">
              <Shield className="h-5 w-5 text-yellow-300" />
              <h2 className="text-lg font-black text-white">Join Club</h2>
            </div>

            <input
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
              placeholder="Enter invite code"
              className="mb-3 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold uppercase tracking-widest text-white outline-none placeholder:text-slate-500 focus:border-blue-400"
            />

            <button
              onClick={joinClub}
              disabled={joining || inviteCode.trim().length === 0}
              className="wc-button-gold w-full disabled:cursor-not-allowed disabled:opacity-50"
            >
              {joining ? (
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              ) : (
                "Join Club"
              )}
            </button>
          </section>
        </div>

        <section className="mb-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-black text-white">My Clubs</h2>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-300">
              {clubs.length}
            </span>
          </div>

          {loading ? (
            <div className="py-8">
              <WorldCupLoader />
            </div>
          ) : clubs.length === 0 ? (
            <div className="wc-card py-8 text-center">
              <Users className="mx-auto mb-3 h-8 w-8 text-slate-500" />
              <p className="font-bold text-white">No clubs yet</p>
              <p className="mt-1 text-sm text-slate-400">
                Create one or join your friends.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {clubs.map((club) => {
                const isSelected = selectedClub?.id === club.id;

                return (
                  <div
                    key={club.id}
                    onClick={() => selectClub(club)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        selectClub(club);
                      }
                    }}
                    className={`w-full cursor-pointer rounded-3xl border p-4 text-left transition ${
                      isSelected
                        ? "border-blue-400 bg-blue-500/15"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-black text-white">
                          {club.name}
                        </h3>

                        <p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-400">
                          {club.my_role}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-white/10 px-3 py-2 text-xs font-bold text-slate-200">
                        {club.members_count} members
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-950/60 px-3 py-2">
                      <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                        Code
                      </span>

                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-black tracking-widest text-yellow-300">
                          {club.invite_code}
                        </span>

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            copyInviteCode(club.invite_code);
                          }}
                          className="rounded-xl bg-white/10 p-2 text-white hover:bg-white/15"
                        >
                          {copiedCode === club.invite_code ? (
                            <CheckCircle2 className="h-4 w-4 text-green-300" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {selectedClub && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-black text-white">
                {selectedClub.name} Members
              </h2>
            </div>

            {membersLoading ? (
              <div className="wc-card flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-300" />
              </div>
            ) : members.length === 0 ? (
              <div className="wc-card py-8 text-center">
                <Users className="mx-auto mb-3 h-8 w-8 text-slate-500" />
                <p className="font-bold text-white">No members found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {members.map((member, index) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-white/10 text-sm font-black text-white">
                        {index + 1}
                      </div>

                      {member.profile?.avatar?.image_url ? (
                        <img
                          src={member.profile.avatar.image_url}
                          alt={member.profile.display_name || "Avatar"}
                          className="h-11 w-11 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-11 w-11 rounded-full bg-white/10" />
                      )}

                      <div>
                        <p className="font-black text-white">
                          {member.profile?.display_name || "Unknown Player"}
                        </p>
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                          {member.role}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-lg font-black text-yellow-300">
                        {member.profile?.total_points ?? 0}
                      </p>
                      <p className="text-xs font-bold text-slate-500">PTS</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      <BottomNav />
    </main>
  );
}
