import { create } from "zustand";
import { api } from "@/lib/api";
import type { AvatarGender } from "@/lib/avatar";

// ── Types ────────────────────────────────────────────────────────────────

/** The `/users/me` fields the JWT does not carry and the Avatar needs. */
export interface MeProfile {
  /** Uploaded avatar URL; null = the user has none. */
  url: string | null;
  /** The user's gender — decides the built-in default face (DEC-048). */
  gender: AvatarGender | null;
}

interface ProfileState {
  /** `undefined` = not answered yet, so Avatar renders its skeleton. */
  me: MeProfile | undefined;
}

interface ProfileActions {
  /** Fetch once per session; de-duplicated while in flight. */
  fetchMe: () => Promise<void>;
  /** Publish a `/users/me` payload the caller already holds (the profile page). */
  setMe: (me: MeProfile) => void;
  /** Drop the cache (called on logout). */
  reset: () => void;
}

// ── Store ────────────────────────────────────────────────────────────────
// TopBar and the profile page each fetched `/users/me` and kept their own copy of
// `avatar_url` / `gender`, so setting a gender on the profile page left the top bar
// showing the previous face until a reload. One cache now: whoever holds fresh data
// writes it (the profile page — its PATCH returns the whole user), everyone reads it.
//
// `me` is all-or-nothing on purpose: url and gender travel together so the face can
// never be half-resolved (url settled, gender still provisional).
//
// The cache belongs to one signed-in user: `authStore.login()` drops it when the JWT
// subject changes and `logout()` resets it, so the "already answered" guard in `fetchMe`
// cannot hand someone the previous user's face.

/** In-flight request, shared so N consumers mounting together still cause one fetch. */
let inflight: Promise<void> | null = null;
/** Bumped by reset()/setMe() so a response that a newer write has superseded is dropped. */
let generation = 0;

export const useProfileStore = create<ProfileState & ProfileActions>((set, get) => ({
  me: undefined,

  async fetchMe() {
    if (get().me !== undefined) return;
    if (!inflight) {
      const gen = generation;
      inflight = api<{ avatar_url?: string | null; gender?: AvatarGender | null }>(
        "/api/v1/users/me"
      )
        .then((u) => {
          if (gen !== generation) return;
          set({ me: { url: u.avatar_url ?? null, gender: u.gender ?? null } });
        })
        .catch(() => {
          // A failed fetch resolves to "no upload" rather than staying `undefined`,
          // which would leave the skeleton pulsing for the rest of the session.
          if (gen !== generation) return;
          set({ me: { url: null, gender: null } });
        })
        .finally(() => {
          if (gen === generation) inflight = null;
        });
    }
    return inflight;
  },

  setMe(me) {
    // A write beats a read that started earlier: retiring the in-flight request keeps a
    // stale `/users/me` response from landing on top of fresher data.
    generation += 1;
    inflight = null;
    set({ me });
  },

  reset() {
    generation += 1;
    inflight = null;
    set({ me: undefined });
  },
}));
