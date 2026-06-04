import fs from "fs";
import path from "path";
import GroupDetailClient from "./GroupDetailClient";

export function generateStaticParams(): { slug: string }[] {
  const filePath = path.join(process.cwd(), "public", "data", "groups.json");
  if (!fs.existsSync(filePath)) {
    console.warn("Warning: public/data/groups.json not found. Run export_static.py first.");
    return [];
  }
  const groups = JSON.parse(fs.readFileSync(filePath, "utf8")) as Array<{ slug: string }>;
  return groups.map((g) => ({ slug: g.slug }));
}

export default function GroupPage() {
  return <GroupDetailClient />;
}
