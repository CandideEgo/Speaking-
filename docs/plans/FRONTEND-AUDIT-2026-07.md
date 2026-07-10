# 前端功能审计 - 2026-07-09

> Phase A 产出。31 页全量审计：逐页交互元素状态 + 四类分级 + 执行问题。
> 分级：✅工作 / ❌死按键(无handler) / ⚠️坏(断链/报错) / 🪓砍功能遗留 / 🚧未接线占位 / 📉能工作但UX/视觉差
> 三组并发审计：A 认证/营销(10)、B 用户主区(11)、C 管理端(10)。

## 核心结论：是"修复+清理"，不是"70-80% 重设计"

审计证伪了"大量死按键"的假设：

| 类别 | 数量 | 说明 |
|---|---|---|
| ❌死按键 | **0** | 31 页无一无 handler 的按钮 |
| ⚠️坏 | 5 | 全在 landing：5 个锚点链接目标 ID 不存在 |
| 🪓砍功能遗留 | 5 | 多为**文案**承诺已砍功能（非死按钮） |
| 🚧占位 | 2 实际 | community 热门话题；upgrade 小商店未配置（_design showcase 5 个为预期展示） |
| 📉UX/执行 | ~14 | 不一致 / 硬编码假数据 / 缺分页 / 未用统一原语 |

"设计不满意"的真因 = 执行层零散问题（断链 nav、search 用旧原语、stats 硬编码假数据、未本地化、按钮重复等），**逐项修复即可**，无需推倒 70-80%。与 ADR-0005"执行层打磨"决策一致。

## 上线阻塞（必改）

1. **pricing/privacy/terms 文案承诺已砍功能** — `PLANS.features` + `COMPARISON` 表含"AI 口语评测 / 逐词评分 / 每日学习总结 / 学习推荐"（ADR-0002/0003/0011 已砍或推迟）；privacy 写"邮箱""口语音频与评分"、terms 写"AI 评测"。法律/定价页与当前能力脱节，合规风险，上线前必改。
2. **landing 页 5 个锚点断链** — nav `#features/#content/#pricing/#about` + footer `#pricing` 目标 ID 全不存在，nav 导航完全失效。修：给各 `<section>` 加 `id`。
3. **stats 页 2 个 KPI 硬编码假数据** — "总用户数 +12%较上月"、"7日新增 +5今日"是静态字符串，非来自后端。误导，必接真数据。
4. **3 处列表缺分页** — videos(50) / invites(100) / community posts(20) 超限静默截断（其他列表页有 Pagination）。

## 修复 Punch-list（Phase C 输入）

| # | 页面 | 问题 | 分类 | 修法 |
|---|---|---|---|---|
| 1 | landing | 5 锚点断链 | ⚠️ | section 加 `id` |
| 2 | pricing | features/comparison 承诺砍功能 | 🪓 | 重写匹配当前能力 |
| 3 | privacy | "邮箱""口语评分"文案 | 🪓 | 改手机号 + 学习记录 |
| 4 | terms | "AI 评测"承诺 | 🪓 | 删 |
| 5 | onboarding | step2 daily-goal | 🪓 | 删 step 或改词汇目标；用 ui 原语 |
| 6 | stats | 2 KPI 假数据 | 🚧 | 接真数据 |
| 7 | stats | range toggle 不 refetch | 📉 | `days` 参数传入后端 |
| 8 | search | 旧 `common/Badge` + 原生 `<input>` | 📉 | 迁 `ui/Badge`+`ui/Input`（疑 Tailwind4 回归） |
| 9 | vocabulary | 顶部复习条 + 每卡质量按钮重复 | 📉 | 去重 |
| 10 | community | "following" tab 与 feed 同响应 | 📉 | 后端差异化或删 |
| 11 | community | "热门话题"占位 | 🚧 | 实现或删 |
| 12 | history | `<a href>` 非 `<Link>` | 📉 | 迁 Next `<Link>` |
| 13 | history | "speaking_attempts 次跟读"恒 0 | 🪓 | 删字段展示 |
| 14 | profile | LearningPrefsTab streak 文案 + shim | 🪓 | 删 |
| 15 | profile | NotificationPreferences 全英文 | 📉 | 本地化 |
| 16 | admin videos/[id] | 原生 `confirm()` | 📉 | 迁 `ConfirmDialog` |
| 17 | admin users | 搜索 placeholder 提"邮箱" | 📉 | 改"手机号" |
| 18 | admin videos/invites/community | 缺分页 | 📉 | 加 `Pagination` |
| 19 | landing | PricingSection CTA 不分登录态 | 📉 | isPro 判断 |
| 20 | landing | Hero "进入应用"->/register | 📉 | label/目标对齐 |
| 21 | landing | TrustStrip/Bento 硬编码假统计 | 📉 | 接真数据或改文案 |
| 22 | forgot-password | 成功态文案矛盾 | 📉 | 统一 |
| 23 | register | 密码无强度校验 | 📉 | 加客户端校验 |

