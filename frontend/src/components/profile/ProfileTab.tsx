"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Phone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Avatar } from "@/components/ui/Avatar";
import { api, isProUser } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { useSmsCode } from "@/hooks/useSmsCode";
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

  // Change phone
  const [showChangePhone, setShowChangePhone] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [changePhoneCode, setChangePhoneCode] = useState("");
  const [changePhonePassword, setChangePhonePassword] = useState("");
  const [changingPhone, setChangingPhone] = useState(false);
  const { cooldown, sending, sendCode, error: smsError } = useSmsCode();

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

  async function handleChangePhone(e: React.FormEvent) {
    e.preventDefault();
    setChangingPhone(true);
    try {
      const updated = await api<User>("/api/v1/auth/sms/change-phone", {
        method: "POST",
        body: JSON.stringify({
          new_phone: newPhone,
          code: changePhoneCode,
          password: changePhonePassword,
        }),
      });
      onUpdate(updated);
      setShowChangePhone(false);
      setNewPhone("");
      setChangePhoneCode("");
      setChangePhonePassword("");
      toast.success("手机号已更换");
    } catch (err) {
      toast.error(apiErrorMessage(err, "更换手机号失败"));
    } finally {
      setChangingPhone(false);
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

      {/* Phone — display + change */}
      <div>
        <label className="block text-sm font-medium text-ink mb-2">
          手机号
        </label>
        {user.phone && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Phone size={14} />
            <span>{user.phone}</span>
          </div>
        )}
        {!showChangePhone ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowChangePhone(true)}
          >
            更换手机号
          </Button>
        ) : (
          <form onSubmit={handleChangePhone} className="space-y-2 mt-2">
            <Input
              type="tel"
              inputMode="numeric"
              maxLength={11}
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, ""))}
              placeholder="新手机号"
              required
              className="w-full"
            />
            <div className="flex gap-2">
              <Input
                inputMode="numeric"
                maxLength={6}
                value={changePhoneCode}
                onChange={(e) =>
                  setChangePhoneCode(e.target.value.replace(/\D/g, ""))
                }
                placeholder="验证码"
                required
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                disabled={sending || cooldown > 0 || newPhone.length !== 11}
                onClick={() => sendCode(newPhone, "change_phone")}
                className="shrink-0"
              >
                {cooldown > 0
                  ? `${cooldown}s`
                  : sending
                    ? "发送中..."
                    : "获取验证码"}
              </Button>
            </div>
            <Input
              type="password"
              value={changePhonePassword}
              onChange={(e) => setChangePhonePassword(e.target.value)}
              placeholder="当前密码（用于验证身份）"
              required
              className="w-full"
            />
            {smsError && <p className="text-sm text-red-600">{smsError}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={changingPhone}>
                {changingPhone ? "更换中..." : "确认更换"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowChangePhone(false);
                  setNewPhone("");
                  setChangePhoneCode("");
                  setChangePhonePassword("");
                }}
              >
                取消
              </Button>
            </div>
          </form>
        )}
      </div>

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
