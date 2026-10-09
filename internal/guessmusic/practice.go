package guessmusic

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"math"
	"net/http"
	"strconv"
	"time"
	"unicode/utf8"
)

// Free play with vocal removal: the browser picks the vocal, the server
// picks where the clip starts (from a seed, so share links reproduce it) and
// hands out a short-lived opaque token for the clip bytes. A client cannot
// choose offsets, so it cannot stitch the private instrumental back together.

const (
	practiceTokenTTL     = 30 * time.Minute
	practiceTokenVersion = 1
	practiceMaxRound     = 99
	practiceMaxSeedChars = 64
	practicePlainLen     = 1 + 4 + 4 + 1 + 8 // version, vocal, startMs, seconds, expiry
	practiceIVLen        = aes.BlockSize
	practiceMACLen       = 16
	practiceTokenLen     = practiceIVLen + practicePlainLen + practiceMACLen
	practiceClipsPath    = "/api/guess-music/practice/clips/"
)

// practiceClipSeconds are the clip lengths free play offers.
var practiceClipSeconds = map[int]bool{2: true, 5: true, 15: true, 30: true}

// practiceClip identifies one free-play clip.
type practiceClip struct {
	VocalID     int
	StartMs     int64
	ClipSeconds int
	Expires     int64 // unix seconds
}

// sealPracticeToken encrypts (AES-CTR) and signs (HMAC-SHA256) a clip
// reference: the token reveals nothing and cannot be forged or edited.
func sealPracticeToken(encKey, macKey []byte, c practiceClip) (string, error) {
	plain := make([]byte, practicePlainLen)
	plain[0] = practiceTokenVersion
	binary.BigEndian.PutUint32(plain[1:], uint32(c.VocalID))
	binary.BigEndian.PutUint32(plain[5:], uint32(c.StartMs))
	plain[9] = byte(c.ClipSeconds)
	binary.BigEndian.PutUint64(plain[10:], uint64(c.Expires))

	out := make([]byte, practiceTokenLen)
	iv := out[:practiceIVLen]
	if _, err := rand.Read(iv); err != nil {
		return "", err
	}
	block, err := aes.NewCipher(encKey)
	if err != nil {
		return "", err
	}
	cipher.NewCTR(block, iv).XORKeyStream(out[practiceIVLen:practiceIVLen+practicePlainLen], plain)
	mac := hmac.New(sha256.New, macKey)
	mac.Write(out[:practiceIVLen+practicePlainLen])
	copy(out[practiceIVLen+practicePlainLen:], mac.Sum(nil)[:practiceMACLen])
	return base64.RawURLEncoding.EncodeToString(out), nil
}

var errBadToken = errors.New("guessmusic: invalid clip token")

func openPracticeToken(encKey, macKey []byte, token string) (practiceClip, error) {
	if len(token) != base64.RawURLEncoding.EncodedLen(practiceTokenLen) {
		return practiceClip{}, errBadToken
	}
	raw, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil || len(raw) != practiceTokenLen {
		return practiceClip{}, errBadToken
	}
	body := raw[:practiceIVLen+practicePlainLen]
	mac := hmac.New(sha256.New, macKey)
	mac.Write(body)
	if !hmac.Equal(mac.Sum(nil)[:practiceMACLen], raw[practiceIVLen+practicePlainLen:]) {
		return practiceClip{}, errBadToken
	}
	block, err := aes.NewCipher(encKey)
	if err != nil {
		return practiceClip{}, err
	}
	plain := make([]byte, practicePlainLen)
	cipher.NewCTR(block, raw[:practiceIVLen]).XORKeyStream(plain, body[practiceIVLen:])
	if plain[0] != practiceTokenVersion {
		return practiceClip{}, errBadToken
	}
	c := practiceClip{
		VocalID:     int(binary.BigEndian.Uint32(plain[1:])),
		StartMs:     int64(binary.BigEndian.Uint32(plain[5:])),
		ClipSeconds: int(plain[9]),
		Expires:     int64(binary.BigEndian.Uint64(plain[10:])),
	}
	if c.VocalID <= 0 || !practiceClipSeconds[c.ClipSeconds] {
		return practiceClip{}, errBadToken
	}
	return c, nil
}