---

## 逐页明细

### A. 认证/营销（10 页）— 0 死 / 5 坏 / 3 砍遗留 / 1 占位 / 4 UX

#### A1. `login/page.tsx`
| 元素 (file:line) | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| 手机号 Input (73) | onChange->setPhone | ✅ | strips non-digits |
| 密码 Input (86) | onChange->setPassword | ✅ | |
| "注册" Link (62) | href=/register | ✅ | |
| "忘记密码?" Link (94) | href=/forgot-password | ✅ | |
| form onSubmit (70) | ->api POST /auth/phone-login->login()->router.push("/") | ✅ | endpoint auth.py:144 |
| "登录" Button (105) | form submit | ✅ | |

执行问题: 手机号+密码登录，SMS-only 一致；AuthCard+ui/Input+ui/Button 统一。无问题。

#### A2. `register/page.tsx`
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| 手机号 Input (88) | setPhone | ✅ | |
| 验证码 Input (102) | setCode | ✅ | |
| "获取验证码" Button (110) | sendCode->POST /auth/sms/send-code (purpose=register) | ✅ | 60s cooldown |
| 密码/确认密码 Input (127/139) | setPassword | ✅ | minLength 8 |
| 协议 checkbox (155) | setAgreed | ✅ | gates submit |
| 《用户协议》《隐私政策》Link (163/171) | href=/terms /privacy _blank | ✅ | |
| form onSubmit (85) | ->POST /auth/sms/register->login()->/ | ✅ | endpoint auth.py:105 |
| "注册" Button (181) | form submit; disabled until agreed | ✅ | |

执行问题: 一致性好。密码 placeholder 写"含大小写字母和数字"但无客户端强度校验（仅 minLength 8）📉。

#### A3. `forgot-password/page.tsx`
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| 手机号 Input (74) | setPhone | ✅ | |
| 验证码 Input (88) | setCode | ✅ | |
| "获取验证码" Button (96) | sendCode(phone,"reset_password") | ✅ | correct purpose |
| 新密码/确认 Input (113/127) | setPassword | ✅ | |
| form onSubmit (71) | ->POST /auth/sms/reset-password->setDone | ✅ | endpoint auth.py:234 |
| "重置密码" Button (142) | form submit | ✅ | |
| "返回登录" Link ×2 (62/147) | href=/login | ✅ | pre/post success |

执行问题: 成功态文案矛盾—subtitle"密码已重置，请用新密码登录"vs 成功框"如果该手机号已注册，密码已重置"（不应泄露注册状态）📉。

#### A4. `onboarding/page.tsx`
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| "开始设置" Button (112) | setStep(1) | ✅ | |
| Level 选择 ×5 (129) | setLevel | ✅ | A1-C1 |
| "上一步"/"下一步" (146/153) | setStep | ✅ | next disabled until level set |
| Goal 选择 ×2 (173) | setGoalType/setGoalValue | 🪓 | daily-goal=ADR-0003 砍；写 preferences 无消费方 |
| 目标值 range (196) | setGoalValue | 🪓 | orphaned |
| "上一步" (206) | setStep(1) | ✅ | |
| "开始学习" (213) | Promise.all: PATCH /users/me(level)+PUT /preferences(daily_goal)+POST /onboarding | ✅ | endpoint 均存在；daily_goal 为 🪓 orphaned |

执行问题: Step2 整步"每日学习目标"是 ADR-0003 砍掉的遗留。建议删 step2 或改词汇目标。用裸 `<button>`+`<input range>` 而非 ui 原语，与 watch anchor 不一致 📉。

#### A5. `upgrade/page.tsx`
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| "前往微信小商店购买" Button (48) | openMiniStore->window.open(miniStoreUrl) | ✅/🚧 | 配置时 ✅；未配置时占位"即将开通" (52) 🚧 |
| "已购买？使用兑换码激活" LinkButton (62) | href=/redeem | ✅ | |
| 《用户协议》《隐私政策》Link (73/77) | href=/terms /privacy | ✅ | |
| "返回定价页" Link (83) | href=/pricing | ✅ | |

执行问题: 合规告知清晰。miniStoreUrl 未配置时占位合理。无问题。

