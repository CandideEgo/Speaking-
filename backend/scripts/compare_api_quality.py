#!/usr/bin/env python
"""Compare 3 APIs quality on same 15 exam words — print side-by-side table."""

import io
import json
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

AGNES = json.loads(r"""
[
  {"word":"abandon","contextual_note":"彻底放弃或抛弃，常指停止支持、离开某人或某物。","pitfalls":"勿与abide混淆；注意其名词形式为abandonment。","knowledge":"搭配：abandon oneself to（沉溺于），含贬义。"},
  {"word":"beneath","contextual_note":"在……下方；低于……标准；不值得做某事。","pitfalls":"易误用为below，beneath更强调位置低或地位低下。","knowledge":"修辞用法：It is beneath me.（这有失我的身份。）"},
  {"word":"contemplate","contextual_note":"深思熟虑；凝视；打算做某事。","pitfalls":"比think正式，侧重长时间、严肃的思考或观察。","knowledge":"搭配：contemplate doing sth.（考虑做某事）。"},
  {"word":"deteriorate","contextual_note":"（情况、健康、关系等）恶化，变坏。","pitfalls":"不及物动词，无被动语态；勿与decline（下降）完全混用。","knowledge":"词根：deterior-（更坏），对比improve。"},
  {"word":"elaborate","contextual_note":"详尽阐述；精心制作的；复杂的。","pitfalls":"作动词时重音在后；作形容词读/ɪˈlæbərət/。","knowledge":"搭配：elaborate on（详细论述）；elaborate plan（复杂计划）。"},
  {"word":"fluctuate","contextual_note":"波动，起伏不定（价格、温度、情绪等）。","pitfalls":"常与up and down连用；勿与vary（变化）完全等同。","knowledge":"搭配：fluctuate between A and B（在A和B之间波动）。"},
  {"word":"genuine","contextual_note":"真正的，真诚的；非伪造的。","pitfalls":"区别于real，genuine强调来源真实或情感真挚。","knowledge":"搭配：genuine leather（真皮）；genuine interest（真诚的兴趣）。"},
  {"word":"hypothesis","contextual_note":"假设，假说（科学或逻辑推理的基础）。","pitfalls":"复数为hypotheses；勿与theory（理论）混淆。","knowledge":"搭配：test/prove a hypothesis（检验/证明假设）。"},
  {"word":"inevitable","contextual_note":"不可避免的，必然发生的。","pitfalls":"常接动名词或从句；语气较强，指无法阻止。","knowledge":"搭配：be inevitable that...；inevitable consequence（必然结果）。"},
  {"word":"legitimate","contextual_note":"合法的；正当的；合理的。","pitfalls":"勿与legal完全等同，legitimate更侧重合乎情理或传统。","knowledge":"搭配：legitimate concern（合理的担忧）；legitimate child（婚生子）。"},
  {"word":"melancholy","contextual_note":"忧郁的，悲伤的；一种淡淡的哀愁。","pitfalls":"比sad更文学化，常指持久、深沉的忧伤。","knowledge":"搭配：feel a sense of melancholy；melancholy mood（忧郁心境）。"},
  {"word":"negotiate","contextual_note":"谈判，协商；顺利通过（难关、弯道等）。","pitfalls":"作\u300c通过\u300d解时较正式；注意及物用法。","knowledge":"搭配：negotiate a deal（达成协议）；negotiate a turn（转弯）。"},
  {"word":"paradox","contextual_note":"悖论，自相矛盾的人或事。","pitfalls":"指看似矛盾却可能真理的事物，非单纯错误。","knowledge":"搭配：apparent paradox（表面上的悖论）；living paradox（矛盾体）。"},
  {"word":"reluctant","contextual_note":"不情愿的，勉强的。","pitfalls":"后接to do；近义词hesitant侧重犹豫，reluctant侧重不愿。","knowledge":"搭配：be reluctant to do sth.（不情愿做某事）。"},
  {"word":"substantiate","contextual_note":"证实，证明（观点、指控等）的真实性。","pitfalls":"正式用语；勿与simplify（简化）或substitute（替代）混淆。","knowledge":"搭配：substantiate a claim（证实主张）；substantiate evidence（确凿证据）。"}
]
""")

