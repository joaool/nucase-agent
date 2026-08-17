interface Props {
  questions: string[];
  onSelect: (question: string) => void;
}

export function SuggestedQuestions({ questions, onSelect }: Props) {
  if (questions.length === 0) return null;
  return (
    <div className="flex flex-col items-end gap-2 px-8 pb-4">
      {questions.map((q) => (
        <button
          key={q}
          type="button"
          className="rounded-full border border-accent px-3.5 py-2 text-[13px] text-accent hover:bg-accent-soft"
          onClick={() => onSelect(q)}
        >
          {q}
        </button>
      ))}
    </div>
  );
}