#### A6. `(landing)/landing/page.tsx` (+LandingContent)
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| Logo Link (LandingNav:40) | href=/ | ✅ | |
| Desktop nav "功能" (49) | href=#features | ⚠️ | 断链：无 id="features" |
| Desktop nav "内容库" (49) | href=#content | ⚠️ | 断链 |
| Desktop nav "价格" (49) | href=#pricing | ⚠️ | 断链（PricingSection 无 id） |
| Desktop nav "关于" (49) | href=#about | ⚠️ | 断链，无 About 区块 |
| "进入应用"/"登录"/"免费试用" (62-72) | href=/ or /login or /register | ✅ | 按 isAuthenticated 切换 |
| Mobile hamburger (78) | setMobileMenuOpen | ✅ | |
| Mobile nav links ×4 (93) | href=#features 等 | ⚠️ | 4 个断链 |
| Hero "进入应用" (HeroSection:25) | href=/register | 📉 | label 与目标不符 |
| Hero "浏览视频内容" (HeroSection:33) | href=/browse | ✅ | |
| PricingSection CTA ×3 (93) | href=/register | ✅ | 全跳 register，未区分登录态 📉 |
| FinalCTA "免费试用"/"浏览视频内容" (27/36) | href=/register /browse | ✅ | |
| Footer "价格" (LandingFooter:8) | href=/landing#pricing | ⚠️ | 断链 |
| Footer 其他 Links (6-18) | /browse /my-videos /vocabulary /history /community /terms /privacy /upgrade | ✅ | routes 存在 |

执行问题: **5 个 anchor 断链**（#features/#content/#pricing/#about + footer #pricing）—所有 landing 区块均无 `id`，nav 锚点导航完全失效，主要 IA 缺陷。FeatureGrid/Testimonial 文案残留"跟读字幕""字幕跟读功能"🪓（ADR-0002）。TrustStrip/Bento 硬编码假统计（12,400+ 视频/98%/36,000+ 学习者）📉。

#### A7. `(main)/pricing/page.tsx`
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| "兑换码" anchor (93) | href=/redeem | ✅ | |
| "前往小商店购买" Link ×2 (151) | href=/upgrade | ✅ | 每 plan 一个；isPro 时替换为 disabled"已是 Pro" |
| "已是 Pro" disabled div (140) | 无 | ✅ | 状态展示 |
| "兑换码" anchor 底部 (211) | href=/redeem | ✅ | |

执行问题: **营销文案大量 🪓**—`PLANS.features` 含"无限视频与口语评测""逐词评分与反馈"（ADR-0002）、"每日学习总结""学习推荐"（ADR-0003/0011）；`COMPARISON` 表"AI 口语评测""逐词发音反馈"同为 🪓。向用户承诺已砍功能，内容一致性严重问题，上线前必改。isPro 经 /payments/status 获取（endpoint 存在）。

#### A8. `privacy/page.tsx`
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| "返回首页" Link (88) | href=/ | ✅ | |

执行问题: 静态法律页。**文案 🪓**：第二节"邮箱""口语练习音频与评分"（ADR-0003 删 email、ADR-0002 砍评分）；应改手机号 + 学习记录。日期 2026-06-29。

#### A9. `terms/page.tsx`
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| "返回首页" Link (87) | href=/ | ✅ | |

执行问题: 静态法律页。**文案 🪓**：第一节"口语评测"、第五节"AI 评测"承诺 ADR-0002 已砍功能。与 privacy 同步更新。

#### A10. `(main)/redeem/page.tsx`
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| 未登录"登录"/"注册" anchor (66/70) | href=/login /register | ✅ | |
| 兑换码 Input (82) | setCode (uppercase) | ✅ | |
| form onSubmit (77) | ->POST /invite-codes/redeem->setResult; success->2s router.push("/") | ✅ | endpoint invite.py:120，需 auth |
| "激活 Pro" Button (104) | form submit | ✅ | |

执行问题: 未登录态提示登录/注册，登录态显示表单。成功后 2s 跳首页。ui/Button+ui/Input 一致。无问题。

---

### B. 用户主区（11 页）— 0 死 / 0 坏 / 2 砍遗留 / 1 占位 / 6 UX

