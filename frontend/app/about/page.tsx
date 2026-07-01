import { Suspense } from "react";
import Link from "next/link";
import SearchBar from "@/components/SearchBar";

export const metadata = {
  title: "About — pandatracker",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-950/90 sticky top-0 z-40 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-6">
          <span className="text-2xl font-bold leading-none text-white shrink-0" style={{ fontFamily: "var(--font-brand)" }}>
            pandatracker
          </span>
          <nav className="flex items-center gap-4 text-sm text-zinc-400 mt-1.5">
            <Link href="/" className="hover:text-zinc-200 transition-colors">Dashboard</Link>
            <Link href="/groups" className="hover:text-zinc-200 transition-colors">APT Directory</Link>
            <Link href="/visualize" className="hover:text-zinc-200 transition-colors">Visualize</Link>
            <Link href="/news" className="hover:text-zinc-200 transition-colors">News Feed</Link>
            <Link href="/about" className="text-zinc-200 font-medium">About</Link>
          </nav>
          <div className="flex-1 flex justify-end">
            <Suspense>
              <SearchBar />
            </Suspense>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-10">
        <div>
          <h1 className="text-3xl font-bold text-white mb-3">About</h1>
          <p className="text-zinc-400 leading-relaxed">
            pandatracker is first and foremost a pet project that grew out of a long-standing interest in China’s activities 
            in cyberspace and a personal need for a unified reference.
            It tries to address the fragmentation of threat intelligence across vendors, researchers, 
            and investigative groups by providing a single source that brings together group identities, 
            aliases, attribution evidence, campaigns, and tooling in one place.
          </p>
        </div>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Methodology</h2>
          <div className="space-y-3 text-sm text-zinc-400 leading-relaxed">
            <p>
              Core data is human-reviewed.
              Each group file covers identity, attribution evidence, timeline, targeting, malware,
              and campaigns. Data is only added when supported by publicly available sources.
              This project does not produce new assessments and does not aim to do so. 
            </p>
            <p>
              ATT&CK technique and software data is fetched automatically from the{" "}
              <a href="https://attack.mitre.org" target="_blank" rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300">
                ATT&CK
              </a>{" "}
              Enterprise dataset via the official STIX bundle. This data is never manually edited
              and is displayed separately from the curated data to maintain a clear provenance
              distinction.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Attribution Confidence</h2>
          <div className="text-sm text-zinc-400 leading-relaxed space-y-2">
            <p>
              Attribution in threat intelligence is rarely certain. pandatracker uses three confidence levels:
            </p>
            <ul className="space-y-1 pl-4">
              <li><span className="text-green-400 font-medium">High</span> — backed by official indictment or leaked documents directly identifying the actors.</li>
              <li><span className="text-yellow-400 font-medium">Likely</span> — strong circumstantial or technical evidence pointing to a specific entity.</li>
              <li><span className="text-orange-400 font-medium">Suspected</span> — assessed based on targeting patterns, infrastructure, or TTPs consistent with known entities.</li>
            </ul>
            <p>
              Mistakes or inconsistencies may (and do) occur. Attribution claims should always be verified against the primary sources.
              Do not treat pandatracker as a definitive authority (or as any authority for that matter).
            </p>
          </div>

        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Naming Conventions</h2>
          <p className="text-sm text-zinc-400 leading-relaxed mb-4">
            Each vendor tracks threat groups independently and under different naming schemes.
            The same actor often carries four or five names across sources.
          </p>
          <div className="space-y-0 text-sm divide-y divide-zinc-800/60">
            {[
              {
                vendor: "Mandiant / Google",
                china: "APT + number",
                note: "APT41, APT40, APT31, APT27. Uncategorized clusters use UNC + number. Sequential — no country indicator in the number.",
              },
              {
                vendor: "Microsoft",
                china: "Typhoon",
                note: "Silk Typhoon, Volt Typhoon, Salt Typhoon, Brass Typhoon. Pre-2023: chemical elements (HAFNIUM, BARIUM, ZIRCONIUM) and DEV- prefixes. Russia = Blizzard, Iran = Sandstorm, NK = Sleet.",
              },
              {
                vendor: "CrowdStrike",
                china: "Panda",
                note: "Mustang Panda, Wicked Panda, Judgment Panda, Lotus Panda, Operator Panda. Russia = Bear, Iran = Kitten, NK = Chollima.",
              },
              {
                vendor: "Palo Alto Unit 42",
                china: "Taurus",
                note: "Stately Taurus, Insidious Taurus. Also uses older names like PKPLUG. Russia = Ursa, Iran = Aries / Lynx.",
              },
              {
                vendor: "Secureworks",
                china: "BRONZE",
                note: "BRONZE PRESIDENT, BRONZE ATLAS, BRONZE MOHAWK, BRONZE SILHOUETTE, BRONZE VINEWOOD. Russia = IRON, Iran = COBALT, NK = NICKEL.",
              },
              {
                vendor: "Recorded Future",
                china: "Red",
                note: "RedDelta, RedGolf, Red Keres, Red Lich, RedMike. Russia = Blue, Iran = Yellow / Orange.",
              },
              {
                vendor: "Trend Micro",
                china: "Earth",
                note: "Earth Preta, Earth Baku, Earth Estries, Earth Lusca. Earth prefix is not exclusive to China.",
              },
              {
                vendor: "Symantec / Broadcom",
                china: "No prefix",
                note: "Standalone names — Billbug, Thrip, Blackfly, Grayfly. No systematic country indicator.",
              },
              {
                vendor: "Proofpoint",
                china: "TA + number",
                note: "TA416, TA412. Sequential, no country indicator.",
              },
              {
                vendor: "ATT&CK",
                china: "G + number",
                note: "G0096, G0065, G0030. Vendor-neutral registry; typically adopts the primary name used by the discovering vendor.",
              },
            ].map(({ vendor, china, note }) => (
              <div key={vendor} className="py-3 grid grid-cols-[160px_90px_1fr] gap-x-4 items-start">
                <span className="text-zinc-200 font-medium">{vendor}</span>
                <span className="text-blue-400 font-mono text-xs pt-0.5">{china}</span>
                <span className="text-zinc-500 leading-relaxed">{note}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Licensing</h2>
          <div className="text-sm text-zinc-400 leading-relaxed space-y-2">
            <p>
              Do whatever you like with the data you find here. No credit needed. This project does not invent anything new, it simply collects and organizes publicly available references.
            </p>
            <p>
              MITRE ATT&CK® data is used under the{" "}
              <a href="https://attack.mitre.org/resources/terms-of-use/" target="_blank"
                rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                ATT&CK Terms of Use
              </a>
              . © The MITRE Corporation. Reproduced and distributed with permission.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Contributing</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Contributions are welcomed. Contact via email pandatrckr@proton.me.
          </p>
        </section>
      </main>
    </div>
  );
}
