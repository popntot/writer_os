import type { MiddlewareHandler } from "hono";
import type { Env } from "../env.js";

const bearerPrefix = "Bearer ";
const textEncoder = new TextEncoder();

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = textEncoder.encode(left);
  const rightBytes = textEncoder.encode(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < maxLength; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return difference === 0;
}

export const authMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (
  c,
  next,
) => {
  const authorization = c.req.header("Authorization");
  const token = authorization?.startsWith(bearerPrefix)
    ? authorization.slice(bearerPrefix.length)
    : null;

  if (token === null || !constantTimeEqual(token, c.env.WRITER_OS_API_SECRET)) {
    return c.json({ error: "unauthorized" }, 401);
  }

  return next();
};
