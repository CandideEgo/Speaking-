"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { User } from "@/types";

interface ProfileTabProps {
  user: User;
  onUpdate: (user: User) => void;
}

export default function ProfileTab({ user, onUpdate }: ProfileTabProps) {
  const [name, setName] = useState(user.name || "");
  const [bio, setBio] = useState(user.bio || "");
  const [level, setLevel] = useState(user.level || "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url || "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await api<User>("/api/v1/users/me", {
        method: "PATCH",
        body: JSON.stringify({
          name: name || null,
          bio: bio || null,
          level: level || null,
          avatar_url: avatarUrl || null,
        }),
      });
      onUpdate(updated);
      toast.success("资料已保存");
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  }

  const isPro = user.plan === "pro";

  return (
    <div className="max-w-2xl space-y-8">
      {/* Avatar */}
      <div>
        <label className="block text-sm font-medium text-ink mb-2">头像</label>
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 rounded-full bg-cream-card border border-hairline overflow-hidden flex items-center justify-center">
            {avatarUrl ? (
              <img src={avatarUrl} alt="头像" className="h-full w-full object-cover" />
            ) : (
              <span className="text-2xl font-display text-muted-foreground">
                {(user.name || user.email)[0].toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1">
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="输入头像图片 URL"
              className="input-field w-full"
            />
            <p className="mt-1 text-xs text-muted-foreground">支持任意图片链接</p>
          </div>
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-ink mb-2">昵称</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="你的昵称"
          maxLength={100}
          className="input-field w-full"
        />
      </div>

      {/* Bio */}
      <div>
        <label className="block text-sm font-medium text-ink mb-2">简介</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="介绍一下自己..."
          maxLength={300}
          rows={3}
          className="input-field w-full resize-none"
        />
        <p className="mt-1 text-xs text-muted-foreground text-right">{bio.length}/300</p>
      </div>

      {/* Level */}
      <div>
        <label className="block text-sm font-medium text-ink mb-2">英语等级</label>
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          className="input-field w-40"
        >
          <option value="">未设置</option>
          {["A1", "A2", "B1", "B2", "C1", "C2"].map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {/* Email (read-only) */}
      <div>
        <label className="block text-sm font-medium text-ink mb-2">邮箱</label>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </div>

      {/* Plan */}
      <div>
        <label className="block text-sm font-medium text-ink mb-2">会员</label>
        <span
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium ${
            isPro ? "bg-coral/10 text-coral" : "bg-cream-card text-muted-foreground"
          }`}
        >
          {isPro ? "Pro 会员" : "免费用户"}
          {user.plan_expires_at && (
            <span className="text-xs opacity-70">
              至 {new Date(user.plan_expires_at).toLocaleDateString("zh-CN")}
            </span>
          )}
        </span>
      </div>

      {/* Member since */}
      <div>
        <label className="block text-sm font-medium text-ink mb-2">注册时间</label>
        <p className="text-sm text-muted-foreground">
          {new Date(user.created_at).toLocaleDateString("zh-CN")}
        </p>
      </div>

      {/* Save */}
      <button onClick={handleSave} disabled={saving} className="btn-primary">
        {saving ? "保存中..." : "保存修改"}
      </button>
    </div>
  );
}
