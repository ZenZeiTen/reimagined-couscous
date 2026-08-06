"use client";

export default function WordChip({
  word,
  kind,
  onSelect,
}: {
  word: string;
  kind: "synonym" | "antonym";
  onSelect: (word: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(word)}
      className={`rounded-full border px-3 py-1 text-sm transition hover:opacity-80 ${
        kind === "synonym"
          ? "border-primary text-primary"
          : "border-accent text-accent"
      }`}
    >
      {word}
    </button>
  );
}
