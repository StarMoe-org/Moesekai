This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Deck engine

Deck recommendation and score-control deck building use
[`@empty-sekai/allium-deck-wasm` 0.1.0](https://www.npmjs.com/package/@empty-sekai/allium-deck-wasm/v/0.1.0).
The exact version is pinned in `web/package.json` and the workspace `bun.lock`.
The frontend consumes the published package directly; no patched engine binary
or patch series is kept in this repository.

From the repository root:

```sh
bun install --frozen-lockfile
bun run --cwd web copy:wasm
```

`copy:wasm` copies the installed package into `web/public/wasm/` and generates
the version used in browser cache keys. Both development and production builds
run this step. To check an unpublished engine build locally, point
`ALLIUM_DECK_WASM_DIR` at its `wasm-pack` output before running `copy:wasm`;
normal deployments use the npm dependency.

For World Bloom finales, pinned cards and characters mean required team members;
leader selection remains a separate control. The consumer explicitly requests
the engine's `members` constraint mode for these searches. Other scenarios keep
the engine's default ordered-slot behavior. Search results preserve the engine's
`complete` or `timed_out` status: only a complete search proves canonical Top-K
for the requested conditions, while timed-out results remain legal candidates.

The Rust engine is developed in
[empty-sekai/allium-deck](https://github.com/empty-sekai/allium-deck).
Its JP7 business rules reference
[Team-Haruki/sekai-deck-recommend-cpp](https://github.com/Team-Haruki/sekai-deck-recommend-cpp),
with earlier work from the StarMoe and NeuraXmy projects. The engine's
[business-rule source map](https://github.com/empty-sekai/allium-deck/blob/v0.1.0/docs/game-rule-sources.md)
records the reference revision, rule coverage and differences between the engines.

Consumer checks (from the repository root):

```sh
bun run --cwd web test:deck-payload
bun run --cwd web test:deck-completion
node --experimental-strip-types web/scripts/smoke-deck-engine.mjs
```

The smoke check downloads public master data and uses a synthetic account.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
