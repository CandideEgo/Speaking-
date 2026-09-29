# ADR-0007: 兑换码生命周期 - 状态机 + 全额追回 + 主动降级

- **Status**: Accepted - 2026-07-09

## Context

Pro 会员 ¥9.9/月，无在线支付（"非经营性工具展示平台"合规），通过微信小商店售卖 + 兑换码激活。现有 `InviteCode`（"邀请码"，语义不符）仅 `is_used` 布尔：

- **无作废**：码泄漏/发错/退款，管理员无法作废；核销后无法回退。
- **无码自身过期**：生成的码多年后仍可核销。
- **无审计链路**：码与"小商店那一笔下单"无关联（`used_by` 仅核销后写）。
- **Pro 到期被动检查**：`require_pro_user` 只在调 Pro 接口时拦 `plan_expires_at < now`，**从不写回 `free`**-> 管理面板 `pro_users` 虚高、用户资料页恒显 Pro。
- **叠加策略未定义**：已 Pro 再核销会顺延（现有逻辑），是否符合预期未定。

## Decision

**Pro 形态**：¥9.9/月，30 天/码，可叠加续期（多码顺延，沿用现有 `max(当前到期, now) + duration_days` 逻辑）。

**兑换码 4 态状态机**（跳过 `sold`-售卖步留在小商店外部跟踪，本系统只记生成/核销）：

```
unused ──核销──> redeemed            [终态·成功]
unused ──管理员作废──> revoked       [终态·泄漏/发错]
unused ──超 N 天未用──> expired      [终态·自动，建议 N=180]
redeemed ──退款撤销──> revoked       [终态·追回天数+降级]
```

- `revoked` 统一带 `reason`（`leak`/`error`/`refund`）区分未用作废 vs 退款撤销。
- **退款撤销（自动全额追回）**：管理员对已核销码触发 -> 原子事务内：码置 `revoked(reason=refund)` + 从 `user.plan_expires_at` 扣 `duration_days`（不低于 now）+ 若到期则 `plan=free`。全额退款 = 全额追回，公平且简（不按比例）。
- **到期主动降级 beat**：新增 beat 任务把 `plan_expires_at < now` 的用户 `plan` 置 `free`（修被动检查致虚高洞），与现有 `expire-pending-orders` 同套路。
- **未用码过期 beat**：`unused` 超 N 天自动 `expired`。
- **改名**：`InviteCode` -> `RedeemCode`（术语对齐，代码 + 表 + 端点路径）。

## Consequences

- **迁移**：`invite_codes` 表加 `status` 枚举（`unused`/`redeemed`/`revoked`/`expired`）+ `revoked_reason` + `expires_at`；`is_used` 保留兼容或弃用。旧数据 `is_used=False`->`status=unused`，`is_used=True`->`status=redeemed`。
- **新端点**：`POST /invite-codes/{id}/revoke`（未用作废）、`POST /invite-codes/{id}/refund`（退款撤销，原子追回）。`redeem` 改判 `status==unused`。
- **新 beat**：到期主动降级（建议每小时）+ 未用码过期（建议每天）。
- **前端**：管理端"兑换码管理页"（生成/列表/作废/退款撤销/导出，对齐统一组件库）；`/redeem` 页 UX 微调（显示新到期日、revoked/expired 友好报错）；`PricingSection` 三档 -> 两档（Free + Pro ¥9.9/月）。
- **不引入在线支付**（合规）；dormant 的 `alipay_payment`/`wechat_payment`/`payment_provider` 不在本 ADR 范围，另行清理。
- 退款撤销是唯一反向改用户数据的操作，靠 `with_for_update` 行锁（码 + 用户）保证原子。
- 术语见 `CONTEXT.md` "会员与兑换"节。
