# assistance/

> L2 | Parent: [scripts](../../README.md)

- `samples.json`: Sixty distinct synthetic annotated cases, including twelve execution-fact cases and forty non-Chinese output requests.
- `run.mjs`: Offline validation and explicit authorization gate; no authorized flag means zero model calls.
- `live.ts`: Fixed-provider comparison of the existing drafting prompt with contextual assistance. Captures returned model/usage when available and leaves human grades pending.

Run `pnpm eval:assistance` for the offline check. Live execution requires explicit owner approval, `GOALLOOM_ASSISTANCE_EVAL_AUTHORIZED=1`, an optional `GOALLOOM_ASSISTANCE_PROVIDER` (`openrouter` or `vercel-gateway`) and the matching `OPENROUTER_API_KEY` or `AI_GATEWAY_API_KEY`. `GOALLOOM_ASSISTANCE_SAMPLE` selects one annotated case.

Results go to ignored `output/eval/assistance/`. Keys are never printed. Unknown cost/usage remains unknown. A successful structure parse is not human quality acceptance; the baseline returns a title while assistance returns guidance or a question.

[PROTOCOL]: Update this header when making changes, then check README.md.
