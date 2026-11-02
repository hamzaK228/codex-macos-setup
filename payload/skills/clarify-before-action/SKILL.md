---
name: clarify-before-action
description: Turn a new request for work into an agreed task brief before execution. Use for requested changes, implementation, creation, audits or research when the user wants discussion and approval first; direct factual questions and status updates do not need this workflow.
---

# Agree on the task before acting

The user wants to shape each new task together before implementation. Rewriting the prompt improves shared understanding; it does not expand the user's scope or manufacture requirements.

1. Restate the intended outcome in the user's language. Preserve their meaning and corrections. Distinguish confirmed requirements, your recommendations and unresolved choices.
2. Present a short improved task brief: the problem, desired behavior, boundaries and how completion will be checked. For interactions, describe a concrete example of what the user clicks and what appears, moves or remains visible.
3. Ask only decision-changing questions, preferably grouped into one short round. Discuss alternatives and recommend one with its tradeoff. Avoid asking the user to decide routine implementation details.
4. Wait for explicit approval of the current brief, such as “го”, “да, делай” or its equivalent. Silence and an answer to one design question do not approve unresolved material choices. Until then, only prepare the brief and perform narrowly necessary read-only inspection; do not change project files, install dependencies or mutate external services.
Discussion, requested concepts and revisions of the brief belong to the approval phase; provide them without asking for approval to discuss. A choice of concept alone is not approval to implement it.

5. After approval, carry the agreed task through implementation and proportional verification without asking again for ordinary steps inside the approved scope. Report the result and actual limitations. Pause for a revised brief only if a new request materially changes the outcome or scope.

Follow the user's latest explicit instruction if they ask to skip discussion for a particular task. This workflow adds no authorization to publish, send messages, deploy or make unrelated changes. Do not apply project-specific choices from an earlier task to all future tasks.
