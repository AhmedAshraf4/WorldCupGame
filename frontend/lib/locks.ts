export type LockReason =
  | "MANUALLY_LOCKED"
  | "NOT_OPEN_YET"
  | "DEADLINE_PASSED"
  | null;

export type LockStatus = {
  lock_key: string;
  lock_name?: string;
  open_at?: string | null;
  deadline_at?: string | null;
  is_locked?: boolean;
  is_open?: boolean;
  reason?: LockReason;
};

export type LockUiState = {
  label: string;
  badgeClass: string;
  icon: "unlock" | "clock" | "lock";
  message: string;
  timerTarget: string | null;
  timerPrefix: string;
  closedText: string;
  isOpen: boolean;
};

export function getLockUiState(lock?: LockStatus | null): LockUiState {
  if (!lock || lock.is_open) {
    return {
      label: "Open",
      badgeClass: "border-green-400/40 bg-green-500/15 text-green-200",
      icon: "unlock",
      message: "Open now",
      timerTarget: lock?.deadline_at || null,
      timerPrefix: "closes in",
      closedText: "Closed",
      isOpen: true,
    };
  }

  if (lock.reason === "NOT_OPEN_YET") {
    return {
      label: "Not open yet",
      badgeClass: "border-yellow-400/40 bg-yellow-500/15 text-yellow-200",
      icon: "clock",
      message: "Opens in",
      timerTarget: lock.open_at || null,
      timerPrefix: "Opens in",
      closedText: "Open now",
      isOpen: false,
    };
  }

  if (lock.reason === "DEADLINE_PASSED") {
    return {
      label: "Deadline passed",
      badgeClass: "border-red-400/40 bg-red-500/15 text-red-200",
      icon: "lock",
      message: "Closed",
      timerTarget: null,
      timerPrefix: "",
      closedText: "Closed",
      isOpen: false,
    };
  }

  return {
    label: "Locked",
    badgeClass: "border-red-400/40 bg-red-500/15 text-red-200",
    icon: "lock",
    message: "Locked by admin",
    timerTarget: null,
    timerPrefix: "",
    closedText: "Locked by admin",
    isOpen: false,
  };
}

export function getLockedButtonLabel(lock?: LockStatus | null) {
  if (!lock || lock.is_open) return "Save";
  if (lock.reason === "NOT_OPEN_YET") return "Not open yet";
  if (lock.reason === "DEADLINE_PASSED") return "Deadline passed";
  return "Locked";
}

export function mapLocksByKey(locks: LockStatus[] = []) {
  return locks.reduce<Record<string, LockStatus>>((accumulator, lock) => {
    accumulator[lock.lock_key] = lock;
    return accumulator;
  }, {});
}
