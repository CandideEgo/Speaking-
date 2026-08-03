"use client";

import { create } from "zustand";
import {
  startExam,
  startWrongRedo,
  type ExamQuestionDTO,
  type ExamStartResponse,
} from "@/lib/examData";

// ---------------------------------------------------------------------------
// State & Actions
// ---------------------------------------------------------------------------

export type ExamMode = "daily_check" | "video_exam" | "wrong_redo";

interface ExamState {
  sessionId: string | null;
  mode: ExamMode | null;
  examLevel: string | null;
  videoId: string | null;
  timeLimitSeconds: number;
  questions: ExamQuestionDTO[];
  loading: boolean;
  error: string | null;
}

interface ExamActions {
  /** Start (or restart) an exam session; replaces any current session. */
  start: (mode: ExamMode, opts?: { level?: string; videoId?: string }) => Promise<boolean>;
  reset: () => void;
}

type ExamStore = ExamState & ExamActions;

const INITIAL_STATE: ExamState = {
  sessionId: null,
  mode: null,
  examLevel: null,
  videoId: null,
  timeLimitSeconds: 1800,
  questions: [],
  loading: false,
  error: null,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useExamStore = create<ExamStore>()((set) => ({
  ...INITIAL_STATE,

  async start(mode, opts = {}) {
    set({ loading: true, error: null });
    try {
      let res: ExamStartResponse;
      if (mode === "wrong_redo") {
        res = await startWrongRedo();
      } else {
        res = await startExam(mode, { level: opts.level, videoId: opts.videoId });
      }
      set({
        sessionId: res.session_id,
        mode: res.mode,
        examLevel: res.exam_level,
        videoId: res.video_id,
        timeLimitSeconds: res.time_limit_seconds,
        questions: res.questions,
        loading: false,
        error: null,
      });
      return true;
    } catch (e) {
      const detail = e instanceof Error ? e.message : "出卷失败，请稍后重试";
      set({ ...INITIAL_STATE, error: detail });
      return false;
    }
  },

  reset() {
    set(INITIAL_STATE);
  },
}));
