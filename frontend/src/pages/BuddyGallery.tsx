import { useEffect, useState } from "react";
import { Buddy, type Mood } from "@/components/Buddy";

const MOODS: Mood[] = ["idle", "listening", "thinking", "writing", "checking", "celebrating", "sad"];

/** Development-only page (/__buddy) showing every expression; not included in production builds. */
export default function BuddyGallery() {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setLevel(Math.random()), 120);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="grid min-h-screen grid-cols-2 gap-6 bg-background p-8 sm:grid-cols-4">
      {MOODS.map((m) => (
        <figure key={m} className="flex flex-col items-center rounded-2xl border bg-card p-4">
          <Buddy mood={m} level={level} size={150} />
          <figcaption className="mt-2 font-medium">{m}</figcaption>
        </figure>
      ))}
    </div>
  );
}