#### B1. `(main)/page.tsx` (home)
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| "开始练习"/"浏览视频库" LinkButton (128/136) | href=/browse | ✅ | |
| "词汇待复习" Link (145) | href=/vocabulary; loads /vocabulary/stats | ✅ | |
| "社区" Link (168) | href=/community | ✅ | |
| 推荐流 VideoCard (209) | markSeen->/watch/{id}; feed /recommendations/home | ✅ | |
| 继续观看 VideoCard (229) | /watch/{id}; /learning/records?completed=false | ✅ | |
| 社区动态帖 Link (CommunityFeedWidget:90) | href=/community | ✅ | 无单帖页 |
| "查看全部"/"去社区" (64/83) | href=/community | ✅ | |
| "重试" Button (272) | retry->fetchVideos | ✅ | |
| 难度 TabPills (257) | setActiveGroup (客户端过滤) | ✅ | |
| "更多" SectionLink (249) | href=/browse | ✅ | |

执行问题: Bento+推荐+继续+社区+难度衔接连贯；社区动态帖无法直达单帖（全跳 /community），IA 略弱。

#### B2. `(main)/browse/page.tsx`
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| 分类/难度 TabPills (54/71) | ->usePlatformFeed /browse/feed?category=&level= | ✅ | |
| VideoCard (99) | /watch/{id} | ✅ | |
| "加载更多" Button (128) | scrollIntoView 触发 IntersectionObserver | ✅ | 手动触发 observer，UX 略怪 |
| ErrorState 重试 (86) | retry->reload | ✅ | |

执行问题: sticky filter-bar 双行清晰；"加载更多"靠 scrollIntoView 触发观察器，非直觉。

#### B3. `(main)/search/page.tsx`
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| 返回 Button (151) | router.back | ✅ | |
| 搜索 input (160) | debounce 300ms->performSearch /videos/search +/search/subtitles | ✅ | |
| input Esc (125) | router.back | ✅ | |
| input Enter (128) | /watch/{首个结果} | ✅ | |
| 视频结果 button (216) | handleVideoClick->/watch/{id} | ✅ | |
| 字幕结果 button (262) | /watch/{id}?t= | ✅ | |
| Badge (234) | 展示 | 📉 | 旧 `common/Badge` 非统一 `ui/Badge` |
| input (160) | | 📉 | 原生 `<input>` 非 `ui/Input`，疑 Tailwind4 回归 |

执行问题: 视觉一致性差—未用统一 UI 原语，与 watch/anchor 风格脱节；无 container-page 包裹，padding 不一致。

#### B4. `(main)/watch/[id]/page.tsx`
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| "返回浏览" (287) | router.push(/browse) | ✅ | |
| 点赞 Heart (299) | toggleLike->POST /videos/{id}/like | ✅ | |
| 收藏 Bookmark (310) | toggleFavorite->POST/DELETE /videos/{id}/favorite | ✅ | |
| 分享 Share2 (321) | setShareOpen | ✅ | |
| 词汇本 BookOpen (329) | router.push(/vocabulary) | ✅ | |
| 笔记 Pencil (337) | setNoteOpen | ✅ | |
| 笔记"清空"/"保存" (399/402) | DELETE/PUT /videos/{id}/note | ✅ | |
| `<video>` 事件 (436) | onTimeUpdate/Play/Pause/Seeked/Ended | ✅ | |
| PiP 关闭 (477) | dismiss | ✅ | |
| ExamLevelSelector (24) | PUT /users/me/preferences | ✅ | |
| 字幕词 click (519) | handleWordClick->/words/gloss | ✅ | |
| "录音" toggle (535) | start/stopRecording (本地无AI) | ✅ | ADR-0002 保留 |
| 录音 start/stop Mic (558/577) | start/stopRecording | ✅ | |
| 录音"取消"/"重录"/"下一句" (595/617/620) | stopSpeaking/reRecord/handleNextSubtitle | ✅ | |
| 字幕列表项 (654) | seekTo+setCurrentSubtitleIndex | ✅ | |
| SubtitleModeTabs/Rail (641/122) | setSubtitleMode (Zustand) | ✅ | |
| 折叠/展开 (92) | setPanelCollapsed | ✅ | |
| 练习进度点/"重置"/"下一题" (731/714/764) | setCurrentIndex/reset | ✅ | |
| 选项/检查答案/拼写 (84/129/432) | onAnswer/onGrade | ✅ | |
| AudioPlayButton (197) | audio.playWord/playSentence | ✅ | |
| 跟读录音 RecordAndEvaluate (274) | 录音+自评 (无AI) | ✅ | ADR-0002 保留 |
| SelfEval"读对了/需练习" (252) | onResult->onGrade | ✅ | |
| "保存学习记录"/"重新练习" (165/172) | POST /videos/practice/submit / onRetry | ✅ | |
| WordTooltip 关闭/发音/加入词汇本 (126/189/193) | onClose/speakWord/POST /vocabulary | ✅ | |
| 分享 dialog "取消"/"发布" (76/85) | onClose / POST /community/posts | ✅ | |
| 错误态"重新加载"/失败态"返回浏览" (229/267) | retry / /browse | ✅ | |

