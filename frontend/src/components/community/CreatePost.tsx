"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Send, Loader2 } from "lucide-react";
import { useCommunityStore } from "@/stores/communityStore";
import type { PostType } from "@/types";

const POST_TYPES: { value: PostType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "progress", label: "Progress" },
  { value: "vocabulary", label: "Vocabulary" },
  { value: "speaking", label: "Speaking" },
];

export default function CreatePost() {
  const [content, setContent] = useState("");
  const [postType, setPostType] = useState<PostType>("text");
  const { createPost, isCreating, error } = useCommunityStore();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || isCreating) return;

    await createPost(content.trim(), postType);
    setContent("");
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-hairline bg-canvas p-4">
      {/* Post type selector */}
      <div className="flex gap-1 overflow-x-auto scrollbar-hide">
        {POST_TYPES.map((type) => (
          <button
            key={type.value}
            type="button"
            onClick={() => setPostType(type.value)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
              postType === type.value
                ? "bg-coral/10 text-coral"
                : "bg-cream-soft text-muted-foreground hover:text-ink"
            )}
          >
            {type.label}
          </button>
        ))}
      </div>

      {/* Content textarea */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Share something with the community..."
        rows={3}
        className="mt-3 w-full resize-none rounded-md border border-hairline bg-white px-3 py-2 text-sm text-ink placeholder:text-muted-foreground focus:border-coral focus:outline-none focus:ring-1 focus:ring-coral/20"
      />

      {/* Submit row */}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {content.length > 0 ? `${content.length} characters` : ""}
        </span>
        <button
          type="submit"
          disabled={!content.trim() || isCreating}
          className={cn(
            "btn-primary !py-1.5 text-xs gap-1.5",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {isCreating ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Post
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </form>
  );
}
