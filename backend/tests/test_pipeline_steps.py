"""The step runner's contract (批 3b).

``run_steps`` is the machinery that replaced ``finalize_video``'s hand-written
``if not await is_step_done(...)`` sequence — the four behaviours below are the
ones that sequence used to encode by hand, and each of them is a way the eight
blocks could have disagreed with each other.

Covered with fake steps rather than through the tail's real bodies: the real
bodies need subtitle rows, an ECDICT db, an LLM and ffmpeg before they can say
anything about skip/stop/attribution, and none of those behaviours live in the
bodies.  "The bodies moved without changing" is a diff to read, not a test to
write — the one exception is the order, which
``test_pipeline_watchdog.py::TestStepBudgets`` pins against the declaration.
"""

from collections.abc import Awaitable, Callable

import pytest

from app.tasks.pipeline_helpers import TERMINAL_STEP, PipelineCtx, Step, run_steps


def _ctx() -> PipelineCtx:
    return PipelineCtx(db=object(), video=object(), video_id="v1")


def _body(
    trace: list[str], name: str, *, action: Callable[[PipelineCtx], None] | None = None
) -> Callable[[PipelineCtx], Awaitable[None]]:
    async def body(ctx: PipelineCtx) -> None:
        trace.append(name)
        if action is not None:
            action(ctx)

    return body


def _done_set(monkeypatch, done: set[str]) -> list[str]:
    """Fake the completed-step set; returns the list of names it was asked about."""
    asked: list[str] = []

    async def fake_is_step_done(video_id: str, step: str) -> bool:
        assert video_id == "v1"
        asked.append(step)
        return step in done

    monkeypatch.setattr("app.tasks.pipeline_helpers.is_step_done", fake_is_step_done)
    return asked


class TestRunSteps:
    async def test_runs_bodies_in_declared_order(self, monkeypatch):
        _done_set(monkeypatch, set())
        trace: list[str] = []
        steps = (
            Step("a", 10, run=_body(trace, "a")),
            Step("b", 20, run=_body(trace, "b")),
            Step(TERMINAL_STEP, 100, resumable=False, run=_body(trace, TERMINAL_STEP)),
        )

        await run_steps(_ctx(), steps)
        assert trace == ["a", "b", TERMINAL_STEP]

    async def test_skipped_step_still_owes_later_steps_its_skip_run(self, monkeypatch):
        """``downloading`` hands ``transcoding`` a path even on a resume.

        This is the one skip path with a side effect; the runner has to keep it
        or a resumed local upload transcode runs on ``None``.
        """
        _done_set(monkeypatch, {"downloading"})
        trace: list[str] = []

        async def skip_downloading(ctx: PipelineCtx) -> None:
            ctx.video_path = "/media/raw.mp4"

        steps = (
            Step("downloading", 75, run=_body(trace, "downloading"), skip_run=skip_downloading),
            Step("transcoding", 90, run=_body(trace, "transcoding")),
        )
        ctx = _ctx()

        await run_steps(ctx, steps)
        assert trace == ["transcoding"], "已完成的步骤不该再跑 body"
        assert ctx.video_path == "/media/raw.mp4", "skip_run 仍要给后续步骤留下路径"

    async def test_failure_is_attributed_to_the_last_step_considered(self, monkeypatch):
        """A skipped step still moves the attribution; the terminal one never does.

        The blocks this replaces assigned the step name *above* their guard, so
        a failure after a skipped step was named by that step. The terminal step
        has no name to contribute — a failure there belongs to the last step
        that did work.
        """
        _done_set(monkeypatch, {"skipped"})

        async def boom(ctx: PipelineCtx) -> None:
            raise RuntimeError("tail broke")

        trace: list[str] = []
        steps = (
            Step("skipped", 70, run=_body(trace, "skipped")),
            Step(TERMINAL_STEP, 100, resumable=False, run=boom),
        )
        ctx = _ctx()

        with pytest.raises(RuntimeError, match="tail broke"):
            await run_steps(ctx, steps)
        assert ctx.current_step == "skipped"

    async def test_stop_ends_the_chain_before_the_terminal_step(self, monkeypatch):
        """A quality block on ``translating`` must not reach ``done``."""
        _done_set(monkeypatch, set())
        trace: list[str] = []
        steps = (
            Step("a", 10, run=_body(trace, "a", action=lambda ctx: ctx.stop())),
            Step("b", 20, run=_body(trace, "b")),
            Step(TERMINAL_STEP, 100, resumable=False, run=_body(trace, TERMINAL_STEP)),
        )

        await run_steps(_ctx(), steps)
        assert trace == ["a"]

    async def test_undeclared_body_is_passed_over(self, monkeypatch):
        """Steps this task does not own (the GPU-side ones) have no body here."""
        _done_set(monkeypatch, set())
        trace: list[str] = []
        steps = (
            Step("extracting", 10),  # run=None: another task's file owns it
            Step("translating", 70, run=_body(trace, "translating")),
        )

        await run_steps(_ctx(), steps)
        assert trace == ["translating"]

    async def test_terminal_step_is_never_asked_about_resume(self, monkeypatch):
        asked = _done_set(monkeypatch, set())
        steps = (Step(TERMINAL_STEP, 100, resumable=False, run=_body([], TERMINAL_STEP)),)

        await run_steps(_ctx(), steps)
        assert asked == [], "done 之后没有步骤可续跑，问它一次都是浪费"