// practiceStartRange is the range of clip starts [loMs, loMs+span) in
// milliseconds for a clip of clip seconds: [fillerSec, duration - clip - 3].
func practiceStartRange(fillerSec, durationSec, clip float64) (loMs, span int64) {
	lo := fillerSec
	if !(lo >= 0) || lo > maxInstDurationSec { // also NaN
		lo = 0
	}
	if !(durationSec > 0) || durationSec > maxInstDurationSec {
		durationSec = 0
	}
	hi := durationSec - clip - clipTailSeconds
	if hi < lo {
		// Very short song: the latest start that still fits.
		hi = math.Max(durationSec-clip, 0)
		if lo > hi {
			lo = hi
		}
	}
	loMs = int64(math.Round(lo * 1000))
	span = int64(math.Floor((hi-lo)*1000)) + 1
	if span < 1 {
		span = 1
	}
	return loMs, span
}

// practiceStartMs is the server-chosen clip start in milliseconds:
// fillerSec + (HMAC(secret, "guess-music:free:<seed>:<round>:<vocal>:<clip>")
// mod the range of starts in [fillerSec, duration - clip - 3]). Share links
// reproduce it, and a client cannot pick the offset; each clip is at most
// 30 seconds.
func practiceStartMs(secret []byte, seed string, round, vocalID, clipSeconds int, fillerSec, durationSec float64) int64 {
	lo, span := practiceStartRange(fillerSec, durationSec, float64(clipSeconds))
	label := "guess-music:free:" + seed + ":" + strconv.Itoa(round) + ":" + strconv.Itoa(vocalID) + ":" + strconv.Itoa(clipSeconds)
	h := binary.BigEndian.Uint64(hmacSHA256(secret, label)[:8])
	return lo + int64(h%uint64(span))
}

// practiceJob is the cached clip of a free-play request. Clips live in the
// cache directory of the day they were requested (pruned like daily clips).
func (s *Service) practiceJob(entry instEntry, startMs int64, clipSeconds int) clipJob {
	plan := RoundPlan{
		VocalID:       entry.VocalID,
		Asset:         entry.Asset,
		ClipSeconds:   clipSeconds,
		VocalRemoval:  true,
		fixedStart:    float64(startMs) / 1000,
		hasFixedStart: true,
	}
	return clipJob{Date: s.today().Date, Tier: "free", Mode: "inst", Round: 0, Plan: plan}
}

// PracticeInstrumentals lists the vocals free play can play without vocals.
type PracticeInstrumentals struct {
	Available bool   `json:"available"`
	Server    string `json:"server"`
	VocalIDs  []int  `json:"vocalIds"`
}

func (s *Service) handlePracticeInstrumentals(w http.ResponseWriter, r *http.Request) {
	ids := practiceVocalIDs(s.catalog, s.instIndex(), s.now())
	w.Header().Set("Cache-Control", "public, max-age=300")
	writeJSON(w, http.StatusOK, PracticeInstrumentals{Available: len(ids) > 0, Server: ServerRegion, VocalIDs: ids})
}

type practiceClipRequest struct {
	VocalID     int     `json:"vocalId"`
	ClipSeconds int     `json:"clipSeconds"`
	Seed        *string `json:"seed"`
	Round       *int    `json:"round"`
}

// PracticeClipResponse points at a free-play clip.
type PracticeClipResponse struct {
	ClipURL      string  `json:"clipUrl"`
	StartSeconds float64 `json:"startSeconds"`
	ClipSeconds  int     `json:"clipSeconds"`
}

func badPracticeRequest(message string) *apiError {
	return newAPIError(http.StatusBadRequest, "bad_request", message)
}

