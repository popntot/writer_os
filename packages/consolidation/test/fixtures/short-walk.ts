import type { NewSessionTurnRow } from "@writer-os/db";

export const shortWalkTurns = [
  { role: "user", content: "I think the essay is really about attention." },
  {
    role: "assistant",
    content: "What kind of attention do you want to distinguish?",
  },
  {
    role: "user",
    content: "The useful kind is deliberate, not just reactive scrolling.",
  },
  {
    role: "assistant",
    content: "So the piece argues for chosen attention over ambient input.",
  },
] satisfies Array<Pick<NewSessionTurnRow, "role" | "content">>;