执行问题: 页面极密集但全部接线；录音面板(无AI)按 ADR-0002 保留；移动端 PiP 正常。

#### B5. `(main)/vocabulary/page.tsx`
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| 4 MetricCard (179) | /vocabulary/stats | ✅ | |
| 复习条 6 质量 Button (221) | handleReview->POST /vocabulary/{id}/review?quality= | ✅ | |
| "开始练习" (237) | setPracticeOpen->Modal+UnifiedPracticePanel | ✅ | |
| 练习 Modal 交互 | useVocabularyPractice /practice; submit /practice/submit | ✅ | |
| TabPills 全部/待复习 (257) | setDueOnly | ✅ | |
| 发音 Volume2 (298) | speak | ✅ | |
| 删除 Trash2 (321) | setDeleteTarget->ConfirmDialog | ✅ | |
| 卡内 6 质量 Button (334) | handleReview | ✅ | 与复习条重复 |
| ConfirmDialog (353) | handleDelete->DELETE /vocabulary/{id} | ✅ | |

执行问题: 顶部复习条与每卡内联 6 质量按钮重复（同 handler），UX 冗余 📉。

#### B6. `(main)/community/page.tsx`
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| TabPills feed/following/trending/videos (260) | setActiveTab | ✅ | "following"与"feed"同接口无差异化 📉 |
| 视频卡 Link (277) | /watch/{id}; /community/videos | ✅ | |
| PostComposer textarea+"发布" (43/52) | handleCreatePost->POST /community/posts | ✅ | |
| 点赞 Heart (410) | handleLike->POST /community/posts/{id}/like | ✅ | |
| 评论 MessageCircle (425) | toggleComments->GET /community/posts/{id}/comments | ✅ | |
| 分享 Share2 (437) | navigator.share/clipboard | ✅ | |
| 帖内视频 Link (385) | /watch/{id} | ✅ | |
| 评论 Input+Send (CommentThread:87) | handleAddComment->POST /community/posts/{id}/comments | ✅ | |
| "加载更多" (471) | loadMore | ✅ | |
| 侧栏"热门话题" (503) | 无 | 🚧 | "即将上线"占位 |

执行问题: "following"未实际过滤；"热门话题"占位；社区动态帖无单帖直达页。

#### B7. `(main)/profile/page.tsx` + 子组件
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| Tab ×3 (102) | setActiveTab | ✅ | |
| 头像上传 (ProfileTab:127) | fileInput->POST /users/me/avatar | ✅ | |
| 昵称/简介/等级 Input/Select (147-189) | 受控 | ✅ | |
| "更换手机号"+发送验证码 (204/236) | sendCode(newPhone,"change_phone") | ✅ | |
| 换手机号 form (213) | POST /auth/sms/change-phone | ✅ | |
| "保存修改" (311) | PATCH /users/me | ✅ | |
| 改密码 form (SettingsTab:69) | POST /auth/change-password | ✅ | |
| 时区 Select+"保存" (170) | PATCH /users/me | ✅ | |
| 通知开关 ×9 (NotificationPreferences:185) | togglePreference | ✅ | |
| 通知"Save" (140) | PUT /notifications/preferences | ✅ | |
| LearningPrefsTab streak 文案 (73) | - | 🪓 | ADR-0003 砍 streak；speaking_attempts shim 指向已砍功能 |
| 默认字幕模式/偏好难度 Select (124/144) | 受控 | ✅ | |
| "保存偏好" (160) | PUT /users/me/preferences | ✅ | |
| NotificationPreferences 全英文 (17-72) | - | 📉 | 与全站中文不一致 |

执行问题: LearningPrefsTab 残留 streak 文案 + speaking_attempts shim（🪓 ADR-0003）；NotificationPreferences 整块英文未本地化。

#### B8. `(main)/history/page.tsx`
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| 记录 `<a href>` (74) | href=/watch/{video_id} | ✅ | 用 `<a>` 非 Next `<Link>`，无客户端导航 📉 |
| Pagination 上一页/下一页 (133/135) | setRecordsPage∓1 | ✅ | |
| "speaking_attempts 次跟读" (99) | 展示 record.speaking_attempts | 🪓 | ADR-0002 砍，watch 录音不上报后端，恒 0 |
| "words_learned/quiz_score" (100-102) | 展示 | ✅ | 词汇/练习填充 |

