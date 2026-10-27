# MYSEKAI display translations

The resource region chooses the scene, animations, cameras and voice cues. The
text locale is separate. In Simplified Chinese, a matching official CN line wins,
then a published human translation, then the original line. Other locales use
their own official/human publications; Simplified Chinese is not relabelled as
Traditional Chinese.

Reading details and playback use the same Moly text resolver. It matches the
source script, display binding, stable line ID and `sourceHash`. A source catalog's
global revision may differ from the translation's source revision: unchanged
lines remain compatible. Changed or missing lines fall back to the original.
Translations are plain display strings, including literal markup-like text.

## Deployment

1. Publish a Moly release whose `embed.mjs` exports `loadTextSession` and
   `localizeEntry`, and whose stage supports `setTextSession`. Keep the existing
   same-origin `/moly/releases/<release>/` proxy: the module and iframe remain on
   the host origin.
2. Publish each immutable resource snapshot's source text index and its referenced
   buckets/objects. Add only the source reference to the snapshot manifest:

   ```json
   {"textSource":{"url":"/moly/snapshots/<snapshot>/text/index.json","sha256":"<sha256>","bytes":123}}
   ```

3. Publish official translation files separately under
   `translations/<region>/<locale>/`. They are resolved from
   `NEXT_PUBLIC_MOLY_RESOURCE_BASE`, whose normal resource-proxy configuration
   continues to apply.
4. Deploy the NextTrans MYSEKAI module and sync the extractor's source catalog.
   Its published human text is served at
   `/files/mysekai/<region>/<locale>/latest.json`. Saving a draft and making the
   public projection ready are separate steps.
5. Set `NEXT_PUBLIC_TRANSLATION_ORIGIN` when building this frontend. The default
   is `https://translation.exmeaning.com`; use the console's origin without a
   path. This selects both the public human-text endpoint and the trusted
   preview sender. In the console build, set `NEXT_PUBLIC_MOESEKAI_ORIGIN` to the
   corresponding host origin. Rebuild after changing either public environment
   variable.
6. Allow anonymous CORS reads of the public JSON objects from the host origin.
   Text requests omit credentials and reject redirects. Serve JSON with the
   correct content type, decoded byte count, and SHA-256 identity. For cross-origin
   draft popups, response policies must preserve `window.opener`; an opener-
   severing COOP configuration prevents the authenticated console handshake.

Older snapshots without `textSource` remain readable and playable in their
original language. No account session or token is sent to the stage or used for
public translation requests.

## Independent versions and caches

There are three independent publication identities:

| Identity | Contains | Changes when |
| --- | --- | --- |
| Moly release | SDK, stage and engines | Runtime code changes |
| Resource snapshot | Scenes, scripts and original text references | Resource content changes |
| Translation publication | Display overlays and their routing manifests | Translations change |

Never embed a translation `latest.json` pointer or translation revision in a
resource snapshot or its source index. A one-line correction publishes a new
translation leaf, its bucket and discovery manifest. It does not require a new
resource snapshot or WASM build. Retain immutable objects needed by historical
translation manifests independently of resource-snapshot retention.

Discovery manifests are fetched with `no-store`; immutable source and translation
objects use verified hashes and a bounded in-memory cache. The initial reading
and Play share a page-local text selection. A later explicit Play discovers the
latest publications and updates the current details and stage with the same
resolved session. Its locale is captured before the asynchronous fetch. UI locale
changes do not replace text in an ongoing playback; a new Play uses the new locale.
Stop, Close, another Play or an epoch change invalidate older pending Play requests.

Optional translation fonts are downloaded and verified as a complete set before
the stage changes its text configuration. Each session may select at most eight
fonts of up to 32 MiB each. The stage replaces the previous set only after playback
has restored to idle, and restores the previous selection if configuration fails.
Historical font revisions do not accumulate in the selected set. A font change
rebuilds the glyph atlas even when the visible code points are unchanged.

The maintained stage also discovers the independent `fonts/latest.json` below
its configured resource base. The catalogue lists exact base-font SHA coverage
and approved immutable supplements. Final display strings select supplements
automatically, including saved-draft previews; translators never upload fonts.
The engine loader supplies the verified base-font SHA, so one release's coverage
is never assumed for another. A source snapshot or translation revision does not
contain this catalogue identity. Operators publish its font/licence/history
objects once and set NextTrans's `MYSEKAI_FONT_CATALOG_URL` to the same catalogue.
NextTrans displays unsupported characters and checks every publishable draft
before changing its public pointer. The first full-font supplement costs
29,350,000 raw bytes on first use; later requests reuse immutable HTTP cache.

If translated playback cannot prepare its text or fonts, the stage shows a
specific error and does not start that Play request. Details remain available for
reading, with Retry and return-to-reading actions. A successful reading view does
not mean the stage has rendered that translation.

For an integration that explicitly pins an older translation, use the SDK's
publication arguments with historical roots instead of discovery roots:

```js
const session = await sdk.loadTextSession({
  source: snapshot.textSource,
  region: snapshot.region,
  locale: "zh-CN",
  scriptKey: entry.scriptKey,
  official: `${resourceBase}translations/jp/zh-CN/revisions/${officialRevision}.json`,
  community: `${translationOrigin}/files/mysekai/jp/zh-CN/revisions/${humanRevision}.json`,
});
const readingEntry = sdk.localizeEntry(entry, session);
player.setTextSession(session);
player.play(entry.key);
```

The regular Moesekai UI uses discovery roots on each new Play. It does not offer
a historical-translation selector. Publication children are relative to the
region/locale publication directory, including when the root is historical.

## Draft previews

In NextTrans, save the draft and choose **舞台预览已保存草稿**, then press Play in the
new Moesekai window. The host marks the reading view as a draft preview. Preview
does not change a public pointer or automatically start audio.

The console opens a window with a random `translationPreview` nonce. The host's
`ready` message and the console's `preview` response both require the exact
opener/window, trusted origin and nonce; the response also binds region and
content key. Unrelated messages are ignored. The host reads source IDs, hashes
and bindings from its selected immutable snapshot. It accepts only the draft
human overlay and ignores source/official/font references supplied by the popup.
Stale draft hashes fall back line by line to that snapshot's original text.

Draft text is held in memory for the selected content and source identity. It
cannot carry over to another conversation or resource snapshot. A newer accepted
preview message supersedes a pending older message. A locale/theme-only UI update
does not tear down the renderer or restart the preview handshake.

For a deployment check, verify public root → bucket → leaf hashes, open a saved
draft from the console, and check both details and actual stage text. Verify that
JP voices and actions remain unchanged, a locale switch leaves current playback
fixed, and a subsequent Play picks the newly selected publication. HTTP success
or a completed handshake alone does not verify the rendered stage.
# Catalogue search

The host loads the source and translation `searchBuckets` independently of the
resource catalogue. Titles and dialogue search use the same ID/sourceHash and
official/human/original priority as playback. Sixteen compact shards replace
thousands of per-script requests. A failed optional index leaves the original
catalogue usable. New playback refreshes its text publication and pins that
result in the reading view; browsing does not mutate an active playback.
