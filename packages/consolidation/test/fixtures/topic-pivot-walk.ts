import type { NewSessionTurnRow } from "@writer-os/db";

export const topicPivotWalkTurns = [
  { role: "user", content: "I started thinking this was about productivity." },
  {
    role: "assistant",
    content: "What productivity claim were you considering?",
  },
  {
    role: "user",
    content: "That routines protect writing from mood swings.",
  },
  {
    role: "assistant",
    content: "That sounds practical. Where does it feel incomplete?",
  },
  {
    role: "user",
    content: "It misses the grief underneath the routine.",
  },
  {
    role: "assistant",
    content: "So the topic is pivoting from discipline to grief.",
  },
  {
    role: "user",
    content: "Yes. The routine is a container for returning after loss.",
  },
  {
    role: "assistant",
    content: "Then the ending should stay with return, not productivity.",
  },
] satisfies Array<Pick<NewSessionTurnRow, "role" | "content">>;
