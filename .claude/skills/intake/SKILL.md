# Intake — dictation in, placed work out

One input shape: the user talks (or pastes) a wall of loosely related ideas and wants it turned
into work without losing any of it. This is that pipeline's procedure.

## Trigger

- `/intake` — process what the user just dictated or pasted
- 中文同义：「记下来」「帮我整理一下」「这是我想的」「我口播了一段」「这些想法」
- Offer it unprompted when one message carries several unrelated asks: capture them all, rather
  than silently executing the first and dropping the rest

## Where the rules live

`inbox/README.md` owns the file format, the seven dispositions and what the `captures` check
enforces — read it before the first capture of a session, and do not restate its tables here.
Reasoning and cost: DEC-064. Which directory owns what: `wiki/guides/repository-layout.md`.

## Stages

### 1. Capture — write the words down exactly

1. `ls inbox/` for today's serial, then the id is `YYYY-MM-DD-NN` (`2026-09-29-02` if `…-01` is
   taken).
2. `Write` `inbox/<id>-<slug>/raw.md` in one call: the frontmatter `inbox/README.md` specifies,
   with `status: open`.
3. The body is the user's words, character for character:
   - Keep every typo, repetition, ASR mistake and contradiction. Contradictions are what stage 3
     looks for; polishing is not yours to do.
   - Do not merge, reorder, summarise, translate or add punctuation.
   - Drop only pure protocol framing ("帮我记一下", "我说完了").
4. Insert the `<!--#S01-->` cut markers at sentence or idea boundaries. One segment carries
   exactly one disposition, so cut where the topic changes: 6–20 segments for a long dictation,
   and the first marker starts the body.
5. Seal, then echo:
   ```bash
   python scripts/check-knowledge/check_knowledge.py --capture-seal <id>
   ```
   Show the user the body verbatim with the digest. That echo is the only human check on
   transcription fidelity — the seal cannot see what was typed, only that it has not moved since.
6. If the seal refuses, stop and report. It means `raw.md` changed after capture: do not re-seal
   it and do not tidy it. A correction is a new capture, and the old capture's triage points at it.

### 2. Triage — 粗剪, one row per segment

Write `triage.md`: one row per segment, in order. `摘要` is your own words (compress freely — the
original lives in `raw.md`); `处置` comes from the closed vocabulary; `去向` is a real path or
decision ID. Then report counts before anything else — how many segments, how many need a
decision, how many need an answer, how many are ready to plan. The user is checking coverage, not
prose, and an empty row is the failure they cannot see for themselves.

### 3. Grill — only what cannot be placed

For `decide` and `clarify` segments only, at most three questions at a time, one per segment, each
naming its `#Sxx`. Ask only what would move that segment's disposition; a question whose answer
changes nothing is noise. This is where an interrogation-shaped skill earns its place: not at the
door — you arrive with forty ideas, not one — but as a narrowing step after triage, aimed at what
triage could not settle.

### 4. Plan — 方案

`execute` segments, and decided ones, become plans in `docs/plans/` citing their sources as
`<id>#Sxx`; the `captures` check resolves those, so a stale citation fails the build. Update the
segment's `去向` to the plan path as it lands. Anything that needed a decision gets a `DEC-0xx`
entry first, by the usual rule.

### 5. Dispatch — 分给子代理

The splitting rules already exist: `.agent/owners.md` for slices, budgets and the ≤2 parallel
bound, `.agent/handoffs/README.md` for the ticket shape. Each handoff names the segments it
implements. Nothing new to invent here.

### Close

When no `decide` / `clarify` / `execute` segment lacks a `去向`, set `status: closed` in `raw.md`.
The frontmatter is not sealed; the body is.

## Do not

- Edit a sealed `raw.md` body, for any reason — "obvious typo" and "the user asked me to" included.
- Summarise into `raw.md`; summaries belong in `triage.md`.
- Leave a segment without a row, or invent an eighth disposition.
- Restate the disposition table here — it lives in `inbox/README.md`.
- Turn this into a gate that runs every session: it runs when there is dictation to place.
