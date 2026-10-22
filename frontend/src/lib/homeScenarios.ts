import type { VideoLearningMetadata } from "@/hooks/useVideoMetadata";
import type {
  HomeEditorialContent,
  HomeEditorialScenario,
  HomeEditorialScenarioSlot,
  HomeEditorialSentence,
} from "@/types/homeContent";

export interface HomeScenarioCard {
  key: string;
  scenario: HomeEditorialScenario;
  videoId: string;
  kind: "scenario" | "subtitle";
}

function validSentence(sentence: HomeEditorialSentence | null): sentence is HomeEditorialSentence {
  return Boolean(
    sentence?.subtitle_id &&
    sentence.text_en.trim() &&
    Number.isFinite(sentence.start_time) &&
    Number.isFinite(sentence.end_time) &&
    sentence.start_time >= 0 &&
    sentence.end_time > sentence.start_time
  );
}

/** 学习元数据里的一句话样本（真实字幕锚点），供今日任务与场景卡共用。 */
export function sentenceFromMetadata(
  metadata: VideoLearningMetadata | undefined
): HomeEditorialSentence | null {
  if (!metadata?.sample_subtitle_id) return null;
  const sentence: HomeEditorialSentence = {
    subtitle_id: metadata.sample_subtitle_id,
    sentence_index: 0,
    text_en: metadata.sample_text_en ?? "",
    text_zh: metadata.sample_text_zh,
    start_time: metadata.sample_start_time ?? NaN,
    end_time: metadata.sample_end_time ?? NaN,
  };
  return validSentence(sentence) ? sentence : null;
}

/** 场景只属于当前主推版本。换视频时跟随新版本；无编辑场景则练真实字幕，不补通用例句。 */
export function homeScenarioCards({
  videoId,
  scenarios,
  content,
  metadata,
}: {
  videoId: string;
  scenarios: HomeEditorialScenarioSlot[];
  content?: HomeEditorialContent;
  metadata?: VideoLearningMetadata;
}): HomeScenarioCard[] {
  if (content && content.video_id !== videoId) return [];
  if (content) {
    const selectedIds = scenarios
      .filter(
        (slot) =>
          slot.video.id === videoId && slot.content_revision_id === content.content_revision_id
      )
      .map((slot) => slot.scenario_id);
    const available = content.scenarios.filter((scenario) => validSentence(scenario.sentence));
    const ordered = selectedIds.length
      ? selectedIds.flatMap((id) => available.filter((scenario) => scenario.id === id))
      : available;
    if (ordered.length)
      return ordered.slice(0, 1).map((scenario) => ({
        key: `${videoId}:${content.content_revision_id}:${scenario.id}`,
        scenario,
        videoId,
        kind: "scenario",
      }));
  }

  const sentences = content?.expressions.map((expression) => expression.sentence) ?? [];
  const sample = sentenceFromMetadata(metadata);
  if (sample) sentences.push(sample);
  const seen = new Set<string>();
  return sentences
    .filter(validSentence)
    .filter((sentence) => {
      if (seen.has(sentence.subtitle_id)) return false;
      seen.add(sentence.subtitle_id);
      return true;
    })
    .slice(0, 1)
    .map((sentence) => ({
      key: `${videoId}:${sentence.subtitle_id}`,
      videoId,
      kind: "subtitle",
      scenario: {
        id: sentence.subtitle_id,
        situation_zh: "练一句原话",
        prompt_zh: sentence.text_zh
          ? `想表达「${sentence.text_zh}」，你会怎么说？也可以换成自己的情境。`
          : "听一句原话，试着用同样的意思说一遍。",
        reply_en: sentence.text_en,
        reply_zh: sentence.text_zh ?? "",
        sentence,
      },
    }));
}
