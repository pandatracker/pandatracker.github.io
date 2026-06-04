// Shared badge components used across the app.

export function ConfidenceIndicator({ confidence }: { confidence: string | null }) {
  if (!confidence) return null;
  const map: Record<string, { symbol: string; cls: string }> = {
    high:      { symbol: "✓", cls: "text-green-400" },
    likely:    { symbol: "~", cls: "text-yellow-400" },
    suspected: { symbol: "?", cls: "text-orange-400" },
  };
  const entry = map[confidence];
  if (!entry) return null;
  return <span className={`ml-1 text-xs font-bold ${entry.cls}`} title={confidence}>{entry.symbol}</span>;
}

export function AffiliationBadge({
  affiliation,
  confidence,
}: {
  affiliation: string[] | null;
  confidence: string | null;
}) {
  if (!affiliation || affiliation.length === 0) return null;
  return (
    <>
      {affiliation.map((aff, i) => {
        const label = aff.split(/[—(]/)[0].trim();
        return (
          <span key={aff} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-500/15 text-blue-300 border border-blue-500/25">
            {label}
            {i === affiliation.length - 1 && <ConfidenceIndicator confidence={confidence} />}
          </span>
        );
      })}
    </>
  );
}
