import { create } from 'zustand';

/**
 * Multi-step Create Post composer state. Lost on app kill is fine — the
 * composition is meant to be finished in one session. If the user closes
 * the modal mid-flow, reset() is called by the modal's dismissTo handler.
 */
export type Invitee = { id: string; name: string };

type ComposerState = {
  caption: string;
  mediaIds: string[];
  timerMinutes: number | null;
  groupName: string;
  invitees: Invitee[];

  setCaption: (v: string) => void;
  setTimer: (m: number) => void;
  setGroupName: (v: string) => void;
  /**
   * Toggles membership of an invitee in the selected list. If the id is
   * already present, it is removed; otherwise it is appended.
   */
  toggleInvitee: (id: string, name: string) => void;
  reset: () => void;
};

const initial = {
  caption: '',
  mediaIds: [] as string[],
  timerMinutes: null as number | null,
  groupName: '',
  invitees: [] as Invitee[],
};

export const useComposerStore = create<ComposerState>((set) => ({
  ...initial,
  setCaption: (v) => set({ caption: v }),
  setTimer: (m) => set({ timerMinutes: m }),
  setGroupName: (v) => set({ groupName: v }),
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