执行问题: 用 `<a href>` 而非 `<Link>`（全站唯一），刷新整页；speaking_attempts 砍功能遗留恒 0。

#### B9. `(main)/my-videos/page.tsx`
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| "本地上传" (151) | fileInput->POST /videos/upload | ✅ | |
| "链接导入" (160) | setLinkDialogOpen | ✅ | |
| 视频卡 Link (186) | /my-videos/{id} | ✅ | |
| 链接导入 Input+"一键导入" (LinkUploadDialog:83) | seedFromUrlFull->POST /videos/user-seed-full | ✅ | |
| 推荐视频"导入" (115) | handleImport(url) | ✅ | |

执行问题: 处理中视频轮询(3s)直至 ready/error，衔接顺畅。无问题。

#### B10. `(main)/my-videos/[id]/page.tsx`
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| "返回我的视频" (208) | href=/my-videos | ✅ | |
| "编辑已发布视频" (236) | beginEdit->POST /videos/{id}/begin-edit | ✅ | 仅 published |
| "提交审核" (244) | submitForReview->POST /videos/{id}/submit-review | ✅ | 仅 draft/rejected |
| "撤回审核" (252) | withdrawSubmission->POST /videos/{id}/withdraw | ✅ | 仅 pending_review |
| TabPills 字幕/练习题 (316) | setActiveTab | ✅ | |
| 字幕列表项 (VSEP:318) | seekTo | ✅ | |
| 模式 button 英/双语/中 (VSEP:284) | setMode | ✅ | |
| 考级 Select (VSEP:302) | setLevel | ✅ | |
| "编辑此句"/"完成" (VSEP:247/208) | setEditId | ✅ | |
| SubtitleEditor 保存/拆分/合并/词级 (VSEP:216) | updateSubtitle/splitSubtitle/mergeSubtitle/updateWordLevels | ✅ | |
| SubtitleHistory 列表/回滚 (VSEP:230) | listSubtitleRevisions/rollbackSubtitle | ✅ | |
| 练习题考级 Select (460) | setLevel | ✅ | |
| "AI 重新生成" (472) | regeneratePractice->POST /videos/{id}/practice/regenerate | ✅ | |
| 题目 word/template/answer Input (508) | updateQuestion | ✅ | |
| 删除题目/添加题目 (499/540) | removeQuestion/addQuestion | ✅ | |
| "保存练习题" (543) | editPractice->PATCH /videos/{id}/practice | ✅ | |

执行问题: 创作者编辑器完整，字幕审计回滚 + 练习题 AI 重生成均接线。无问题。

#### B11. `(main)/checkout/page.tsx`
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| "前往微信小商店" (23) | href=/upgrade | ✅ | |
| "使用兑换码激活" (27) | href=/redeem | ✅ | |
| "返回定价页" (36) | href=/pricing | ✅ | |

执行问题: 纯静态信息页（无站内支付），三链接均解析到存在页面。无问题。

---

### C. 管理端（10 页）— 0 死 / 0 坏 / 0 砍遗留 / 5 占位(showcase) / 4 UX

#### C1. `(admin)/admin/login/page.tsx`
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| 手机号/密码 Input (69/85) | setPhone/setPassword | ✅ | |
| 管理员登录 submit (97) | ->adminApi POST /auth/phone-login->login()->router.replace(/admin) | ✅ | endpoint auth.py:144 |

执行问题: 自包含。手机号无区号字段(默认+86)，国际化时需补。

#### C2. `(admin)/admin/(shell)/_design/page.tsx`
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| Button variants ×8 / sizes ×6 (51-77) | 无 onClick | 🚧 | 组件库 showcase，by design |
| Input/Textarea/Select/Badge/Avatar/Image/Stack/Grid 演示 | 无/本地 state | 🚧 | showcase |
| LinkButton href=/admin (267) | href=/admin | ✅ | 唯一真实导航 |
| ProgressRing ×3 (272) | 无 | 🚧 | 静态 |

执行问题: 纯 gallery，非用户面。新增指标组件若需登记变体，应在此页补 showcase。

#### C3. `(admin)/admin/(shell)/community/page.tsx`
ReportQueue:
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| 刷新 (111) | listReports->GET /admin/reports | ✅ | |
| FilterPills 举报状态 ×4 (123) | setStatusFilter | ✅ | |
| 举报行展开 (147) | setExpandedId | ✅ | |
| 通过/驳回 [pending] (181/189) | resolveReport->PATCH /admin/reports/{id} | ✅ | |
| Pagination (229) | setPage | ✅ | |
| ConfirmDialog (237) | handleResolve | ✅ | |

