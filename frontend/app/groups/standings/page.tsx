"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomNav } from "@/components/bottomnav";
import { PredictionLockBadge } from "@/components/PredictionLockBadge";
import { WorldCupLoader } from "@/components/WorldCupLoader";
import {
  getLockedButtonLabel,
  mapLocksByKey,
  type LockStatus,
} from "@/lib/locks";
import { supabase } from "@/lib/supabase/client";

import {
  closestCenter,
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";

type Team = {
  id: string;
  name: string;
  flag_url: string | null;
  fifa_rank: number | null;
  fifa_points: number | null;
};

type Group = {
  id: string;
  code: string;
  teams: Team[];
};

type GroupsResponse = {
  count: number;
  data: Group[];
};

type SavedGroupPrediction = {
  group_id: string;
  team_id: string;
  predicted_position: number;
};

type PredictionsResponse = {
  count: number;
  data: SavedGroupPrediction[];
};

function getPositionColor(position: number) {
  if (position === 1 || position === 2) {
    return "bg-green-500 text-white border-green-300/40";
  }

  if (position === 3) {
    return "bg-yellow-400 text-slate-950 border-yellow-200/60";
  }

  return "bg-red-500 text-white border-red-300/40";
}

function PositionBox({ position }: { position: number }) {
  return (
    <div
      className={`flex h-full min-h-[72px] w-12 shrink-0 items-center justify-center rounded-2xl border text-xl font-black shadow-lg ${getPositionColor(
        position
      )}`}
    >
      {position}
    </div>
  );
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

function SortableTeamCard({
  team,
  disabled,
}: {
  team: Team;
  disabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: team.id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`flex flex-1 touch-none items-center justify-between rounded-2xl border p-3 transition ${
        disabled
          ? "border-white/10 bg-black/20 opacity-75"
          :
        isDragging
          ? "z-50 scale-[1.03] border-yellow-300 bg-yellow-400/10 shadow-2xl shadow-yellow-500/20"
          : "border-white/10 bg-black/25"
      }`}
    >
      <div className="flex items-center gap-3">
        {team.flag_url && (
          <img
            src={team.flag_url}
            alt={team.name}
            className="h-10 w-10 rounded-full border border-white/20 object-cover"
          />
        )}

        <div>
          <h3 className="font-black">{team.name}</h3>
          <p className="text-xs text-slate-400">
            Rank #{team.fifa_rank ?? "-"} · {team.fifa_points ?? "-"} pts
          </p>
        </div>
      </div>

      <div className="text-xl text-slate-400">☰</div>
    </div>
  );
}

export default function GroupsPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [predictions, setPredictions] = useState<Record<string, Team[]>>({});
  const [token, setToken] = useState<string | null>(null);
  const [lock, setLock] = useState<LockStatus | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150,
        tolerance: 5,
      },
    })
  );

  useEffect(() => {
    async function loadGroups() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          router.push("/login");
          return;
        }

        setToken(session.access_token);

        const [response, predictionsResponse, locksResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/groups/with-teams`, { cache: "no-store" }),
          fetch(`${API_BASE_URL}/group-predictions`, {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            cache: "no-store",
          }),
          fetch(`${API_BASE_URL}/locks/status`, {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            cache: "no-store",
          }),
        ]);

        if (!response.ok) {
          throw new Error("Failed to load groups");
        }

        if (!predictionsResponse.ok) {
          throw new Error("Failed to load your group predictions");
        }

        const result: GroupsResponse = await response.json();
        const savedResult: PredictionsResponse =
          await predictionsResponse.json();
        const locksJson = await locksResponse.json().catch(() => null);

        setGroups(result.data);
        setLock(mapLocksByKey(locksJson?.data || []).GROUP_STANDINGS || null);

        const initialPredictions: Record<string, Team[]> = {};
        const savedByGroup: Record<string, SavedGroupPrediction[]> = {};

        savedResult.data.forEach((prediction) => {
          if (!savedByGroup[prediction.group_id]) {
            savedByGroup[prediction.group_id] = [];
          }

          savedByGroup[prediction.group_id].push(prediction);
        });

        result.data.forEach((group) => {
          const savedGroupPredictions = savedByGroup[group.id] || [];

          if (savedGroupPredictions.length === 0) {
            initialPredictions[group.id] = group.teams;
            return;
          }

          const teamsById = new Map(
            group.teams.map((team) => [team.id, team])
          );

          const orderedSavedTeams = [...savedGroupPredictions]
            .sort((a, b) => a.predicted_position - b.predicted_position)
            .map((prediction) => teamsById.get(prediction.team_id))
            .filter((team): team is Team => Boolean(team));

          const missingTeams = group.teams.filter(
            (team) =>
              !savedGroupPredictions.some(
                (prediction) => prediction.team_id === team.id
              )
          );

          initialPredictions[group.id] = [
            ...orderedSavedTeams,
            ...missingTeams,
          ];
        });

        setPredictions(initialPredictions);
      } catch {
        setError("Could not load groups. Make sure FastAPI is running.");
      } finally {
        setLoading(false);
      }
    }

    loadGroups();
  }, [router]);

  const isOpen = !lock || lock.is_open;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!isOpen || !over || active.id === over.id) {
      return;
    }

    const activeTeamId = String(active.id);
    const overTeamId = String(over.id);

    const groupEntry = Object.entries(predictions).find(([, teams]) =>
      teams.some((team) => team.id === activeTeamId)
    );

    if (!groupEntry) {
      return;
    }

    const [groupId, groupTeams] = groupEntry;

    const oldIndex = groupTeams.findIndex((team) => team.id === activeTeamId);
    const newIndex = groupTeams.findIndex((team) => team.id === overTeamId);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    setPredictions((current) => ({
      ...current,
      [groupId]: arrayMove(groupTeams, oldIndex, newIndex),
    }));

    setSuccessMessage("");
  }

  async function savePredictions() {
    setSaving(true);
    setError("");
    setSuccessMessage("");

    try {
      if (!token) {
        router.push("/login");
        return;
      }

      if (!isOpen) {
        throw new Error(getLockedButtonLabel(lock));
      }

      const allPredictions = Object.entries(predictions).flatMap(
        ([groupId, teams]) =>
          teams.map((team, index) => ({
            group_id: groupId,
            team_id: team.id,
            predicted_position: index + 1,
          }))
      );

      const response = await fetch(`${API_BASE_URL}/group-predictions/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          predictions: allPredictions,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Failed to save predictions");
      }

      setSuccessMessage("Group predictions saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="wc-page min-h-screen p-4 pb-24 text-white md:p-6">
      <section className="mx-auto max-w-5xl">
        <div className="mb-6">
          <p className="wc-gold mb-2 text-sm font-bold uppercase tracking-[0.2em]">
            Predictions
          </p>

          <h1 className="text-3xl font-black">Group Stage</h1>

          <p className="wc-muted mt-2">
            Drag teams to arrange each group from 1st to 4th. Exact position
            gives 5 points.
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

        {successMessage && (
          <p className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-green-300">
            {successMessage}
          </p>
        )}

        {!loading && <PredictionLockBadge lock={lock} title="Group Standings" />}

        {!loading && !error && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div className="grid gap-5 md:grid-cols-2">
              {groups.map((group) => {
                const groupTeams = predictions[group.id] || [];

                return (
                  <div
                    key={group.id}
                    className={`wc-card p-5 ${
                      groupTeams.length === 0 ? "opacity-40 grayscale" : ""
                    }`}
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <p className="wc-gold text-xs font-bold uppercase tracking-[0.2em]">
                          Group
                        </p>

                        <h2 className="text-3xl font-black">{group.code}</h2>
                      </div>

                      <span className="rounded-full bg-blue-500/20 px-3 py-1 text-xs font-bold text-blue-200">
                        {groupTeams.length}/4 teams
                      </span>
                    </div>

                    {groupTeams.length === 0 && (
                      <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-center">
                        <p className="wc-muted">Teams not added yet.</p>
                      </div>
                    )}

                    <SortableContext
                      items={groupTeams.map((team) => team.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-3">
                        {groupTeams.map((team, index) => (
  <div key={team.id} className="flex items-stretch gap-3">
    <PositionBox position={index + 1} />
    <SortableTeamCard team={team} disabled={!isOpen} />
  </div>
))}
                      </div>
                    </SortableContext>
                  </div>
                );
              })}
            </div>
          </DndContext>
        )}

        {!loading && !error && (
          <button
            onClick={savePredictions}
            disabled={saving || !isOpen}
            className="wc-button mt-6 w-full px-4 py-4 text-lg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? "Saving..."
              : !isOpen
              ? getLockedButtonLabel(lock)
              : "Save Group Predictions"}
          </button>
        )}
      </section>

      <BottomNav />
    </main>
  );
}
