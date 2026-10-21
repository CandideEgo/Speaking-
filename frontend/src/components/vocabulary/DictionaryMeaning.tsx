import { dictionaryPreview } from "@/lib/vocabularyPresentation";

export function DictionaryMeaning({
  translation,
  definition,
  partOfSpeech,
}: {
  translation: string | null;
  definition: string | null;
  partOfSpeech?: string | null;
}) {
  const meaning = dictionaryPreview(translation, definition, partOfSpeech);
  return (
    <div className="mt-1.5 text-copy text-body">
      <p>
        <span className="text-meta text-muted">词典简释：</span>
        {meaning.summary}
      </p>
      {meaning.expandable && (
        <details className="mt-1 text-meta text-muted">
          <summary className="cursor-pointer">完整词典释义</summary>
          <p className="whitespace-pre-line mt-1">{meaning.full}</p>
        </details>
      )}
    </div>
  );
}