PostsManager:
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| 刷新 (345) | listPosts->GET /admin/posts | ✅ | |
| 搜索 Enter (358) | listPosts(keyword) | ✅ | |
| 帖子行展开 (387) | toggleExpand->GET /admin/posts/{id}/comments | ✅ | 懒加载 |
| 删除帖子/评论 (437/472) | DELETE /admin/posts/{id} /comments/{id} | ✅ | |
| ConfirmDialog ×2 (488/502) | handleDelete | ✅ | |

执行问题: PostsManager 用独立 `load`+`useState` 而非 `usePaginatedList`，且**无分页**(page_size:20) 📉 超 20 条静默丢失。ReportQueue 有分页，两者模式不一致。

#### C4. `(admin)/admin/(shell)/invites/page.tsx`
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| 数量/有效期/批次 input (88/100/112) | setCodeCount/Duration/Label | ✅ | |
| 生成兑换码 submit (120) | generateInviteCodes(plan:"pro")->POST /invite-codes/generate | ✅ | plan 硬编码 pro |
| 刷新 (131) | listInviteCodes->GET /invite-codes | ✅ | |
| 导出 CSV (139) | exportInviteCsv->GET /invite-codes/export->Blob | ✅ | |

执行问题: **无分页**(page_size:100) 📉 超 100 条截断。plan 写死 "pro"。列表行无操作(不能禁用/删除单码)。

#### C5. `(admin)/admin/(shell)/orders/page.tsx`
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| 刷新 (55) | listOrders->GET /admin/orders | ✅ | |
| Pagination (112) | setPage | ✅ | |

执行问题: 纯只读表格，无筛选/搜索/行操作(不能退款/详情)。7 列在窄屏横向溢出 📉 移动端无响应式。

#### C6. `(admin)/admin/(shell)/page.tsx` (dashboard index)
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| (无交互) (4) | redirect(/admin/stats) | ✅ | 纯重定向 |

执行问题: `/admin` 直接跳 `/admin/stats`。**新增 4 组指标(实时在线/管线健康/用户结构/UGC待处理)的最佳落点** = 此页改为真正概览 dashboard（当前被 redirect 绕过），或在 stats 页顶部加"运营概览"区。建议取消 redirect，放 4 张 StatCard + 跳转链接。

#### C7. `(admin)/admin/(shell)/stats/page.tsx`
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| 刷新 (136) | getAdminStats->GET /admin/stats | ✅ | |
| 7天/30天 toggle (198) | setRange->仅客户端 slice，**不 refetch** | 📉 | `days` 参数从未传入，后端恒 30 天 |
| KPI 总用户数 (150) delta"+12%较上月" | 静态字符串 | 🚧 | 硬编码假数据 |
| KPI 7日新增 (157) delta"+5今日" | 静态字符串 | 🚧 | 硬编码假数据 |
| KPI Pro用户 (164) | stats.pro_users | ✅ | |
| KPI 视频总数 (170) | stats.total_videos/videos_ready | ✅ | |
| KPI 词汇总数 (176) | trend.vocabulary slice(-7) | ✅ | |
| KPI 待处理举报 (183) | stats.pending_reports | ✅ | |
| AreaChart 趋势 (214) | recharts tooltip | ✅ | |
| PieChart 用户方案 (284) | stats.users_by_plan | ✅ | |
| BarChart 视频状态 (313) | stats.videos_by_status | ✅ | |
| 最近活动 (348) | stats.recent_activity | ✅ | |

执行问题: 2 KPI delta 硬编码假数据，上线前必接真数据。range toggle 是 dead param。load() 仅 mount 调一次，range 切换不刷新。**新指标落点**：实时在线->KPI 第 7 格(当前 6 格 3×2，建议改 4×2 或独立 SectionCard)；管线健康->新增 SectionCard(复用 videos 页 getWorkerStatus)；今日注册/今日兑换->KPI 或用户结构区。

#### C8. `(admin)/admin/(shell)/users/page.tsx`
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| 刷新 (168) | listUsers->GET /admin/users | ✅ | |
| FilterPills 角色/方案 ×3 (181/186) | setRoleFilter/setPlanFilter | ✅ | |
| 搜索 Enter (191) | listUsers(keyword) | ✅ | placeholder 提"邮箱"但已删 📉 |
| 行展开 (221) | setExpandedId | ✅ | |
| 封禁/解封 (278) | setUserBanned->PATCH /admin/users/{id}/ban | ✅ | |
| 提升/降级 (288) | promoteUser->PATCH /admin/users/{id}/role | ✅ | |
| 赠送天数 input (367) | setDays | ✅ | |
| 赠送/撤销 Pro (376/380) | setUserPlan->PATCH /admin/users/{id}/plan | ✅ | |
| Pagination (310) | setPage | ✅ | |
| ConfirmDialog (318) | onConfirm | ✅ | |

