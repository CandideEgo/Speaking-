"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Volume2, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";
import type { Subtitle } from "@/types";
import { useSpeech } from "@/hooks/useSpeech";

interface WordCard {
  word: string;
  phonetic: string;
  partOfSpeech: string;
  definition: string;
  example: string | null;
  sourceSentence: string;
}

interface DictionaryEntry {
  word: string;
  phonetics: Array<{ text?: string; audio?: string }>;
  meanings: Array<{
    partOfSpeech: string;
    definitions: Array<{
      definition: string;
      example?: string;
    }>;
  }>;
}

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "shall",
  "can",
  "need",
  "dare",
  "ought",
  "used",
  "to",
  "of",
  "in",
  "for",
  "on",
  "with",
  "at",
  "by",
  "from",
  "as",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "between",
  "under",
  "and",
  "but",
  "or",
  "yet",
  "so",
  "if",
  "because",
  "although",
  "though",
  "while",
  "where",
  "when",
  "that",
  "which",
  "who",
  "whom",
  "whose",
  "what",
  "this",
  "these",
  "those",
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  "me",
  "him",
  "her",
  "us",
  "them",
  "my",
  "your",
  "his",
  "its",
  "our",
  "their",
  "mine",
  "yours",
  "hers",
  "ours",
  "theirs",
  "myself",
  "yourself",
  "himself",
  "herself",
  "itself",
  "ourselves",
  "yourselves",
  "themselves",
  "am",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "done",
  "doing",
  "get",
  "got",
  "gotten",
  "getting",
  "make",
  "made",
  "making",
  "take",
  "took",
  "taken",
  "taking",
  "go",
  "went",
  "gone",
  "going",
  "come",
  "came",
  "coming",
  "see",
  "saw",
  "seen",
  "seeing",
  "know",
  "knew",
  "known",
  "knowing",
  "think",
  "thought",
  "thinking",
  "say",
  "said",
  "saying",
  "tell",
  "told",
  "telling",
  "give",
  "gave",
  "given",
  "giving",
  "find",
  "found",
  "finding",
  "feel",
  "felt",
  "feeling",
  "become",
  "became",
  "becoming",
  "leave",
  "left",
  "leaving",
  "put",
  "putting",
  "mean",
  "meant",
  "meaning",
  "keep",
  "kept",
  "keeping",
  "let",
  "letting",
  "begin",
  "began",
  "begun",
  "beginning",
  "seem",
  "seemed",
  "seeming",
  "help",
  "helped",
  "helping",
  "show",
  "showed",
  "shown",
  "showing",
  "hear",
  "heard",
  "hearing",
  "play",
  "played",
  "playing",
  "run",
  "ran",
  "run",
  "running",
  "move",
  "moved",
  "moving",
  "live",
  "lived",
  "living",
  "believe",
  "believed",
  "believing",
  "bring",
  "brought",
  "bringing",
  "happen",
  "happened",
  "happening",
  "write",
  "wrote",
  "written",
  "writing",
  "provide",
  "provided",
  "providing",
  "sit",
  "sat",
  "sitting",
  "stand",
  "stood",
  "standing",
  "lose",
  "lost",
  "losing",
  "pay",
  "paid",
  "paying",
  "meet",
  "met",
  "meeting",
  "include",
  "included",
  "including",
  "continue",
  "continued",
  "continuing",
  "set",
  "setting",
  "learn",
  "learned",
  "learning",
  "change",
  "changed",
  "changing",
  "lead",
  "led",
  "leading",
  "understand",
  "understood",
  "understanding",
  "watch",
  "watched",
  "watching",
  "follow",
  "followed",
  "following",
  "stop",
  "stopped",
  "stopping",
  "create",
  "created",
  "creating",
  "speak",
  "spoke",
  "spoken",
  "speaking",
  "read",
  "reading",
  "allow",
  "allowed",
  "allowing",
  "add",
  "added",
  "adding",
  "spend",
  "spent",
  "spending",
  "grow",
  "grew",
  "grown",
  "growing",
  "open",
  "opened",
  "opening",
  "walk",
  "walked",
  "walking",
  "win",
  "won",
  "winning",
  "offer",
  "offered",
  "offering",
  "remember",
  "remembered",
  "remembering",
  "love",
  "loved",
  "loving",
  "consider",
  "considered",
  "considering",
  "appear",
  "appeared",
  "appearing",
  "buy",
  "bought",
  "buying",
  "wait",
  "waited",
  "waiting",
  "serve",
  "served",
  "serving",
  "die",
  "died",
  "dying",
  "send",
  "sent",
  "sending",
  "expect",
  "expected",
  "expecting",
  "build",
  "built",
  "building",
  "stay",
  "stayed",
  "staying",
  "fall",
  "fell",
  "fallen",
  "falling",
  "cut",
  "cutting",
  "reach",
  "reached",
  "reaching",
  "kill",
  "killed",
  "killing",
  "remain",
  "remained",
  "remaining",
  "just",
  "now",
  "then",
  "here",
  "there",
  "today",
  "tonight",
  "tomorrow",
  "yesterday",
  "already",
  "still",
  "also",
  "back",
  "only",
  "very",
  "well",
  "even",
  "new",
  "good",
  "first",
  "last",
  "long",
  "great",
  "little",
  "own",
  "other",
  "old",
  "right",
  "big",
  "high",
  "different",
  "small",
  "large",
  "next",
  "early",
  "young",
  "important",
  "few",
  "public",
  "bad",
  "same",
  "able",
  "all",
  "each",
  "every",
  "some",
  "many",
  "much",
  "more",
  "most",
  "another",
  "such",
  "no",
  "not",
  "never",
  "always",
  "sometimes",
  "often",
  "usually",
  "really",
  "actually",
  "probably",
  "definitely",
  "certainly",
  "clearly",
  "obviously",
  "basically",
  "generally",
  "usually",
  "finally",
  "eventually",
  "suddenly",
  "immediately",
  "recently",
  "already",
  "yet",
  "still",
  "almost",
  "quite",
  "rather",
  "pretty",
  "fairly",
  "enough",
  "indeed",
  "instead",
  "however",
  "therefore",
  "moreover",
  "furthermore",
  "nevertheless",
  "otherwise",
  "meanwhile",
  "besides",
  "accordingly",
  "consequently",
  "nonetheless",
  "likewise",
  "similarly",
  "whereas",
  "although",
  "though",
  "while",
  "unless",
  "until",
  "since",
  "before",
  "after",
  "once",
  "when",
  "whenever",
  "where",
  "wherever",
  "why",
  "how",
  "what",
  "whatever",
  "whoever",
  "whichever",
  "whether",
  "either",
  "neither",
  "both",
  "none",
  "nobody",
  "nothing",
  "nowhere",
]);

