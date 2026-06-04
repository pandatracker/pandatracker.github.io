"use client";

import { useRouter, useSearchParams } from "next/navigation";

export type Tab = "overview" | "attack" | "relations" | "mentions" | "otx";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview",  label: "Overview" },
  { id: "attack",     label: "ATT&CK" },
  { id: "otx",       label: "OTX" },
  { id: "relations", label: "Relations" },
  { id: "mentions",  label: "Mentions" },
];

export function useActiveTab(): Tab {
  const params = useSearchParams();
  const tab = params.get("tab");
  if (tab === "attack" || tab === "relations" || tab === "mentions" || tab === "otx") return tab;
  return "overview";
}

export default function TabNavigation({ slug }: { slug: string }) {
  const router = useRouter();
  const active = useActiveTab();

  function setTab(tab: Tab) {
    const params = tab === "overview" ? "" : `?tab=${tab}`;
    router.replace(`/group/${slug}${params}`);
  }

  return (
    <div className="border-b border-zinc-800">
      <nav className="flex gap-0 -mb-px">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              active === id
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
