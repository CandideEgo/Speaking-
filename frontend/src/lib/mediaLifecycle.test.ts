import { describe, expect, it } from "vitest";

import { mediaStateFor, youTubeEventFor } from "./mediaLifecycle";

const playing = { paused: false, ended: false };
const paused = { paused: true, ended: false };
const ended = { paused: true, ended: true };

describe("mediaStateFor", () => {
  it("播放/结束/错误是直接映射", () => {
    expect(mediaStateFor("play", paused)).toBe("playing");
    expect(mediaStateFor("ended", playing)).toBe("ended");
    expect(mediaStateFor("error", playing)).toBe("error");
  });

  it("暂停在播完之后是 ended，否则是 paused", () => {
    expect(mediaStateFor("pause", ended)).toBe("ended");
    expect(mediaStateFor("pause", playing)).toBe("paused");
  });

  it("就绪按当前播放态给 paused/playing", () => {
    expect(mediaStateFor("ready", paused)).toBe("paused");
    expect(mediaStateFor("ready", playing)).toBe("playing");
  });

  it("暂停状态下的 waiting 不把界面换成缓冲（只是预取）", () => {
    expect(mediaStateFor("waiting", paused)).toBeNull();
    expect(mediaStateFor("waiting", playing)).toBe("buffering");
  });
});

describe("youTubeEventFor", () => {
  it("IFrame 状态码映射到共同事件；未知状态按旧实现落到 pause", () => {
    expect(youTubeEventFor(1)).toBe("play");
    expect(youTubeEventFor(3)).toBe("waiting");
    expect(youTubeEventFor(0)).toBe("ended");
    expect(youTubeEventFor(2)).toBe("pause");
    expect(youTubeEventFor(5)).toBe("pause");
    expect(youTubeEventFor(undefined)).toBe("pause");
  });
});
