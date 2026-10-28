import { watchHref, watchSentenceHref, type WatchSource } from "@/lib/watchEntry";
import type { VocabularyWord } from "@/types";

const POS: Record<string, string> = {
  v: "动词",
  vt: "及物动词",
  vi: "不及物动词",
  n: "名词",
  adj: "形容词",
  a: "形容词",
  // ECDICT 的 pos 字段用单字母缩写（j:100 = 纯形容词，r:100 = 纯副词），
  // 与词典行里的 a./adv. 写法不同；不映射这些字母，词性列就会整列显示「—」。
  j: "形容词",
  r: "副词",
  adv: "副词",
  ad: "副词",
  i: "介词",
  prep: "介词",
  p: "代词",
  pron: "代词",
  d: "限定词",
  m: "数词",
  num: "数词",
  c: "连词",
  conj: "连词",
  u: "感叹词",
  int: "感叹词",
  art: "冠词",
  aux: "助动词",
};

/** 只呈现词典提供的词性，不将词频比例误作词义或语境判断。 */
export function partOfSpeechLabel(raw: string | null | undefined): string {
  return [
    ...new Set((raw?.toLowerCase().match(/[a-z]+/g) ?? []).map((p) => POS[p]).filter(Boolean)),
  ].join(" / ");
}

export function dictionaryPreview(
  translation: string | null,
  definition: string | null,
  pos?: string | null
) {
  const raw = translation || definition || "";
  const lines = raw
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  // 单一词性可筛选同词性的词典行；多词性时不凭比例猜当前语境。
  const keys = pos?.toLowerCase().match(/[a-z]+/g) ?? [];
  const selected = keys.length === 1 ? lines.find((line) => line.startsWith(`${keys[0]}.`)) : null;
  const line = (selected || lines[0] || "释义待补充").replace(/^([a-z]+)\.\s*/i, "");
  const concise = line
    .split(/[;；\n]/)[0]
    .split(/[,，]/)
    .slice(0, 2)
    .join("，")
    .replaceAll("[计]", "（计算机）")
    .replaceAll("[建]", "（建筑）");
  return { summary: concise, full: raw, expandable: raw !== concise && !!raw };
}

export function vocabularySource(
  word: Pick<VocabularyWord, "video_id" | "subtitle_id" | "word">,
  from: WatchSource
) {
  if (!word.video_id) return null;
  const subtitleId = word.subtitle_id?.trim();
  return {
    href: subtitleId
      ? watchSentenceHref(word.video_id, { from }, { subtitleId, word: word.word })
      : watchHref(word.video_id, { from }),
    label: subtitleId ? "去原句 →" : "去来源视频 →",
  };
}
