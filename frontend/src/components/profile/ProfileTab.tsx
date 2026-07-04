"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Mail } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Avatar } from "@/components/ui/Avatar";
import { api, isProUser } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import type { User } from "@/types";

interface ProfileTabProps {
  user: User;
  onUpdate: (user: User) => void;
}

export default function ProfileTab({ user, onUpdate }: ProfileTabProps) {
  const [name, setName] = useState(user.name || "");
  const [bio, setBio] = useState(user.bio || "");
  const [level, setLevel] = useState(user.level || "");
  const [saving, setSaving] = useState(false);

  // Avatar upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Email binding (for phone-only accounts)
  const [bindEmail, setBindEmail] = useState("");
  const [bindPassword, setBindPassword] = useState("");
  const [binding, setBinding] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await api<User>("/api/v1/users/me", {
        method: "PATCH",
        body: JSON.stringify({
          name: name || null,
          bio: bio || null,
          level: level || null,
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

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const updated = await api<User>("/api/v1/users/me/avatar", {
        method: "POST",
        body: form,
      });
      onUpdate(updated);
      toast.success("头像已更新");
    } catch (err) {
      toast.error(apiErrorMessage(err, "头像上传失败"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleBindEmail(e: React.FormEvent) {
    e.preventDefault();
    setBinding(true);
    try {
      const updated = await api<User>("/api/v1/users/me/bind-email", {
        method: "POST",
        body: JSON.stringify({ email: bindEmail, password: bindPassword }),
      });
      onUpdate(updated);
      setBindEmail("");
      setBindPassword("");
      toast.success("邮箱已绑定，验证邮件已发送");
    } catch (err) {
      toast.error(apiErrorMessage(err, "绑定失败"));
    } finally {
      setBinding(false);
    }
  }

  const isPro = isProUser(user);

  return (
    <div className="max-w-2xl space-y-8">
      {/* Avatar */}
      <div>
        <label className="block text-sm font-medium text-ink mb-2">头像</label>
        <div className="flex items-center gap-4">
          <Avatar
            src={user.avatar_url}
            name={user}
            seed={user.id}
            size="xl"
            className="w-20 h-20 text-2xl border border-hairline"
          />
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleAvatarChange}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={Camera}
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? "上传中..." : "上传头像"}
            </Button>
            <p className="mt-1.5 text-xs text-muted-foreground">
              支持 JPG/PNG/WebP/GIF，最大 5MB
            </p>
          </div>
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-ink mb-2">昵称</label>
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="你的昵称"
          maxLength={100}
          className="w-full"
        />
      </div>

      {/* Bio */}
      <div>
        <label className="block text-sm font-medium text-ink mb-2">简介</label>
        <Textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="介绍一下自己..."
          maxLength={300}
          rows={3}
          className="w-full resize-none"
        />
        <p className="mt-1 text-xs text-muted-foreground text-right">
          {bio.length}/300
        </p>
      </div>

      {/* Level */}
      <div>
        <label className="block text-sm font-medium text-ink mb-2">
          英语等级
        </label>
        <Select
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          className="w-40"
        >
          <option value="">未设置</option>
          {["A1", "A2", "B1", "B2", "C1", "C2"].map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
      </div>

      {/* Email — bound or bindable */}
      <div>
        <label className="block text-sm font-medium text-ink mb-2">邮箱</label>
        {user.email ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail size={14} />
            <span>{user.email}</span>
          </div>
        ) : (
          <form onSubmit={handleBindEmail} className="space-y-2">
            <p className="text-xs text-muted-foreground">
              绑定邮箱后可用手机号或邮箱登录（同一密码）。
            </p>
            <Input
              type="email"
              value={bindEmail}
              onChange={(e) => setBindEmail(e.target.value)}
              placeholder="邮箱地址"
              required
              className="w-full"
            />
            <Input
              type="password"
              value={bindPassword}
              onChange={(e) => setBindPassword(e.target.value)}
              placeholder="当前密码（用于验证身份）"
              required
              className="w-full"
            />
            <Button type="submit" variant="outline" disabled={binding}>
              {binding ? "绑定中..." : "绑定邮箱"}
            </Button>
          </form>
        )}
      </div>

      {/* Phone (read-only) */}
      {user.phone && (
        <div>
          <label className="block text-sm font-medium text-ink mb-2">
            手机号
          </label>
          <p className="text-sm text-muted-foreground">{user.phone}</p>
        </div>
      )}

      {/* Plan */}
      <div>
        <label className="block text-sm font-medium text-ink mb-2">会员</label>
        <span
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium ${
            isPro
              ? "bg-coral/10 text-coral"
              : "bg-cream-card text-muted-foreground"
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
        <label className="block text-sm font-medium text-ink mb-2">
          注册时间
        </label>
        <p className="text-sm text-muted-foreground">
          {new Date(user.created_at).toLocaleDateString("zh-CN")}
        </p>
      </div>

      {/* Save */}
      <Button onClick={handleSave} disabled={saving}>
        {saving ? "保存中..." : "保存修改"}
      </Button>
    </div>
  );
}
