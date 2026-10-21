import { describe, expect, it } from "vitest";
import { dictionaryPreview, partOfSpeechLabel, vocabularySource } from "./vocabularyPresentation";

describe("词汇展示", () => {
  it("词性比例不进入展示，也不按占比猜语境", () => {
    expect(partOfSpeechLabel("v:100")).toBe("动词");
    expect(partOfSpeechLabel("v:15/n:85")).toBe("动词 / 名词");
    expect(partOfSpeechLabel(null)).toBe("");
  });
  it("明确单一词性时优先同词性的已有释义，保留完整词典", () => {
    const raw = "n. 物体；目标\nv. 反对；提出异议";
    expect(dictionaryPreview(raw, null, "v:100")).toEqual({
      summary: "反对",
      full: raw,
      expandable: true,
    });
    expect(dictionaryPreview(null, null).summary).toBe("释义待补充");
  });
  it("有准确定位才承诺原句；无定位不附加 word 或猜时间", () => {
    const word = { video_id: "video", subtitle_id: null, word: "citing" };
    expect(vocabularySource(word, "drill")).toEqual({
      href: "/watch/video?from=drill",
      label: "去来源视频 →",
    });
    const source = vocabularySource({ ...word, subtitle_id: "cue-2" }, "vocabulary")!;
    const url = new URL(source.href, "http://localhost");
    expect(url.searchParams.get("sub")).toBe("cue-2");
    expect(source.label).toBe("去原句 →");
  });
});
