#!/usr/bin/env python3
"""Build vocal-free versions of every song for the guess-music "hell" tier.

Lyric songs in Project SEKAI have no official instrumental, so this runs Demucs
(htdemucs) over each vocal's full mp3 and keeps drums + bass + other. Output:

    <out>/<server>/<assetbundleName>.mp3   CBR mp3, no tags (nothing names the song)
    <out>/<server>/manifest.json           {"version", "server", "model", "bitrate", "updatedAt",
                                            "items": {asset: {"musicId", "vocalId", "bytes", "durationSec"}}}

These full tracks never officially existed, so keep them private: put the <out>
folder somewhere only the Go backend can read (a local directory, or a non-public
Range-capable URL) and point GUESS_MUSIC_INST_SOURCE at it. The backend reads
<source>/<server>/manifest.json, uses only songs listed there, and hands out
clips of at most 30 s; browsers never see the files. Rerun after new songs ship:
finished files are skipped.

Setup (any Python 3.10+ with ffmpeg on PATH):
    pip install torch torchaudio demucs numpy
    python scripts/guess-music/separate_instrumentals.py --out ./guess-music-inst
A 2.5-minute song takes about 5 s on Apple Silicon (mps) and 1-2 min on CPU.
"""
import argparse
import concurrent.futures as cf
import datetime as dt
import json
import os
import subprocess
import sys
import time
import urllib.request

import numpy as np
import torch
from demucs.apply import apply_model
from demucs.pretrained import get_model

SR = 44100
MASTER = "https://metadata.exmeaning.com/{server}/master/{name}"
AUDIO = {
    "jp": "https://storage.exmeaning.com/sekai-jp-assets/music/long/{a}/{a}.mp3",
    "cn": "https://storage.exmeaning.com/sekai-cn-assets/music/long/{a}/{a}.mp3",
}
SKIP_TYPES = {"instrumental", "streaming_live"}


def fetch(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": "moesekai-guess-music-inst/1"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def decode(mp3):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", "pipe:0", "-f", "f32le", "-ac", "2", "-ar", str(SR), "pipe:1"],
        input=mp3, check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).T.copy()


def encode(wav, bitrate, path):
    tmp = path + ".part"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "pipe:0",
         "-c:a", "libmp3lame", "-b:a", bitrate, "-map_metadata", "-1", "-id3v2_version", "0",
         "-write_id3v1", "0", "-f", "mp3", tmp],
        input=np.ascontiguousarray(wav.T, dtype=np.float32).tobytes(), check=True,
    )
    os.replace(tmp, path)


def separate(model, wav, device):
    x = torch.from_numpy(wav)
    ref = x.mean(0)
    mu, sd = ref.mean(), ref.std() + 1e-8
    out = apply_model(model, ((x - mu) / sd)[None], device=device, split=True, overlap=0.25, progress=False)[0]
    out = out * sd + mu
    keep = [i for i, s in enumerate(model.sources) if s != "vocals"]
    inst = out[keep].sum(0).cpu().numpy()
    peak = float(np.abs(inst).max())
    return inst / peak * 0.98 if peak > 0.98 else inst  # avoid clipping in the encoder


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True)
    ap.add_argument("--server", default="jp", choices=sorted(AUDIO))
    ap.add_argument("--model", default="htdemucs")
    ap.add_argument("--bitrate", default="96k")
    ap.add_argument("--device", default="mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu"))
    ap.add_argument("--only", help="comma-separated assetbundleNames")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    outdir = os.path.join(args.out, args.server)
    os.makedirs(outdir, exist_ok=True)
    manifest_path = os.path.join(outdir, "manifest.json")
    manifest = {"version": 1, "server": args.server, "model": args.model, "bitrate": args.bitrate, "items": {}}
    if os.path.exists(manifest_path):
        manifest["items"] = json.load(open(manifest_path)).get("items", {})

    musics = {m["id"]: m for m in json.loads(fetch(MASTER.format(server=args.server, name="musics.json")))}
    vocals = json.loads(fetch(MASTER.format(server=args.server, name="musicVocals.json")))
    now_ms = time.time() * 1000
    todo = [
        v for v in vocals
        if v["musicVocalType"] not in SKIP_TYPES
        and v["musicId"] in musics
        and musics[v["musicId"]].get("publishedAt", 0) <= now_ms
        and not (v["assetbundleName"] in manifest["items"] and os.path.exists(os.path.join(outdir, v["assetbundleName"] + ".mp3")))
    ]
    if args.only:
        wanted = set(args.only.split(","))
        todo = [v for v in todo if v["assetbundleName"] in wanted]
    todo.sort(key=lambda v: (v["musicId"], v["id"]))
    if args.limit:
        todo = todo[: args.limit]
    print(f"{len(todo)} vocals to separate on {args.device} ({len(manifest['items'])} already done)", flush=True)

    model = get_model(args.model).eval()

    def save_manifest():
        manifest["updatedAt"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        tmp = manifest_path + ".part"
        json.dump(manifest, open(tmp, "w"), ensure_ascii=False, indent=1, sort_keys=True)
        os.replace(tmp, manifest_path)

    def download(v):
        try:
            return fetch(AUDIO[args.server].format(a=v["assetbundleName"]), timeout=120)
        except Exception as e:  # missing on the CDN: skip, retry next run
            return e

    failed = 0
    started = time.time()
    with cf.ThreadPoolExecutor(4) as pool:
        futures = [pool.submit(download, v) for v in todo[:6]]
        for i, v in enumerate(todo):
            if i + 6 < len(todo):
                futures.append(pool.submit(download, todo[i + 6]))
            data = futures[i].result()
            futures[i] = None
            asset = v["assetbundleName"]
            if isinstance(data, Exception):
                failed += 1
                print(f"[{i + 1}/{len(todo)}] {asset}: download failed: {data}", flush=True)
                continue
            try:
                wav = decode(data)
                inst = separate(model, wav, args.device)
                path = os.path.join(outdir, asset + ".mp3")
                encode(inst, args.bitrate, path)
            except Exception as e:
                failed += 1
                print(f"[{i + 1}/{len(todo)}] {asset}: failed: {e}", flush=True)
                continue
            manifest["items"][asset] = {
                "musicId": v["musicId"],
                "vocalId": v["id"],
                "bytes": os.path.getsize(path),
                "durationSec": round(wav.shape[1] / SR, 3),
            }
            if (i + 1) % 10 == 0 or i + 1 == len(todo):
                save_manifest()
                rate = (time.time() - started) / (i + 1)
                print(f"[{i + 1}/{len(todo)}] {asset} ok, {rate:.1f}s each, ~{rate * (len(todo) - i - 1) / 60:.0f} min left", flush=True)
    save_manifest()
    print(f"done: {len(manifest['items'])} in manifest, {failed} failed this run", flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
