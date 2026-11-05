# Agent instructions

These instructions apply to every AI agent that works in this repo. They cover how
to write and how to open a pull request.

## How to write

Write in the spirit of Simplified Technical English (ASD-STE100). Follow its
principles. Do not use its controlled dictionary. The goal is text that any engineer
can read fast, including readers whose first language is not English.

This applies to everything you write: replies, code comments, docs, commit messages,
and pull requests.

- Put the answer or conclusion first. Then give the support.
- Write short sentences. Aim for 20 words or fewer.
- Put one idea in each sentence.
- Use active voice. Say who does the action: "The exporter drops the attribute", not
  "The attribute is dropped".
- Use present tense when you can.
- Use verbs, not nouns: "It checks the token", not "It performs token validation".
- Use common words. Use the word the reader already knows.
- Use one term for one concept. Do not change terms for variety. If a term must
  change, say so.
- Use the name the reader sees in the product or the config. For example, use
  the Argo CD Application name and the cluster name as they appear in `gitops/`.
- Define each abbreviation and team-specific term the first time you use it.
- Use numbers, not adjectives: "3 replicas", "from 1,174 to 177 bytes", not "a few"
  or "much smaller".
- Do not use idioms, metaphors, or cultural references. A non-native reader can
  misread them.
- Write procedures as numbered steps, with one action in each step.
- State uncertainty directly: "I did not verify X." Do not hedge with soft words.
- Say what you measured and what you did not.

## How to open a pull request

If you have the `pr-writing` skill, use it. It defines the format below.

The owner reads a pull request to decide one thing: merge it or not. Help them
decide fast. Use the writing rules above, and show the change instead of
describing it.

### Title

Say what the reader gets, in plain words. Use 60 characters or fewer. Do not use a
file name or a function name as the title.

- Good: `Gateway logs keep their team tag`
- Not good: `Update transform/cost-tags in _relay.tpl`

### Description

Fill in the template in `.github/pull_request_template.md`. It has this shape.
Leave out a section that has nothing to say.

```
### In one line
<What changes for the reader, in 20 words or fewer.>

### See it
<A diagram or a Before and After table.>
| | Before | After |
|---|---|---|
| <the thing> | <what happened> | <what happens now> |

### After you merge
<"Nothing to do." Or the one step the owner takes, and what to watch for.>

### Checked
- ✅ <what you ran, with numbers: "helm template for 5 environments">
- ⚠️ Not checked: <what you did not run, and why>

<details><summary>How it works</summary>

<For reviewers: files, choices, limits. Short bullets.>
</details>
```

### Show, don't tell

Pick the simplest option that fits:

- **A flow changes** (which component sends to which): use a Mermaid diagram.
  GitHub draws it from text. Keep it to about 6 boxes. Mark new parts with
  `:::new` and `classDef new fill:#2da44e,stroke:#1a7f37,color:#fff`.
- **Anything else**: use the Before and After table. Put one row for each thing the
  reader notices.

### Rules for the description

- Put the result first. File names, paths, and code go only in "How it works".
- Put each check you skipped and each known limit in "Checked" or "After you
  merge", in one line.