func (s *Service) handlePracticeClip(w http.ResponseWriter, r *http.Request) {
	var req practiceClipRequest
	if err := decodeBody(w, r, maxSmallBodyBytes, &req); err != nil {
		var apiErr *apiError
		if errors.As(err, &apiErr) && apiErr.Status == http.StatusRequestEntityTooLarge {
			writeError(w, err)
			return
		}
		writeError(w, badPracticeRequest("请求体不是有效的 JSON"))
		return
	}
	seed := ""
	if req.Seed != nil {
		seed = *req.Seed
	}
	round := 0
	if req.Round != nil {
		round = *req.Round
	}
	switch {
	case req.VocalID <= 0:
		writeError(w, badPracticeRequest("vocalId 必须是正整数"))
		return
	case !practiceClipSeconds[req.ClipSeconds]:
		writeError(w, badPracticeRequest("clipSeconds 必须是 2、5、15 或 30"))
		return
	case !utf8.ValidString(seed) || utf8.RuneCountInString(seed) > practiceMaxSeedChars:
		writeError(w, badPracticeRequest("seed 最长 64 个字符"))
		return
	case round < 0 || round > practiceMaxRound:
		writeError(w, badPracticeRequest("round 必须在 0 到 99 之间"))
		return
	}
	idx := s.instIndex()
	if idx == nil {
		writeError(w, newAPIError(http.StatusConflict, "inst_unavailable", "伴奏版暂不可用"))
		return
	}
	if !s.catalog.Ready() {
		writeError(w, newAPIError(http.StatusServiceUnavailable, "not_ready", "曲库数据尚未加载完成，请稍后再试"))
		return
	}
	entry, ok := s.practiceEntry(idx, req.VocalID)
	if !ok {
		writeError(w, newAPIError(http.StatusNotFound, "unknown_vocal", "这个版本没有伴奏版"))
		return
	}
	if !s.clipLimiter.Allow(s.ips.clientIP(r)) {
		writeError(w, newAPIError(http.StatusTooManyRequests, "rate_limited", "请求过于频繁，请稍后再试"))
		return
	}
	music, _ := s.catalog.Music(entry.MusicID)
	startMs := practiceStartMs(s.secret, seed, round, req.VocalID, req.ClipSeconds, music.FillerSec, entry.DurationSec)

	ctx, cancel := context.WithTimeout(r.Context(), clipRequestTimeout)
	defer cancel()
	job := s.practiceJob(entry, startMs, req.ClipSeconds)
	clip, err := s.clips.Get(ctx, job)
	if err != nil {
		s.logf("guess-music: free clip of vocal %d: %v", req.VocalID, err)
		writeError(w, newAPIError(http.StatusServiceUnavailable, "clip_unavailable", "音频暂时无法加载，请稍后重试"))
		return
	}
	token, err := sealPracticeToken(s.tokenEnc, s.tokenMAC, practiceClip{
		VocalID:     req.VocalID,
		StartMs:     startMs,
		ClipSeconds: req.ClipSeconds,
		Expires:     s.now().Add(practiceTokenTTL).Unix(),
	})
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, PracticeClipResponse{
		ClipURL:      practiceClipsPath + token,
		StartSeconds: clip.StartSeconds,
		ClipSeconds:  req.ClipSeconds,
	})
}

// practiceEntry returns the manifest entry of a released, sung vocal.
func (s *Service) practiceEntry(idx *instIndex, vocalID int) (instEntry, bool) {
	entry, ok := idx.lookup(vocalID)
	if !ok {
		return instEntry{}, false
	}
	vocal, ok := s.catalog.Vocal(entry.MusicID, vocalID)
	if !ok || vocal.MusicVocalType == "instrumental" || !allowedVocalType(vocal.MusicVocalType) {
		return instEntry{}, false
	}
	music, ok := s.catalog.Music(entry.MusicID)
	if !ok || music.PublishedAt <= 0 || music.PublishedAt > s.now().UnixMilli() {
		return instEntry{}, false
	}
	return entry, true
}

func (s *Service) handlePracticeClipBytes(w http.ResponseWriter, r *http.Request, token string) {
	c, err := openPracticeToken(s.tokenEnc, s.tokenMAC, token)
	if err != nil {
		writeError(w, newAPIError(http.StatusNotFound, "clip_not_found", "音频不存在"))
		return
	}
	if s.now().Unix() > c.Expires {
		writeError(w, newAPIError(http.StatusGone, "clip_expired", "音频链接已过期，请重新获取"))
		return
	}
	idx := s.instIndex()
	if idx == nil {
		writeError(w, newAPIError(http.StatusConflict, "inst_unavailable", "伴奏版暂不可用"))
		return
	}
	entry, ok := idx.lookup(c.VocalID)
	if !ok {
		writeError(w, newAPIError(http.StatusNotFound, "clip_not_found", "音频不存在"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), clipRequestTimeout)
	defer cancel()
	clip, err := s.clips.Get(ctx, s.practiceJob(entry, c.StartMs, c.ClipSeconds))
	if err != nil {
		s.logf("guess-music: free clip of vocal %d: %v", c.VocalID, err)
		writeError(w, newAPIError(http.StatusServiceUnavailable, "clip_unavailable", "音频暂时无法加载，请稍后重试"))
		return
	}
	h := w.Header()
	h.Set("Content-Type", clip.ContentType)
	h.Set("Cache-Control", "private, max-age=1800")
	h.Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, "", time.Time{}, bytes.NewReader(clip.Data))
}
