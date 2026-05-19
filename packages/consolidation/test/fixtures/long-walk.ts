import type { NewSessionTurnRow } from "@writer-os/db";

export const longWalkTurns = [
  { role: "user", content: "The opening should begin with the failed draft." },
  { role: "assistant", content: "What did that failed draft reveal?" },
  { role: "user", content: "It showed that I was writing toward approval." },
  {
    role: "assistant",
    content: "That sounds like a useful contrast for the argument.",
  },
  { role: "user", content: "Yes. The real subject is creative independence." },
  {
    role: "assistant",
    content: "How does independence differ from isolation in the piece?",
  },
  {
    role: "user",
    content: "Independence still needs readers, but not permission.",
  },
  { role: "assistant", content: "Readers are witnesses, not gatekeepers." },
  {
    role: "user",
    content: "Exactly. The middle can use the workshop story.",
  },
  {
    role: "assistant",
    content: "The workshop story can embody the approval trap.",
  },
  {
    role: "user",
    content: "Then the ending returns to the desk after the workshop.",
  },
  {
    role: "assistant",
    content: "That gives the essay a clean before and after structure.",
  },
  {
    role: "user",
    content: "The last line should be about choosing the work again.",
  },
  {
    role: "assistant",
    content: "So the argument lands on recommitment instead of rebellion.",
  },
  {
    role: "user",
    content: "Yes, recommitment is the more honest word.",
  },
] satisfies Array<Pick<NewSessionTurnRow, "role" | "content">>;