QWEN6 = json.loads(r"""
[
  {"word":"abandon","contextual_note":"彻底放弃或抛弃某人/某物，含贬义或无奈，非\u300c中止\u300d。","pitfalls":"勿与quit混淆，abandon强调完全舍弃，常接人或抽象概念。","knowledge":"搭配：abandon hope/idea/ship。注意发音 /əˈbændən/，重音在第二音节。"},
  {"word":"beneath","contextual_note":"在……下方（正下方），或引申为\u300c不配做\u300d、\u300c有失身份\u300d。","pitfalls":"勿与under混用，beneath更正式，且常含情感色彩（如轻视）。","knowledge":"搭配：beneath notice（不屑一顾）。文学色彩较浓，正式文体常用。"},
  {"word":"contemplate","contextual_note":"深思、凝视或仔细考虑，语气比think正式，强调专注。","pitfalls":"勿与consider完全等同，contemplate更侧重长时间、深入的思考或冥想。","knowledge":"搭配：contemplate doing sth.（考虑做某事）。源自拉丁语templum（神庙），含沉思之意。"},
  {"word":"deteriorate","contextual_note":"（情况、健康、关系等）恶化、变坏，正式用语。","pitfalls":"勿与decline混淆，deteriorate强调质量或状态的负面退化。","knowledge":"搭配：health deteriorates/condition deteriorates。反义词：improve。学术/新闻高频词。"},
  {"word":"elaborate","contextual_note":"（动词）详细阐述；（形容词）精心制作的、复杂的。","pitfalls":"注意词性变化：动词重音在第二音节，形容词重音在第一音节。","knowledge":"搭配：elaborate on sth.（详述某事）。形容词常修饰plan/design。正式文体常用。"},
  {"word":"fluctuate","contextual_note":"（价格、数量、情绪等）波动、起伏不定，无固定方向。","pitfalls":"勿与vary混用，fluctuate强调不规则、反复的上下波动。","knowledge":"搭配：fluctuate between A and B。常与prices/temperatures/stock markets连用。"},
  {"word":"genuine","contextual_note":"真正的、真诚的、非伪造的，强调真实性或情感真挚。","pitfalls":"勿与real完全等同，genuine更强调\u300c非假冒\u300d或\u300c发自内心的\u300d。","knowledge":"搭配：genuine leather/interest/apology。反义词：fake/artificial。正式且常用。"},
  {"word":"hypothesis","contextual_note":"假设、假说，科学或逻辑推理中待验证的前提。","pitfalls":"勿与theory混淆，hypothesis是初步假设，theory是经过验证的理论。","knowledge":"搭配：test/verify a hypothesis。复数形式为hypotheses。学术核心词。"},
  {"word":"inevitable","contextual_note":"不可避免的、必然发生的，强调结果无法改变。","pitfalls":"勿与unavoidable完全等同，inevitable语气更强，常指命运或规律使然。","knowledge":"搭配：inevitable result/consequence。名词形式：inevitability。正式文体常用。"},
  {"word":"legitimate","contextual_note":"合法的、正当的、合理的，强调符合法律或逻辑。","pitfalls":"勿与legal混用，legitimate更侧重\u300c正当性\u300d或\u300c合理性\u300d，不仅指法律。","knowledge":"搭配：legitimate business/claim/question。反义词：illegitimate。正式且多用于辩论。"},
  {"word":"melancholy","contextual_note":"忧郁、愁思，一种深沉、持久的悲伤情绪，常带诗意。","pitfalls":"勿与sad混用，melancholy更含蓄、深沉，常含审美或哲学意味。","knowledge":"搭配：feel a sense of melancholy。名词/形容词通用。文学色彩浓厚，非日常口语。"},
  {"word":"negotiate","contextual_note":"谈判、协商；（动词）顺利通过（障碍、困难等）。","pitfalls":"注意双义：既指商业/外交谈判，也指\u300c克服\u300d困难（如negotiate a turn）。","knowledge":"搭配：negotiate a deal/contract。引申义：negotiate difficulties。商务/驾驶场景高频。"},
  {"word":"paradox","contextual_note":"悖论、矛盾，指看似矛盾却可能真实的陈述或情况。","pitfalls":"勿与contradiction混用，paradox强调表面矛盾下的深层逻辑或讽刺。","knowledge":"搭配：apparent paradox/paradox of choice。哲学/逻辑/文学常用词。"},
  {"word":"reluctant","contextual_note":"不情愿的、勉强的，强调内心抵触或犹豫。","pitfalls":"勿与unwilling混用，reluctant更强调\u300c勉强同意\u300d而非完全拒绝。","knowledge":"搭配：be reluctant to do sth.。近义词：hesitant。正式且常用，描述态度。"},
  {"word":"substantiate","contextual_note":"证实、证明（观点、指控等）有根据，正式用语。","pitfalls":"勿与confirm混用，substantiate强调提供证据使假设成立，更学术。","knowledge":"搭配：substantiate a claim/accusation。名词形式：substantiation。学术/法律高频词。"}
]
""")

