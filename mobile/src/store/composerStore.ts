import { create } from 'zustand';

/**
 * Multi-step Create Post composer state. Lost on app kill is fine — the
 * composition is meant to be finished in one session. If the user closes
 * the modal mid-flow, reset() is called by the modal's dismissTo handler.
 */
export type Invitee = { id: string; name: string };

export type InteractionType = 'yesNo' | 'textComment' | 'reaction' | 'rating' | 'like';

export function validateInteractions(types: InteractionType[]): string | null {
  if (types.length === 0) return 'Pick at least one interaction type';
  if (types.includes('yesNo') && types.includes('rating')) return 'Yes/No and Rating cannot be used together';
  if (new Set(types).size !== types.length) return 'Duplicate interaction types';
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
  ratingScale: 5 | 10 | null;
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
  setRatingScale: (s: 5 | 10) => void;
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
  ratingScale: null as 5 | 10 | null,
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
      let next: InteractionType[];
      if (has) {
        next = s.interactionTypes.filter((x) => x !== t);
        // if rating removed, clear scale
        if (t === 'rating') return { interactionTypes: next, ratingScale: null };
        return { interactionTypes: next };
      }
      // enforce yesNo ↔ rating exclusivity
      if (t === 'yesNo' && s.interactionTypes.includes('rating')) return s;
      if (t === 'rating' && s.interactionTypes.includes('yesNo')) return s;
      next = [...s.interactionTypes, t];
      if (t === 'rating' && s.ratingScale == null) return { interactionTypes: next, ratingScale: 5 };
      return { interactionTypes: next };
    }),
  setRatingScale: (s) => set({ ratingScale: s }),
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
