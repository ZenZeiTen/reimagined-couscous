export default function EmptyState({ query }: { query: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-8 text-center">
      <p className="text-4xl">📖</p>
      <h3 className="mt-3 text-lg font-semibold">
        Kata tidak ditemukan / Word not found
      </h3>
      <p className="mt-1 text-sm text-muted">
        Tidak ada hasil untuk <span className="font-semibold">“{query}”</span>.
        Periksa ejaan atau ganti arah bahasa. / No results for{" "}
        <span className="font-semibold">“{query}”</span>. Check the spelling or
        switch the language direction.
      </p>
    </div>
  );
}
