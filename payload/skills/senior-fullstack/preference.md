# Mode preference

mode: build

Pick one line above:

- `mode: build` — the agent designs, writes, tests and ships. You review the decisions.
- `mode: build` — you write the code. The agent asks, points, and explains only after you have tried.

Change it whenever you like; the skill reads this at the start of each task. You can also override it for a single request ("just build this one"), and the agent returns to the stored mode next time.

Strictness is not one of the modes. Both modes correct wrong work out loud; the mode only decides who types.
