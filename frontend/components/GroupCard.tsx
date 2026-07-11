import Link from "next/link";
import { GroupListItem } from "@/lib/api";
import { AffiliationBadge } from "./badges";

const MAX_ALIASES = 3;
const MAX_SECTORS = 3;
const DESCRIPTION_LENGTH = 150;

export default function GroupCard({ group }: { group: GroupListItem }) {
  const { name, slug, aliases, last_seen, affiliation, affiliation_confidence,
          target_sectors, first_seen, description } = group;

  const aliasDisplay = aliases.slice(0, MAX_ALIASES).join(" · ");
  const extraAliases = aliases.length > MAX_ALIASES ? aliases.length - MAX_ALIASES : 0;

  const visibleSectors = target_sectors.slice(0, MAX_SECTORS);
  const extraSectors = target_sectors.length > MAX_SECTORS ? target_sectors.length - MAX_SECTORS : 0;

  const shortDesc = description
    ? description.length > DESCRIPTION_LENGTH
      ? description.slice(0, DESCRIPTION_LENGTH).trimEnd() + "…"
      : description
    : null;

  return (
    <Link
      href={`/group/${slug}`}
      className="block bg-white border border-gray-200 rounded-lg p-5 hover:border-gray-400 hover:bg-gray-50 transition-colors duration-150"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h2 className="text-lg font-bold text-gray-900 leading-tight">{name}</h2>
        {last_seen && (
          <span className="text-xs text-gray-400 shrink-0">Last seen {last_seen}</span>
        )}
      </div>

      {/* Aliases */}
      {aliases.length > 0 && (
        <p className="text-xs text-gray-400 mb-3 leading-relaxed">
          {aliasDisplay}
          {extraAliases > 0 && <span className="text-gray-400"> +{extraAliases} more</span>}
        </p>
      )}

      {/* Affiliation */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <AffiliationBadge affiliation={affiliation} confidence={affiliation_confidence} />
      </div>

      {/* Target sectors */}
      {visibleSectors.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {visibleSectors.map((s) => (
            <span
              key={s}
              className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-500 border border-gray-300"
            >
              {s}
            </span>
          ))}
          {extraSectors > 0 && (
            <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-400 border border-gray-300">
              +{extraSectors}
            </span>
          )}
        </div>
      )}

      {/* Description */}
      {shortDesc && (
        <p className="text-sm text-gray-500 leading-relaxed mb-3">{shortDesc}</p>
      )}

      {/* Footer */}
      {first_seen && (
        <p className="text-xs text-gray-400">
          First seen {first_seen}
        </p>
      )}
    </Link>
  );
}
