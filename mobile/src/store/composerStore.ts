import { create } from 'zustand';

/**
 * Multi-step Create Post composer state. Lost on app kill is fine — the
 * composition is meant to be finished in one session. If the user closes
 * the modal mid-flow, reset() is called by the modal's dismissTo handler.
 */
export type Invitee = { id: string; name: string };

export type InteractionType = 'poll' | 'textComment' | 'reaction' | 'rating' | 'like';

/** Mirrors the backend's POLL_MIN_OPTIONS / POLL_MAX_OPTIONS. */
export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 6;

/** Rating is always 1-5 now — no scale choice. */
export const RATING_SCALE = 5;

export function validateInteractions(types: InteractionType[]): string | null {
  if (types.length === 0) return 'Pick at least one interaction type';
  if (new Set(types).size !== types.length) return 'Duplicate interaction types';
  return null;
}

/**
 * Poll answers are valid when there are enough of them, none is blank,
 * and no two are the same. Returns null when the poll is postable.
 * Mirrors the backend's superRefine so the user sees the problem before
 * the round-trip rather than as a 400.
 */
export function validatePollOptions(options: string[]): string | null {
  const filled = options.map((o) => o.trim()).filter((o) => o.length > 0);
  if (filled.length < POLL_MIN_OPTIONS) {
    return `A poll needs at least ${POLL_MIN_OPTIONS} options`;
  }
  if (filled.length > POLL_MAX_OPTIONS) {
    return `A poll can have at most ${POLL_MAX_OPTIONS} options`;
  }
  const lowered = filled.map((o) => o.toLowerCase());
  if (new Set(lowered).size !== lowered.length) {
    return 'Poll options must be unique';
  }
  return null;
}

export type MediaKind = 'image' | 'video' | 'audio' | 'pdf';

/**
 * One picked attachment. `localUri` is what the picker handed us (used for
 * the thumbnail); `mediaId` is the server-side id that only exists once the
 * upload succeeds. ONLY `mediaId` may be sent to the API — posting a
 * `file://` path is what the backend rejects with a 400.
 */
export type MediaAttachment = {
  localId: string;
  kind: MediaKind;
  localUri: string;
  mediaId: string | null;
  url: string | null;
  status: 'uploading' | 'uploaded' | 'error';
  errorMessage?: string;
};

type ComposerState = {
  caption: string;
  attachments: MediaAttachment[];
  interactionTypes: InteractionType[];
  /**
   * Poll answers, in display order. Kept as a fixed-length array of
   * strings (blank entries allowed while typing) so the inputs stay
   * stable as the user edits; blanks are stripped at publish time.
   */
  pollOptions: string[];
  /** Whether one voter may pick several answers. */
  pollMultiSelect: boolean;
  timerMinutes: number | null;
  groupName: string;
  invitees: Invitee[];
  selectedExistingGroupId: string | null;

  setCaption: (v: string) => void;
  addAttachment: (a: MediaAttachment) => boolean;
  updateAttachment: (localId: string, patch: Partial<MediaAttachment>) => void;
  removeAttachment: (localId: string) => void;
  /** Server ids of successfully uploaded files — the only safe thing to POST. */
  uploadedMediaIds: () => string[];
  hasPendingUploads: () => boolean;
  toggleInteraction: (t: InteractionType) => void;
  /** Sets how many answer slots the poll has (clamped to the 2..6 range). */
  setPollOptionCount: (n: number) => void;
  /** Edits one answer slot in place. */
  setPollOption: (index: number, value: string) => void;
  setPollMultiSelect: (v: boolean) => void;
  /** Trimmed, non-empty answers — the only shape safe to POST. */
  filledPollOptions: () => string[];
  setTimer: (m: number) => void;
  setGroupName: (v: string) => void;
  setSelectedExistingGroupId: (id: string | null) => void;
  /**
   * Toggles membership of an invitee in the selected list. If the id is
   * already present, it is removed; otherwise it is appended.
   */
  toggleInvitee: (id: string, name: string) => void;
  reset: () => void;
};

const initial = {
  caption: '',
  attachments: [] as MediaAttachment[],
  interactionTypes: [] as InteractionType[],
  // Two blank slots is the smallest valid poll — the user fills them in
  // rather than having to add rows before they can type anything.
  pollOptions: ['', ''] as string[],
  pollMultiSelect: false,
  timerMinutes: null as number | null,
  groupName: '',
  invitees: [] as Invitee[],
  selectedExistingGroupId: null as string | null,
};

export const useComposerStore = create<ComposerState>((set, get) => ({
  ...initial,
  setCaption: (v) => set({ caption: v }),
  addAttachment: (a) => {
    const cur = get().attachments;
    if (cur.length >= 5) return false;
    set({ attachments: [...cur, a] });
    return true;
  },
  updateAttachment: (localId, patch) =>
    set((s) => ({
      attachments: s.attachments.map((a) => (a.localId === localId ? { ...a, ...patch } : a)),
    })),
  removeAttachment: (localId) =>
    set((s) => ({ attachments: s.attachments.filter((a) => a.localId !== localId) })),
  uploadedMediaIds: () =>
    get()
      .attachments.filter((a) => a.status === 'uploaded' && a.mediaId)
      .map((a) => a.mediaId as string),
  hasPendingUploads: () => get().attachments.some((a) => a.status === 'uploading'),
  toggleInteraction: (t) =>
    set((s) => {
      const has = s.interactionTypes.includes(t);
      if (has) {
        const next = s.interactionTypes.filter((x) => x !== t);
        // Turning the poll off discards its answers — leaving them around
        // would silently re-submit stale options if it were toggled back
        // on later in the same composition.
        if (t === 'poll') {
          return { interactionTypes: next, pollOptions: ['', ''], pollMultiSelect: false };
        }
        return { interactionTypes: next };
      }
      // Poll composes freely with the other interactions — no exclusivity
      // rules remain now that Yes/No is gone.
      return { interactionTypes: [...s.interactionTypes, t] };
    }),
  setPollOptionCount: (n) =>
    set((s) => {
      const target = Math.max(POLL_MIN_OPTIONS, Math.min(POLL_MAX_OPTIONS, n));
      const current = s.pollOptions;
      if (target === current.length) return s;
      if (target < current.length) {
        // Trim from the end — the user's earlier answers are the ones
        // they're most likely to want kept.
        return { pollOptions: current.slice(0, target) };
      }
      return { pollOptions: [...current, ...Array(target - current.length).fill('')] };
    }),
  setPollOption: (index, value) =>
    set((s) => ({
      pollOptions: s.pollOptions.map((o, i) => (i === index ? value : o)),
    })),
  setPollMultiSelect: (v) => set({ pollMultiSelect: v }),
  filledPollOptions: () =>
    get()
      .pollOptions.map((o) => o.trim())
      .filter((o) => o.length > 0),
  setTimer: (m) => set({ timerMinutes: m }),
  setGroupName: (v) => set({ groupName: v }),
  setSelectedExistingGroupId: (id) => set({ selectedExistingGroupId: id }),
  toggleInvitee: (id, name) =>
    set((s) => {
      const present = s.invitees.find((i) => i.id === id);
      return {
        invitees: present
          ? s.invitees.filter((i) => i.id !== id)
          : [...s.invitees, { id, name }],
      };
    }),
  reset: () => set(initial),
}));