function extractWords(subtitles: Subtitle[]): string[] {
  const wordSet = new Set<string>();
  const wordSources = new Map<string, string>();

  for (const sub of subtitles) {
    const words = sub.text_en
      .toLowerCase()
      .replace(/[.,!?;:'"()\[\]]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));

    for (const word of words) {
      wordSet.add(word);
      if (!wordSources.has(word)) {
        wordSources.set(word, sub.text_en);
      }
    }
  }

  return Array.from(wordSet);
}

async function fetchWordDefinition(word: string): Promise<WordCard | null> {
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
    );
    if (!res.ok) return null;

    const data: DictionaryEntry[] = await res.json();
    const entry = data[0];
    if (!entry) return null;

    const phonetic = entry.phonetics.find((p) => p.text)?.text || "";
    const meaning = entry.meanings[0];
    const definition = meaning?.definitions[0]?.definition || "暂无释义";
    const example = meaning?.definitions[0]?.example || null;

    return {
      word: entry.word,
      phonetic,
      partOfSpeech: meaning?.partOfSpeech || "",
      definition,
      example,
      sourceSentence: "",
    };
  } catch {
    return null;
  }
}

interface FlashcardModeProps {
  subtitles: Subtitle[];
}

export default function FlashcardMode({ subtitles }: FlashcardModeProps) {
  const [words, setWords] = useState<WordCard[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [shuffled, setShuffled] = useState<WordCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const extractedWords = extractWords(subtitles);

    async function loadDefinitions() {
      setLoading(true);
      const wordSources = new Map<string, string>();

      for (const sub of subtitles) {
        const ws = sub.text_en
          .toLowerCase()
          .replace(/[.,!?;:'"()\[\]]/g, "")
          .split(/\s+/)
          .filter((w) => w.length > 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
        for (const w of ws) {
          if (!wordSources.has(w)) wordSources.set(w, sub.text_en);
        }
      }

      // Load definitions in batches to avoid rate limiting
      const cards: WordCard[] = [];
      const batchSize = 5;
      for (let i = 0; i < extractedWords.length; i += batchSize) {
        const batch = extractedWords.slice(i, i + batchSize);
        const results = await Promise.all(batch.map((w) => fetchWordDefinition(w)));
        for (const result of results) {
          if (result) {
            result.sourceSentence = wordSources.get(result.word) || "";
            cards.push(result);
          }
        }
      }

      setWords(cards);
      setShuffled([...cards].sort(() => Math.random() - 0.5));
      setIndex(0);
      setFlipped(false);
      setLoading(false);
    }

    loadDefinitions();
  }, [subtitles]);

  const current = shuffled[index];

  const { speak } = useSpeech();

  function handleSpeak(word: string) {
    speak(word, { rate: 1 });
  }

  function next() {
    if (index < shuffled.length - 1) {
      setIndex(index + 1);
      setFlipped(false);
    }
  }

  function prev() {
    if (index > 0) {
      setIndex(index - 1);
      setFlipped(false);
    }
  }

  function shuffle() {
    setShuffled([...shuffled].sort(() => Math.random() - 0.5));
    setIndex(0);
    setFlipped(false);
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full p-4 items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-coral" />
        <p className="mt-3 text-sm text-muted-foreground">正在加载单词...</p>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="flex flex-col h-full p-4 items-center justify-center">
        <p className="text-sm text-muted-foreground">暂无单词卡片</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-muted-foreground">
          {index + 1} / {shuffled.length}
        </span>
        <button
          onClick={shuffle}
          className="text-muted-foreground hover:text-ink text-xs flex items-center gap-1"
        >
          <RotateCcw size={12} /> 打乱
        </button>
      </div>

      <div
        onClick={() => setFlipped(!flipped)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setFlipped(!flipped);
          }
        }}
        className="flex-1 flex items-center justify-center cursor-pointer"
      >
        <div
          className={cn(
            "w-full max-w-md aspect-[3/2] rounded-xl border border-hairline bg-cream-card p-6 flex flex-col items-center justify-center text-center transition-all duration-300",
            flipped && "bg-cream-soft"
          )}
        >
          {!flipped ? (
            <>
              <p className="text-2xl leading-relaxed text-ink font-medium font-display">
                {current.word}
              </p>
              {current.phonetic && (
                <p className="mt-2 text-sm text-muted-foreground font-mono">{current.phonetic}</p>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSpeak(current.word);
                }}
                className="mt-4 text-coral hover:text-coral-active"
                aria-label={`朗读 ${current.word}`}
              >
                <Volume2 size={20} />
              </button>
              <p className="mt-4 text-xs text-muted-foreground/80">点击查看释义</p>
            </>
          ) : (
            <>
              <p className="text-lg leading-relaxed text-ink font-medium">{current.word}</p>
              <p className="mt-1 text-xs text-coral font-medium">{current.partOfSpeech}</p>
              <p className="mt-3 text-sm text-ink/75 leading-relaxed">{current.definition}</p>
              {current.example && (
                <p className="mt-2 text-xs text-muted-foreground italic">"{current.example}"</p>
              )}
              {current.sourceSentence && (
                <p className="mt-3 text-xs text-muted-foreground/60">
                  来源：{current.sourceSentence.slice(0, 60)}...
                </p>
              )}
              <p className="mt-4 text-xs text-muted-foreground/60">点击返回单词</p>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 mt-4">
        <button
          onClick={prev}
          disabled={index === 0}
          className="text-muted-foreground hover:text-ink disabled:opacity-30"
          aria-label="上一个单词"
        >
          <ChevronLeft size={24} />
        </button>
        <button
          onClick={next}
          disabled={index === shuffled.length - 1}
          className="text-muted-foreground hover:text-ink disabled:opacity-30"
          aria-label="下一个单词"
        >
          <ChevronRight size={24} />
        </button>
      </div>
    </div>
  );
}
