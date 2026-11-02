# Design It Twice

When alternative interfaces would clarify a consequential design, compare two or more genuinely different designs. Read relevant code and existing decisions first. See [DEEPENING.md](DEEPENING.md) for dependency categories.

State the requirements, caller examples, failure modes, and what each interface hides. Compare maintainability, migration cost, testability, and actual variation in dependencies. Recommend the smallest design that meets the requirements. A comparison does not authorize a refactor.

Work sequentially by default. Use parallel subagents only when the user or applicable higher-priority instructions authorize delegation. Keep any exploration read-only unless implementation was requested.
