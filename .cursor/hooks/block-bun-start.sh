#!/bin/bash
# Block bun start, bun run dev, vite dev - prevents agent from starting dev servers

input=$(cat)
command=$(echo "$input" | jq -r '.command // empty')

cat << EOF
{
  "permission": "deny",
  "user_message": "Dev server commands (bun start, bun run dev, vite dev) are blocked.",
  "agent_message": "The command has been blocked. Do not run dev servers (bun start, bun run dev, vite dev) via the agent."
}
EOF
exit 2
