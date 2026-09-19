"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Phone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/common/Modal";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { useSmsCode } from "@/hooks/useSmsCode";
import type { User } from "@/types";

interface ProfileTabProps {
  user: User;
  onUpdate: (user: User) => void;
}

/**
 * 个人资料（1B 设计减法后）：只保留头像/昵称/会员状态三个核心项。
 * 简介、英语等级、注册时间已下线（无展示场景/与偏好难度重复/头部已有「加入 N 天」）；
 * 换绑手机是年度级低频动作，收进弹窗，不再占据资料页主视觉。
 */
export default function ProfileTab({ user, onUpdate }: ProfileTabProps) {
  const [name, setName] = useState(user.name || "");
  const [saving, setSaving] = useState(false);

  // Avatar upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Change phone (modal)
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
        body: JSON.stringify({ name: name || null }),
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

  function closeChangePhone() {
    setShowChangePhone(false);
    setNewPhone("");
    setChangePhoneCode("");
    setChangePhonePassword("");
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
      closeChangePhone();
      toast.success("手机号已更换");
    } catch (err) {
      toast.error(apiErrorMessage(err, "更换手机号失败"));
    } finally {
      setChangingPhone(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Avatar */}
      <div className="rounded-xl border border-hairline bg-canvas p-5">
        <label className="block text-sm font-semibold text-ink mb-3">头像</label>
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
            <p className="mt-1.5 text-xs text-muted">支持 JPG/PNG/WebP/GIF，最大 5MB</p>
          </div>
        </div>
      </div>

      {/* Name + phone + plan */}
      <div className="rounded-xl border border-hairline bg-canvas p-5 space-y-4">
        <div>
          <label className="block text-sm font-semibold text-ink mb-2">昵称</label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="你的昵称"
            maxLength={100}
            className="w-full"
          />
        </div>

        <div className="flex items-center justify-between border-t border-hairline pt-4">
          <div>
            <p className="text-sm font-semibold text-ink">手机号</p>
            <p className="text-[13px] text-muted mt-0.5 flex items-center gap-1.5">
              <Phone size={13} />
              {user.phone ? user.phone.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2") : "未绑定"}
            </p>
          </div>
          <Button type="button" variant="text" size="sm" onClick={() => setShowChangePhone(true)}>
            更换
          </Button>
        </div>

        <div className="flex items-center justify-between border-t border-hairline pt-4">
          <p className="text-sm font-semibold text-ink">会员</p>
          {/* 内测期免费开放（需求 §2.3）：不引入 Pro 概念，统一显示「内测免费」。
              plan 字段保留 dormant，未来收费可复用。 */}
          <span className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-[13px] font-medium bg-surface-card text-muted">
            内测免费 · 全功能开放
          </span>
        </div>
      </div>

      <div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "保存中..." : "保存修改"}
        </Button>
      </div>

      {/* Change phone modal — low-frequency heavy flow, kept off the main page */}
      <Modal
        open={showChangePhone}
        onClose={() => !changingPhone && closeChangePhone()}
        title="更换手机号"
        footer={
          <>
            <Button variant="outline" onClick={closeChangePhone} disabled={changingPhone}>
              取消
            </Button>
            <Button type="submit" form="change-phone-form" disabled={changingPhone}>
              {changingPhone ? "更换中..." : "确认更换"}
            </Button>
          </>
        }
      >
        <form id="change-phone-form" onSubmit={handleChangePhone} className="space-y-3">
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
              onChange={(e) => setChangePhoneCode(e.target.value.replace(/\D/g, ""))}
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
              {cooldown > 0 ? `${cooldown}s` : sending ? "发送中..." : "获取验证码"}
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
          {smsError && <p className="text-sm text-error">{smsError}</p>}
        </form>
      </Modal>
    </div>
  );
}