QWEN5 = json.loads(r"""
[
  {"word":"abandon","contextual_note":"指彻底放弃某物或某人，常含情感色彩，如放弃希望或遗弃孩子。","pitfalls":"勿与give up混淆，abandon更强调完全抛弃且常带负面后果。","knowledge":"作动词时直接接宾语；名词形式为abandonment。"},
  {"word":"beneath","contextual_note":"表示在...正下方，也可引申为地位低于或不值得做某事。","pitfalls":"勿误用为below，beneath更强调垂直正下方或隐喻的卑微。","knowledge":"正式语体常用，搭配beneath one's dignity（有失身份）。"},
  {"word":"contemplate","contextual_note":"指深思熟虑地考虑某事，或凝视某物出神，比think更庄重。","pitfalls":"勿简单等同于look at，它包含深度思考或长时间注视之意。","knowledge":"后接动名词（contemplate doing）或名词，常用于学术或文学语境。"},
  {"word":"deteriorate","contextual_note":"描述情况、健康或关系等逐渐恶化，语气较正式。","pitfalls":"勿与damage混淆，deteriorate强调自身变坏而非外力破坏。","knowledge":"不及物动词，常搭配health deteriorates或situation deteriorates。"},
  {"word":"elaborate","contextual_note":"作动词指详细阐述观点，作形容词指精心制作的或复杂的。","pitfalls":"勿将动词读音读成形容词音，动词重音在后，形容词在前。","knowledge":"动词常接on/about，如elaborate on the plan（详述计划）。"},
  {"word":"fluctuate","contextual_note":"指价格、情绪或数量上下波动，无固定方向的变化。","pitfalls":"勿误用为change，fluctuate特指反复无常的起伏变化。","knowledge":"不及物动词，常搭配prices fluctuate或fluctuate between A and B。"},
  {"word":"genuine","contextual_note":"形容物品是真的、非伪造的，或情感是真诚的、发自内心的。","pitfalls":"勿与real完全等同，genuine更强调来源真实或情感纯粹。","knowledge":"反义词为fake或artificial，常修饰feeling或product。"},
  {"word":"hypothesis","contextual_note":"科学或逻辑中提出的假设性解释，需通过实验或论证验证。","pitfalls":"勿与theory混淆，hypothesis是待验证的猜想，theory是已证实的理论。","knowledge":"复数形式为hypotheses，常搭配test a hypothesis（检验假设）。"},
  {"word":"inevitable","contextual_note":"指不可避免、注定发生的事，常带有宿命感或无奈感。","pitfalls":"勿误用为unavoidable的口语化表达，inevitable更正式且语气强。","knowledge":"名词形式为inevitability，常搭配the inevitable result（必然结果）。"},
  {"word":"legitimate","contextual_note":"指合法的、正当的，或符合法律/道德规范的。","pitfalls":"勿仅理解为合法，也包含合理、站得住脚的含义。","knowledge":"名词形式为legitimacy，常搭配legitimate claim（正当权利）。"},
  {"word":"melancholy","contextual_note":"一种深沉、持久的忧郁情绪，常带有诗意或怀旧色彩。","pitfalls":"勿与sad混淆，melancholy更含蓄、深沉，非短暂悲伤。","knowledge":"可作名词或形容词，文学作品中常见，如a sense of melancholy。"},
  {"word":"negotiate","contextual_note":"指通过谈判达成协议，或熟练地处理困难局面（如开车过弯）。","pitfalls":"勿只理解为谈生意，也可指解决复杂问题或避开障碍。","knowledge":"及物动词，可直接接宾语，如negotiate a deal或negotiate the curve。"},
  {"word":"paradox","contextual_note":"指看似矛盾却可能真实的陈述，或自相矛盾的现象。","pitfalls":"勿与contradiction混淆，paradox表面矛盾但内在可能有理。","knowledge":"常搭配living paradox（活生生的矛盾），用于哲学或逻辑讨论。"},
  {"word":"reluctant","contextual_note":"表示不情愿、勉强做某事，内心有抵触情绪。","pitfalls":"勿与unwilling完全等同，reluctant强调虽有阻力但仍可能行动。","knowledge":"常搭配be reluctant to do sth，语气比unwilling稍委婉。"},
  {"word":"substantiate","contextual_note":"提供证据来证明某事的真实性，使论点更有说服力。","pitfalls":"勿与prove混淆，substantiate强调用具体证据支撑，非绝对证实。","knowledge":"正式用语，常搭配substantiate a claim（证实主张）或substantiate allegations。"}
]
""")


