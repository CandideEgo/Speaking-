#!/usr/bin/env python
"""把 guojiya.cn 抓下来的真题 JSON 转成试卷库的导入格式（``import_exam_papers.py`` 消费）。

源数据（``C:/Users/Administrator/guojiya/papers/{cet4,cet6,neem}/*.json``）是**整卷**：
写作 / 听力 / 阅读 / 翻译四部分都在里面，且 passage 与 question 是分开的块。本站的
试卷库只收客观题，所以这个脚本做三件事：挑出要的题、把块重新配成站内的行、把源里
的三种形态坑修平。

## 收哪些、丢哪些

| 源 | → level | 源 part / section | 源题号 | → section | → question_type |
|---|---|---|---|---|---|
| cet4/cet6 | 同名 | Reading Comprehension / Section A | 26-35 | ``reading_A`` | ``cloze`` |
| 同上 | 同上 | Reading Comprehension / Section B | 36-45 | ``reading_B`` | ``matching`` |
| 同上 | 同上 | Reading Comprehension / Section C | 46-55 | ``reading_C`` | ``reading`` |
| neem ``_1``/``_2`` | ``ky1``/``ky2`` | Use of English | 1-20 | ``use_of_english`` | ``cloze`` |
| 同上 | 同上 | Reading Comprehension Part A | 21-40 | ``reading_C`` | ``reading`` |
| 同上 | 同上 | Reading Comprehension Part B | 41-45 | ``new_type`` | ``reading`` |

**丢掉的**：CET 的 Listening（全库 0 处音频）、Writing 与 Translation（本来就不在
``questions[]`` 里）。考研的 Translation Part C / Writing 同理。

## 源里的三个坑（不修就静默出错）

1. **CET Section B 的段落字母藏在行内**：源 passage 形如 ``…made clear.B) Does
   assisted living…``，``B)`` 直接跟在上一句句号后、**没有换行**。而 matching 的
   可作答判定要求行首 ``^([A-O])\\)`` ≥2 行（``exam_service.py`` ``is_answerable``），
   不修则每套都判「暂无可作答的题目」。修法见 ``normalize_matching``。
2. **CET Section B 源里的 ``options`` 是被截断的**（``{"A": "A", … "N": "N"}``，
   而答案字母实际用到 A-P / A-R）。所以 Section B 一律 ``options=None`` +
   ``matching``，让前端从修平后的 passage 现推选项；用了源 options 会让正确答案
   在界面上点不到。
3. **CET Section A 用 ``[word bank]`` 约定，不用 ``options``**。源每题带一份重复
   15 遍、value 还带 ``A) `` 前缀的词库；落 ``options`` 会渲染出「圆点 + ``A)
   word``」的丑形态。改成把词库拼进 passage 尾部（``import_exam_papers`` 同步语料时
   会再剥掉它）。

考研 Part B 另有两处源数据脏点：passage 尾部残留的页码（``- 12 -``）与英语一
2013/2015 两套卷**把整份 [A]-[G] 选项表印在正文末尾**的行。都在
``clean_passage`` 里剥掉。考研 Part B 必须用 ``new_type`` 而不是 ``reading_B`` ——
``reading_B`` 会带 ``matching``，前端会从 passage 现推段落选项、把已经定好的
A-G 选项表覆盖掉。

## 用法

    cd backend
    python scripts/convert_guojiya_papers.py                 # 默认源路径
    python scripts/convert_guojiya_papers.py --src <dir> --out data/papers

产出 ``guojiya_{cet4,cet6,ky1,ky2}.json`` 四份，schema 与 ``papers_cet4.json`` 一致
（CRLF、``indent=1``、无结尾换行）。脚本自带断言，任何一条不过就整体不产出。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

DEFAULT_SRC = Path("C:/Users/Administrator/guojiya/papers")

# 源 paper_id 前缀 → 站内 level。neem 的 ``_1``/``_2`` 是英语一/英语二。
CET_LEVELS = {"cet4": "cet4", "cet6": "cet6"}
NEEM_LEVELS = {"1": "ky1", "2": "ky2"}

CET_CN = {"cet4": "四", "cet6": "六"}
NEEM_CN = {"ky1": "一", "ky2": "二"}

# 源里的选项 value 带着字母前缀（``A) bid``），站内不要。
OPT_PREFIX = re.compile(r"^([A-Z])\)\s*")

# 源 passage 尾部的页码残留（``- 12 -`` 独占一行）。
PAGE_RESIDUE = re.compile(r"\n+\s*[-–—]\s*\d{1,3}\s*[-–—]\s*$")

# 英语一 Part B 的题干前缀：``(41) _______________``，也有不带下划线的
# ``(45)What counts as…``，以及剥了一半的 ``41) text``。**不匹配裸数字开头** ——
# 否则 ``2002 was the year…`` 这种会被啃掉三位。
STEM_MARKER = re.compile(r"^(?:\(\d{1,3}\)\s*_{0,}\s*|\d{1,3}\)\s*)")

# 内嵌选项表的标记。英语一 2013/2015 两套把 [A]-[G] 印在正文尾。
TABLE_MARK = re.compile(r"\[\s*_?\s*([A-G])\s*[J\]]")

# 判断题型 Part B 卷（英语二 2010 第 2 套）卷面无 A-G，造一对 T/F 选项。
TF_OPTIONS = {"T": "True", "F": "False"}


# --------------------------------------------------------------------------- 读源


def iter_papers(src: Path, sub: str):
    for f in sorted((src / sub).glob("*.json")):
        yield f.name, json.loads(f.read_text(encoding="utf-8"))


def flat_questions(doc: dict) -> dict[tuple[str, str], list[dict]]:
    """把 ``questions[]`` 按 ``(part, section)`` 分组、按题号排序。

    ``questions[]``（扁平表）才是权威：**块里的 question 只有部分源带 options**
    （合并过的那 25 套把选项写在了扁平表里，块里还是空的）。
    """
    out: dict[tuple[str, str], list[dict]] = {}
    for q in doc["questions"]:
        out.setdefault((q.get("part"), q.get("section") or ""), []).append(q)
    for qs in out.values():
        qs.sort(key=lambda q: int(q["no"]))
    return out


def passages(doc: dict, part: str, section: str = "") -> list[str]:
    """取某节里的 passage 块正文，按块顺序。"""
    out: list[str] = []
    for p in doc["parts"]:
        if p.get("name") != part:
            continue
        for s in p.get("sections") or []:
            if section and s.get("label") != section:
                continue
            for b in s.get("blocks") or []:
                if b.get("type") == "passage":
                    out.append(b.get("text") or "")
    return out


# --------------------------------------------------------------------------- 清洗


def clean_passage(text: str, *, strip_option_table: bool = False) -> str:
    """去掉页码残留；考研 Part B 另去掉尾部的内嵌 [A]-[G] 选项表。"""
    text = PAGE_RESIDUE.sub("", text)
    if strip_option_table:
        cut = embedded_table_start(text)
        if cut is not None:
            text = text[:cut]
            text = PAGE_RESIDUE.sub("", text)
    return text.strip()


def partb_blocks(doc: dict) -> tuple[list[str], list[str]]:
    """考研 Part B 的 (passage 块, paragraph 块)。

    paragraph 块是 5 个待匹配的自然段，正文开头残留一个 ``) ``（源把 ``(41`` 剥掉了）。
    英语一 2024 那套**没有 passage 块**——正文就是那 5 条评论，改由 paragraph 拼出来。
    """
    pas: list[str] = []
    paras: list[str] = []
    for p in doc["parts"]:
        if p.get("name") != "Reading Comprehension Part B":
            continue
        for s in p.get("sections") or []:
            for b in s.get("blocks") or []:
                if b.get("type") == "passage":
                    pas.append(b.get("text") or "")
                elif b.get("type") == "paragraph":
                    paras.append(re.sub(r'^["\']?\)\s*', "", b.get("text") or ""))
    return pas, paras


def embedded_table_start(text: str) -> int | None:
    """内嵌 [A]-[G] 表从哪开始；找不到完整一份就返回 None。

    用有序贪心（按 A→G 依次取「在上一个之后」的首个标记）跳过正文里的假标记；
    另要求首个 ``[A]`` 落在文章后半段 —— 英语二某套的正文里出现过 ``A) [A] …``
    这种段号 + 页眉双标记，免得把它当表切掉。
    """
    picked: list[int] = []
    floor, want = -1, list("ABCDEFG")
    for m in TABLE_MARK.finditer(text):
        if want and m.group(1) == want[0] and m.start() > floor:
            picked.append(m.start())
            floor = m.start()
            want.pop(0)
    if len(picked) != 7 or picked[0] < len(text) * 0.5:
        return None
    return picked[0]


def normalize_matching(text: str) -> str:
    """把藏在行内的段落字母 ``B)`` ``C)`` 拆成独立段落。

    顺序校验法：只接受「字母正好等于当前期望的下一字母」的 ``([A-Z])\\)``，命中就在
    该偏移前插 ``\\n\\n``。这样正文里的 ``P)``（括号缩写之类）不会被误当成段号，
    缺一个字母也不会把后面的全部错位（下一个字母不匹配就不吃）。
    """
    cuts: list[int] = []
    want = 65  # ord("A")
    for m in re.finditer(r"([A-Z])\)", text):
        if ord(m.group(1)) == want:
            cuts.append(m.start())
            want += 1
    if not cuts:
        return text.strip()
    out, prev = [], 0
    for i in cuts:
        out.append(text[prev:i])
        prev = i
    out.append(text[prev:])
    return "\n\n".join(seg.strip() for seg in out if seg.strip())


def word_bank(options: dict[str, str] | None) -> str:
    """把 Section A 的 15 键词库拼成 ``[word bank]`` 附录。"""
    assert options, "Section A 第 26 题没有 options，取不到词库"
    lines = []
    for k in sorted(options, key=lambda x: (len(x), x)):
        lines.append(f"{k}) {OPT_PREFIX.sub('', options[k]).strip()}")
    assert len(lines) >= 10, f"词库只有 {len(lines)} 条"
    return "\n\n[word bank]\n" + "\n".join(lines)


def clean_partb_stem(stem: str) -> str:
    """剥掉英语一题干头上的 ``(41) _______________`` 与它在句末留下的标点。

    源那两套（2013/2015）把题干写成「空标记 + 空后续句」，标记后面跟着一个句号：
    ``(41)______________. Humanity has the necessary…``。标记剥掉后要连句号一起剥。
    """
    s = STEM_MARKER.sub("", (stem or "").strip())
    return re.sub(r"^[.,;:）)\]】]\s*", "", s.strip()).strip()


# --------------------------------------------------------------------------- 组装


def q(
    section: str,
    number: int,
    qtype: str,
    passage: str | None,
    question: str | None,
    options: dict[str, str] | None,
    answer: str,
) -> dict:
    return {
        "section": section,
        "number": number,
        "question_type": qtype,
        "passage": passage,
        "question": question,
        "options": options,
        "answer": answer,
        "explanation": None,
    }


def convert_cet(name: str, doc: dict) -> dict:
    level = CET_LEVELS[name.split("_")[0]]
    _, year, month, set_no = name.rsplit(".", 1)[0].split("_")
    flat = flat_questions(doc)
    rc = "Reading Comprehension"
    qs: list[dict] = []

    # Section A：passage = 正文 + [word bank]，question/options 留空。
    sec_a = flat[(rc, "Section A")]
    assert [int(x["no"]) for x in sec_a] == list(range(26, 36)), f"{name}: Section A 题号不对"
    bank = word_bank(sec_a[0]["options"])
    a_passage = clean_passage(passages(doc, rc, "Section A")[0]) + bank
    for x in sec_a:
        qs.append(q("reading_A", int(x["no"]), "cloze", a_passage, None, None, x["answer"]))

    # Section B：passage 修平段落换行，options 留空（源的被截断了）。
    sec_b = flat[(rc, "Section B")]
    assert [int(x["no"]) for x in sec_b] == list(range(36, 46)), f"{name}: Section B 题号不对"
    b_passage = normalize_matching(clean_passage(passages(doc, rc, "Section B")[0]))
    letters = "".join(m.group(1) for m in re.finditer(r"(?m)^([A-Z])\)", b_passage))
    assert len(letters) >= 2, f"{name}: Section B 修平后段落字母只有 {len(letters)} 个"
    for x in sec_b:
        assert x["answer"] in letters, f"{name} {x['no']}: 答案 {x['answer']} 不在段落字母 {letters} 里 —— 修平漏了段落"
        qs.append(q("reading_B", int(x["no"]), "matching", b_passage, x["stem"], None, x["answer"]))

    # Section C：2 篇 × 5 题，按块顺序配对。
    sec_c = flat[(rc, "Section C")]
    assert [int(x["no"]) for x in sec_c] == list(range(46, 56)), f"{name}: Section C 题号不对"
    c_passages = [clean_passage(t) for t in passages(doc, rc, "Section C")]
    assert len(c_passages) == 2 and len(sec_c) == 10, f"{name}: Section C 块数不对"
    for i, x in enumerate(sec_c):
        text = c_passages[i // 5]
        opts = {k: OPT_PREFIX.sub("", v).strip() for k, v in x["options"].items()}
        qs.append(q("reading_C", int(x["no"]), "reading", text, x["stem"], opts, x["answer"]))

    assert len(qs) == 30, f"{name}: 只组装出 {len(qs)} 题"
    return {
        "level": level,
        "year": int(year),
        "month": int(month),
        "set_no": int(set_no),
        "title": f"{int(year)}年{int(month)}月大学英语{CET_CN[level]}级考试真题（第{int(set_no)}套）",
        "source": "guojiya.cn",
        "questions": qs,
    }


def convert_neem(name: str, doc: dict) -> dict:
    pid = name.rsplit(".", 1)[0]
    _, year, kind = pid.split("_")
    level = NEEM_LEVELS[kind]
    flat = flat_questions(doc)
    qs: list[dict] = []

    # Use of English 完形填空：一篇 + 20 题，每题自己的四选一。
    uoe = flat[("Use of English", "")]
    assert [int(x["no"]) for x in uoe] == list(range(1, 21)), f"{pid}: 完形题号不对"
    uoe_passage = clean_passage(passages(doc, "Use of English")[0])
    for x in uoe:
        qs.append(q("use_of_english", int(x["no"]), "cloze", uoe_passage, x["stem"], x["options"], x["answer"]))

    # Reading Part A：4 篇 × 5 题。
    part_a = flat[("Reading Comprehension Part A", "")]
    assert [int(x["no"]) for x in part_a] == list(range(21, 41)), f"{pid}: 阅读 A 题号不对"
    a_passages = [clean_passage(t) for t in passages(doc, "Reading Comprehension Part A")]
    assert len(a_passages) == 4 and len(part_a) == 20, f"{pid}: 阅读 A 块数不对"
    for i, x in enumerate(part_a):
        qs.append(q("reading_C", int(x["no"]), "reading", a_passages[i // 5], x["stem"], x["options"], x["answer"]))

    # Reading Part B 新题型：25 套有（英语一 8 + 英语二 17），其余 9 套英语一没有这一段。
    part_b = flat.get(("Reading Comprehension Part B", ""), [])
    if part_b:
        assert [int(x["no"]) for x in part_b] == list(range(41, 46)), f"{pid}: 阅读 B 题号不对"
        b_pas, b_paras = partb_blocks(doc)
        raw = "\n\n".join(b_pas + b_paras) if b_pas else "\n\n".join(b_paras)
        b_passage = clean_passage(raw, strip_option_table=True)
        assert b_passage, f"{pid}: Part B 取不到正文"
        for x in part_b:
            opts = x["options"] or {}
            if not opts:  # 判断题卷
                assert set(x["answer"]) <= set(TF_OPTIONS), f"{pid} {x['no']}: 无选项且答案不是 T/F"
                opts = TF_OPTIONS
            assert x["answer"] in opts, f"{pid} {x['no']}: 答案 {x['answer']} 不在选项里"
            qs.append(q("new_type", int(x["no"]), "reading", b_passage, clean_partb_stem(x["stem"]), opts, x["answer"]))

    assert len(qs) in (40, 45), f"{pid}: 只组装出 {len(qs)} 题"
    return {
        "level": level,
        "year": int(year),
        "month": 12,
        "set_no": 1,
        "title": f"{int(year)}年考研英语（{NEEM_CN[level]}）真题",
        "source": "guojiya.cn",
        "questions": qs,
    }


# --------------------------------------------------------------------------- 断言


def check(rec: dict) -> None:
    pid = f"{rec['level']} {rec['year']}-{rec['month']} 第{rec['set_no']}套"
    for x in rec["questions"]:
        assert x["answer"], f"{pid} {x['number']}: 答案为空"
        assert (x["passage"] or "").strip(), f"{pid} {x['number']}: passage 为空"
        if x["section"] == "reading_A":
            assert x["options"] is None and x["question"] is None, f"{pid} {x['number']}: reading_A 形状不对"
            assert "[word bank]" in x["passage"], f"{pid} {x['number']}: 没有词库附录"
            assert x["passage"].count("[word bank]") == 1, f"{pid} {x['number']}: 词库附录重复"
        elif x["section"] == "reading_B":
            assert x["options"] is None, f"{pid} {x['number']}: reading_B 不该有 options"
            assert x["question"], f"{pid} {x['number']}: reading_B 没有题干"
        else:
            assert x["options"], f"{pid} {x['number']}: {x['section']} 没有 options"
            assert x["answer"] in x["options"], f"{pid} {x['number']}: 答案不在选项里"
    got: dict[str, int] = {}
    for x in rec["questions"]:
        got[x["section"]] = got.get(x["section"], 0) + 1
    if rec["level"] in CET_LEVELS.values():
        expect = {"reading_A": 10, "reading_B": 10, "reading_C": 10}
    else:
        # 考研：完形 20 + 阅读 A 20，另有 Part B 的 5 题时才有 new_type。
        expect = {"use_of_english": 20, "reading_C": 20}
        if got.get("new_type"):
            expect["new_type"] = 5
    assert got == expect, f"{pid}: 分节题数 {got}，应为 {expect}"


# --------------------------------------------------------------------------- 出口


def dump(records: list[dict]) -> bytes:
    return json.dumps(records, ensure_ascii=False, indent=1).replace("\n", "\r\n").encode("utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", type=Path, default=DEFAULT_SRC, help=f"源目录（默认 {DEFAULT_SRC}）")
    ap.add_argument("--out", type=Path, default=Path("data/papers"), help="输出目录（默认 data/papers）")
    args = ap.parse_args()

    if not args.src.is_dir():
        print(f"[error] 源目录不存在：{args.src}", file=sys.stderr)
        return 1
    args.out.mkdir(parents=True, exist_ok=True)

    total = 0
    for sub, out_name in (
        ("cet4", "guojiya_cet4"),
        ("cet6", "guojiya_cet6"),
        ("neem", "guojiya_ky1"),
        ("neem", "guojiya_ky2"),
    ):
        records = []
        for name, doc in iter_papers(args.src, sub):
            if sub == "neem":
                kind = name.rsplit(".", 1)[0].split("_")[2]
                if NEEM_LEVELS.get(kind) != out_name.removeprefix("guojiya_"):
                    continue
                rec = convert_neem(name, doc)
            else:
                rec = convert_cet(name, doc)
            check(rec)
            records.append(rec)
        records.sort(key=lambda r: (r["year"], r["month"], r["set_no"]))
        path = args.out / f"{out_name}.json"
        path.write_bytes(dump(records))
        nq = sum(len(r["questions"]) for r in records)
        total += nq
        print(f"[ok] {path}: {len(records)} 套 / {nq} 题")
    print(f"[done] 共 {total} 题")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
