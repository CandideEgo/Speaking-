"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, RefreshCw, Save } from "lucide-react";

import {
  getVideoDetail,
  recomputeWordLevels,
  updateSubtitle,
  updateVideo,
} from "@/lib/adminData";
import { WordLevelsEditor } from "./WordLevelsEditor";
import { VideoStatusBadge } from "@/components/video/VideoStatus";
import type { Subtitle, VideoWithSubtitles } from "@/types";

const DIFFICULTY_OPTIONS = ["A1", "A2", "B1", "B2", "C1", "C2"];

export default function VideoEditPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [video, setVideo] = useState<VideoWithSubtitles | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await getVideoDetail(params.id);
        if (!cancelled) setVideo(v);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "加载视频失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const handleRecomputeAll = useCallback(async () => {
    try {
      const res = await recomputeWordLevels(params.id);
      toast.success(
        `已重算 ${res.subtitles_updated} 条字幕的高亮（${res.exam_words_found} 个考级词）`,
      );
      const v = await getVideoDetail(params.id);
      setVideo(v);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "重算失败");
    }
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }
  if (!video) {
    return (
      <div className="py-20 text-center text-muted-foreground">视频未找到</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/admin/videos")}
          className="btn-outline !py-1 !px-2 text-xs inline-flex items-center gap-1"
        >
          <ArrowLeft size={12} />
          返回列表
        </button>
        <h1 className="text-lg font-semibold truncate">{video.title}</h1>
        <VideoStatusBadge status={video.status} />
      </div>

      <MetadataForm video={video} onChanged={setVideo} />

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">字幕编辑</h2>
        <button
          onClick={handleRecomputeAll}
          className="btn-secondary !py-1 !px-2 text-xs inline-flex items-center gap-1"
          title="用 ECDICT 重新计算所有字幕的单词高亮（覆盖手动标注）"
        >
          <RefreshCw size={12} />
          重算全部高亮
        </button>
      </div>

      <div className="space-y-3">
        {video.subtitles.length === 0 && (
          <div className="text-center text-muted-foreground py-8 text-sm">
            暂无字幕（视频可能仍在处理中）
          </div>
        )}
        {video.subtitles.map((sub) => (
          <SubtitleEditRow
            key={sub.id}
            videoId={video.id}
            subtitle={sub}
            onChanged={(updated) =>
              setVideo({
                ...video,
                subtitles: video.subtitles.map((s) =>
                  s.id === updated.id ? updated : s,
                ),
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metadata form — title / difficulty / tags / official / featured / published
// ---------------------------------------------------------------------------

function MetadataForm({
  video,
  onChanged,
}: {
  video: VideoWithSubtitles;
  onChanged: (v: VideoWithSubtitles) => void;
}) {
  const [title, setTitle] = useState(video.title);
  const [difficulty, setDifficulty] = useState(video.difficulty_level || "");
  const [topicTags, setTopicTags] = useState(video.topic_tags || "");
  const [isOfficial, setIsOfficial] = useState(video.is_official);
  const [isFeatured, setIsFeatured] = useState(
    "is_featured" in video ? (video.is_featured as boolean) : false,
  );
  const [isPublished, setIsPublished] = useState(video.is_published);
  const [adminNotes, setAdminNotes] = useState(
    "admin_notes" in video ? ((video.admin_notes as string | null) ?? "") : "",
  );
  const [saving, setSaving] = useState(false);

  const canPublish = video.status === "ready";

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updateVideo(video.id, {
        title,
        difficulty_level: difficulty || null,
        topic_tags: topicTags || null,
        is_official: isOfficial,
        is_featured: isFeatured,
        is_published: isPublished,
        admin_notes: adminNotes || null,
      });
      onChanged({ ...video, ...updated, subtitles: video.subtitles });
      toast.success("已保存");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="card-outline p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            标题
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            难度
          </label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="input-field"
          >
            <option value="">未设置</option>
            {DIFFICULTY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            标签
          </label>
          <input
            type="text"
            value={topicTags}
            onChange={(e) => setTopicTags(e.target.value)}
            placeholder="逗号分隔"
            className="input-field"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            备注
          </label>
          <input
            type="text"
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            className="input-field"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={isOfficial}
            onChange={(e) => setIsOfficial(e.target.checked)}
          />
          官方
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={isFeatured}
            onChange={(e) => setIsFeatured(e.target.checked)}
          />
          精选
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={isPublished}
            disabled={!canPublish && !isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
          />
          已发布
          {!canPublish && !isPublished && (
            <span className="text-xs text-muted-foreground">
              （需 status=ready）
            </span>
          )}
        </label>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="btn-primary !py-2 !px-4 text-xs inline-flex items-center gap-1"
        >
          {saving ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Save size={12} />
          )}
          保存元数据
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Subtitle row — inline edit of text/timing + word_levels editor
// ---------------------------------------------------------------------------

function SubtitleEditRow({
  videoId,
  subtitle,
  onChanged,
}: {
  videoId: string;
  subtitle: Subtitle;
  onChanged: (s: Subtitle) => void;
}) {
  const [textEn, setTextEn] = useState(subtitle.text_en);
  const [textZh, setTextZh] = useState(subtitle.text_zh || "");
  const [startTime, setStartTime] = useState(String(subtitle.start_time));
  const [endTime, setEndTime] = useState(String(subtitle.end_time));
  const [grammarNote, setGrammarNote] = useState(subtitle.grammar_note || "");
  const [saving, setSaving] = useState(false);
  const [editingLevels, setEditingLevels] = useState(false);

  const dirty =
    textEn !== subtitle.text_en ||
    textZh !== (subtitle.text_zh || "") ||
    startTime !== String(subtitle.start_time) ||
    endTime !== String(subtitle.end_time) ||
    grammarNote !== (subtitle.grammar_note || "");

  const handleSave = async () => {
    setSaving(true);
    try {
      const start = parseFloat(startTime);
      const end = parseFloat(endTime);
      const updated = await updateSubtitle(videoId, subtitle.id, {
        text_en: textEn,
        text_zh: textZh || null,
        start_time: Number.isFinite(start) ? start : undefined,
        end_time: Number.isFinite(end) ? end : undefined,
        grammar_note: grammarNote || null,
      });
      onChanged(updated);
      // text_en may have triggered a word_levels recompute — sync local fields.
      setTextEn(updated.text_en);
      setTextZh(updated.text_zh || "");
      setStartTime(String(updated.start_time));
      setEndTime(String(updated.end_time));
      setGrammarNote(updated.grammar_note || "");
      toast.success("已保存");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-outline p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>#{subtitle.sentence_index + 1}</span>
        <span>
          · {subtitle.start_time.toFixed(1)}s – {subtitle.end_time.toFixed(1)}s
        </span>
        <button
          type="button"
          onClick={() => setEditingLevels((v) => !v)}
          className="btn-outline !py-0.5 !px-1.5 text-[10px] ml-auto"
        >
          {editingLevels ? "收起高亮" : "编辑高亮"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <input
          type="text"
          value={textEn}
          onChange={(e) => setTextEn(e.target.value)}
          placeholder="英文"
          className="input-field"
        />
        <input
          type="text"
          value={textZh}
          onChange={(e) => setTextZh(e.target.value)}
          placeholder="中文"
          className="input-field"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input
          type="number"
          step="0.1"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          placeholder="开始"
          className="input-field"
        />
        <input
          type="number"
          step="0.1"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          placeholder="结束"
          className="input-field"
        />
        <input
          type="text"
          value={grammarNote}
          onChange={(e) => setGrammarNote(e.target.value)}
          placeholder="语法点"
          className="input-field"
        />
      </div>

      {dirty && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn-primary !py-1 !px-3 text-xs inline-flex items-center gap-1"
          >
            {saving ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Save size={12} />
            )}
            保存字幕
          </button>
        </div>
      )}

      {editingLevels && (
        <WordLevelsEditor
          videoId={videoId}
          subtitle={subtitle}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}
