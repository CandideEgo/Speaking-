import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));

import { api } from "@/lib/api";
import { useProfileStore } from "@/stores/profileStore";

const mockedApi = vi.mocked(api);

/** Resolve by hand so a test can observe the store while the request is in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("useProfileStore", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useProfileStore.getState().reset();
  });

  it("publishes avatar_url + gender from /users/me", async () => {
    mockedApi.mockResolvedValue({ avatar_url: "/media/a.webp", gender: "female" });
    await useProfileStore.getState().fetchMe();
    expect(useProfileStore.getState().me).toEqual({ url: "/media/a.webp", gender: "female" });
    expect(mockedApi).toHaveBeenCalledWith("/api/v1/users/me");
  });

  it("maps missing fields to nulls (no upload, no gender filled in)", async () => {
    mockedApi.mockResolvedValue({});
    await useProfileStore.getState().fetchMe();
    expect(useProfileStore.getState().me).toEqual({ url: null, gender: null });
  });

  it('resolves to "no upload" when the fetch fails, so the skeleton cannot stick', async () => {
    mockedApi.mockRejectedValue(new Error("500"));
    await useProfileStore.getState().fetchMe();
    expect(useProfileStore.getState().me).toEqual({ url: null, gender: null });
  });

  it("fetches once — a later call is a no-op once answered", async () => {
    mockedApi.mockResolvedValue({ gender: "male" });
    await useProfileStore.getState().fetchMe();
    await useProfileStore.getState().fetchMe();
    expect(mockedApi).toHaveBeenCalledTimes(1);
  });

  it("de-duplicates concurrent callers into a single request", async () => {
    const d = deferred<{ gender: "female" }>();
    mockedApi.mockReturnValue(d.promise);
    const first = useProfileStore.getState().fetchMe();
    const second = useProfileStore.getState().fetchMe();
    expect(mockedApi).toHaveBeenCalledTimes(1);
    d.resolve({ gender: "female" });
    await Promise.all([first, second]);
    expect(useProfileStore.getState().me).toEqual({ url: null, gender: "female" });
  });

  it("publishes whatever the profile page just PATCHed", () => {
    useProfileStore.getState().setMe({ url: null, gender: "male" });
    expect(useProfileStore.getState().me).toEqual({ url: null, gender: "male" });
  });

  it("drops a response that lands after logout instead of showing the previous user's face", async () => {
    const d = deferred<{ gender: "male" }>();
    mockedApi.mockReturnValue(d.promise);
    const pending = useProfileStore.getState().fetchMe();
    useProfileStore.getState().reset();
    d.resolve({ gender: "male" });
    await pending;
    expect(useProfileStore.getState().me).toBeUndefined();
  });

  it("fetches again after reset (the next user gets their own face)", async () => {
    mockedApi.mockResolvedValue({ gender: "male" });
    await useProfileStore.getState().fetchMe();
    useProfileStore.getState().reset();
    await useProfileStore.getState().fetchMe();
    expect(mockedApi).toHaveBeenCalledTimes(2);
  });
});