# Scoring
def score_note(note):
    """Rough quality score: 0-10 per field, based on informativeness and accuracy."""
    s = 0
    # contextual_note: should be specific, not just dictionary copy
    cn = note.get("contextual_note", "")
    if len(cn) > 10:
        s += 2
    if any(kw in cn for kw in ["指", "常", "强调", "含", "非"]):
        s += 1  # has nuance
    # pitfalls: should name specific confusion words
    pit = note.get("pitfalls", "")
    if len(pit) > 10:
        s += 2
    if any(c in pit for c in ["勿", "易", "注意", "区别"]):
        s += 1  # has specific warning
    # knowledge: should have collocations or usage tips
    kn = note.get("knowledge", "")
    if len(kn) > 10:
        s += 2
    if any(kw in kn for kw in ["搭配", "词根", "反义", "复数", "名词形式", "引申"]):
        s += 2  # has concrete info
    return s


print("# 三 API 词汇预热质量对比")
print()
print(
    "测试词：abandon, beneath, contemplate, deteriorate, elaborate, fluctuate, genuine, hypothesis, inevitable, legitimate, melancholy, negotiate, paradox, reluctant, substantiate"
)
print()
print("## 逐词对比")
print()

for i, w in enumerate(
    [
        "abandon",
        "beneath",
        "contemplate",
        "deteriorate",
        "elaborate",
        "fluctuate",
        "genuine",
        "hypothesis",
        "inevitable",
        "legitimate",
        "melancholy",
        "negotiate",
        "paradox",
        "reluctant",
        "substantiate",
    ]
):
    a = AGNES[i]
    q6 = QWEN6[i]
    q5 = QWEN5[i]
    print(f"### {i + 1}. {w}")
    print()
    print("| 字段 | 🔵 Agnes (agnes-2.0-flash) | 🟢 讯飞 Qwen3-6B | 🟡 讯飞 Qwen3-5B |")
    print("|------|---------------------------|-------------------|-------------------|")
    print(f"| 释义 | {a['contextual_note']} | {q6['contextual_note']} | {q5['contextual_note']} |")
    print(f"| 易错 | {a['pitfalls']} | {q6['pitfalls']} | {q5['pitfalls']} |")
    print(f"| 拓展 | {a['knowledge']} | {q6['knowledge']} | {q5['knowledge']} |")
    print()

# Summary scores
print("## 质量评分（10分制/词，满分150）")
print()
a_total = sum(score_note(n) for n in AGNES)
q6_total = sum(score_note(n) for n in QWEN6)
q5_total = sum(score_note(n) for n in QWEN5)
print("| API | 总分 | 平均/词 | 速度 |")
print("|-----|------|---------|------|")
print(f"| 🔵 Agnes (agnes-2.0-flash) | {a_total}/150 | {a_total / 15:.1f} | 37.2s/15词 (2.5s/词) |")
print(f"| 🟢 讯飞 Qwen3-6B | {q6_total}/150 | {q6_total / 15:.1f} | 20.5s/15词 (1.4s/词) |")
print(f"| 🟡 讯飞 Qwen3-5B | {q5_total}/150 | {q5_total / 15:.1f} | 11.5s/15词 (0.8s/词) |")
print()

# Per-word detail
print("## 逐词评分")
print()
print("| 词 | Agnes | Qwen3-6B | Qwen3-5B |")
print("|----|-------|----------|----------|")
for i, w in enumerate(
    [
        "abandon",
        "beneath",
        "contemplate",
        "deteriorate",
        "elaborate",
        "fluctuate",
        "genuine",
        "hypothesis",
        "inevitable",
        "legitimate",
        "melancholy",
        "negotiate",
        "paradox",
        "reluctant",
        "substantiate",
    ]
):
    sa = score_note(AGNES[i])
    sq6 = score_note(QWEN6[i])
    sq5 = score_note(QWEN5[i])
    print(f"| {w} | {sa} | {sq6} | {sq5} |")