执行问题: 搜索 placeholder 仍写"邮箱"但 User.email 已删(sms-only) 📉 需改"手机号"。detail row "等级"字段(user.level)来源需确认。

#### C9. `(admin)/admin/(shell)/videos/page.tsx` (VideoManager)
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| "添加视频" (256) | setAddDialogOpen | ✅ | |
| 刷新 (264) | listVideos->GET /videos/admin | ✅ | |
| GPU Worker 状态指示灯 (246) | getWorkerStatus 轮询 30s->GET /admin/worker-status | ✅ | 非交互 |
| FilterPills 状态 ×6/审核 ×5 (278/284) | setStatusFilter/setReviewStatusFilter | ✅ | |
| 搜索 Enter (289) | loadVideos | ✅ | |
| 行 编辑/关闭 (426) | setEditingId | ✅ | |
| 搬运到本地 (VideoDetailRow:183) | localizeVideo->POST /videos/admin/{id}/localize | ✅ | disabled 当 hasLocal/isProcessing |
| 字幕/高亮 (208) | router.push(/admin/videos/{id}) | ✅ | |
| 批准并发布 [pending_review] (230) | approveReview->POST /videos/admin/{id}/review/approve | ✅ | |
| 驳回 [pending_review] (239) | rejectReview->POST .../review/reject | ✅ | |
| 开始处理 [pending_processing] (264) | startProcessing->POST .../start-processing | ✅ | disabled 当 !workerOnline |
| "卡住了？重新恢复" [processing] (297) | recoverVideo->POST .../recover | ✅ | |
| 重新处理 [error] (322) | retryVideo->POST .../retry | ✅ | |
| 删除视频 (442) | deleteVideo->DELETE /videos/admin/{id} | ✅ | |
| 编辑表单 inputs (345-438) | setState | ✅ | |
| 保存 submit (450) | updateVideo->PATCH /videos/admin/{id} | ✅ | |
| Reject Modal / Delete ConfirmDialog / Add Modal (472/507/535) | handleConfirmReject/handleDelete/handleAddVideo->seedVideoFull POST /videos/seed-full | ✅ | |

执行问题: **无分页**(page_size:50) 📉 超 50 条截断，与 orders/users/reports 不一致。管线健康指标核心页：GPU worker 状态已有(指示灯)，缺 queue depth + error count 汇总。建议顶部加"管线健康"SectionCard。

#### C10. `(admin)/admin/(shell)/videos/[id]/page.tsx`
| 元素 | handler/目标 | 分类 | 备注 |
|---|---|---|---|
| 返回列表 (201) | router.push(/admin/videos) | ✅ | |
| 重新断句 (170) | handleResegment->**native confirm()**->resegmentSubtitles POST .../subtitles/resegment | ✅ | 原生 confirm 📉 |
| 回滚重断句 (178) | handleRollbackResegment->**native confirm()**->rollbackResegment POST .../resegment/rollback | ✅ | 同上 📉 |
| 重算全部高亮 (186) | recomputeWordLevels->POST .../word-levels/recompute | ✅ | 无确认直接执行(覆盖手动标注) |
| MetadataForm inputs (289-372) | setState | ✅ | |
| 保存元数据 (376) | updateVideo->PATCH /videos/admin/{id} | ✅ | |
| SubtitleEditor onSaveSubtitle/onSplit/onMerge/onSaveWordLevels/onListRevisions/onRollback (218-223) | updateSubtitle/splitSubtitle/mergeSubtitle/updateWordLevels/listSubtitleRevisions/rollbackSubtitle | ✅ | |

执行问题: 唯一用**原生 `confirm()`**(行 126/144)而非 `ConfirmDialog` 📉 全站不一致。"重算全部高亮"覆盖手动标注却无确认，误操作风险。

---

## 审计方法

三组并发（general-purpose agent 各一），逐页读组件 + 追 import + 追 `lib/` api 函数到后端端点，按六类分级。后端端点均已验证存在（phone-login / sms/register / sms/reset-password / sms/send-code / sms/change-phone / users/me(+avatar/preferences/onboarding) / invite-codes/* / payments/status / videos/admin/* / community/* / vocabulary/* / learning/records / recommendations/home / admin/{stats,users,reports,posts,comments,orders,worker-status} 等）。
