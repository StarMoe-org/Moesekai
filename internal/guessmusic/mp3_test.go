package guessmusic

import (
	"bytes"
	"encoding/binary"
	"math"
	"testing"
)

// MPEG-1 Layer III, no CRC, 128 kbps, 44.1 kHz, stereo: 417-byte frames.
var synthHeader = [4]byte{0xFF, 0xFB, 0x90, 0x00}

const synthFrameLen = 417

// synthFrame builds a frame whose main data is filled with tag (never 0xFF).
func synthFrame(tag byte) []byte {
	f := make([]byte, synthFrameLen)
	copy(f, synthHeader[:])
	for i := 4 + 32; i < len(f); i++ {
		f[i] = tag
	}
	return f
}

func frameTag(i int) byte { return byte(i%200 + 1) }

// synthMP3 builds an mp3 with frames audio frames; withTags adds an ID3v2
// tag, a Xing header frame, junk between frames and an ID3v1 trailer.
func synthMP3(frames int, withTags bool) []byte {
	var buf bytes.Buffer
	if withTags {
		body := []byte("TIT2\x00\x00\x00\x0d\x00\x00\x03secret title")
		size := len(body)
		buf.Write([]byte{'I', 'D', '3', 4, 0, 0,
			byte(size >> 21 & 0x7F), byte(size >> 14 & 0x7F), byte(size >> 7 & 0x7F), byte(size & 0x7F)})
		buf.Write(body)
		xing := synthFrame(0)
		copy(xing[4+32:], "Xing")
		buf.Write(xing)
	}
	for i := 0; i < frames; i++ {
		if withTags && i == frames/2 {
			buf.Write([]byte{0x00, 0x12, 0x34}) // junk the parser must resync over
		}
		buf.Write(synthFrame(frameTag(i)))
	}
	if withTags {
		trailer := make([]byte, 128)
		copy(trailer, "TAGsecret title")
		buf.Write(trailer)
	}
	return buf.Bytes()
}

func TestParseMP3SkipsTagsAndJunk(t *testing.T) {
	stream, err := parseMP3(synthMP3(500, true))
	if err != nil {
		t.Fatal(err)
	}
	if len(stream.frames) != 500 {
		t.Fatalf("frames = %d, want 500", len(stream.frames))
	}
	want := 500 * 1152.0 / 44100
	if math.Abs(stream.Duration()-want) > 1e-9 {
		t.Fatalf("duration = %v, want %v", stream.Duration(), want)
	}
	for i, f := range stream.frames {
		if stream.data[f.offset+40] != frameTag(i) {
			t.Fatalf("frame %d has wrong payload", i)
		}
	}
}

func TestParseMP3RejectsGarbage(t *testing.T) {
	if _, err := parseMP3(bytes.Repeat([]byte{0x12, 0xFF, 0x00}, 5000)); err == nil {
		t.Fatal("expected an error for non-mp3 data")
	}
}

func TestSliceIsFrameAlignedWithInfoHeader(t *testing.T) {
	stream, err := parseMP3(synthMP3(1000, true))
	if err != nil {
		t.Fatal(err)
	}
	fd := 1152.0 / 44100
	clip, err := stream.Slice(10, 5)
	if err != nil {
		t.Fatal(err)
	}
	first := int(math.Floor(10 / fd))
	if math.Abs(clip.StartSeconds-float64(first)*fd) > 1e-9 || clip.StartSeconds > 10 {
		t.Fatalf("start = %v", clip.StartSeconds)
	}
	if clip.Seconds < 5 || clip.Seconds > 5+2*fd {
		t.Fatalf("seconds = %v", clip.Seconds)
	}

	// First frame is our CBR "Info" header with the frame and byte counts.
	h, ok := parseFrameHeader(clip.Data)
	if !ok {
		t.Fatal("clip does not start with a frame header")
	}
	off := 4 + h.sideInfoLen()
	if string(clip.Data[off:off+4]) != "Info" {
		t.Fatalf("missing Info tag, got %q", clip.Data[off:off+4])
	}
	if n := binary.BigEndian.Uint32(clip.Data[off+8:]); int(n) != clip.Frames {
		t.Fatalf("info frames = %d, want %d", n, clip.Frames)
	}
	if n := binary.BigEndian.Uint32(clip.Data[off+12:]); int(n) != len(clip.Data) {
		t.Fatalf("info bytes = %d, want %d", n, len(clip.Data))
	}

	// The rest is whole source frames: reservoir lead-in, then the window.
	reparsed, err := parseMP3(clip.Data)
	if err != nil {
		t.Fatal(err)
	}
	if len(reparsed.frames) != clip.Frames {
		t.Fatalf("reparsed %d frames, want %d", len(reparsed.frames), clip.Frames)
	}
	lead := clip.Frames - int(math.Round(clip.Seconds/fd))
	if lead < 1 || lead > maxLeadFrames {
		t.Fatalf("lead frames = %d", lead)
	}
	for i, f := range reparsed.frames {
		if got, want := reparsed.data[f.offset+40], frameTag(first-lead+i); got != want {
			t.Fatalf("clip frame %d payload %d, want %d", i, got, want)
		}
	}
	if bytes.Contains(clip.Data, []byte("secret title")) || bytes.Contains(clip.Data, []byte("ID3")) {
		t.Fatal("clip leaks source tags")
	}
}

func TestSliceClampsToStream(t *testing.T) {
	stream, err := parseMP3(synthMP3(100, false))
	if err != nil {
		t.Fatal(err)
	}
	clip, err := stream.Slice(1000, 5)
	if err != nil {
		t.Fatal(err)
	}
	if clip.Frames < 1 {
		t.Fatal("expected at least one frame")
	}
	if _, err := stream.Slice(0, 0); err == nil {
		t.Fatal("expected error for empty window")
	}
}

func TestCutClipUsesWindow(t *testing.T) {
	src := synthMP3(4000, true) // ~104.5 s
	plan := RoundPlan{ClipSeconds: 10, FillerSec: 9, StartFraction: 0.5}
	clip, err := cutClip(src, plan)
	if err != nil {
		t.Fatal(err)
	}
	duration := 4000 * 1152.0 / 44100
	want := clipWindow(duration, 9, 10, 0.5)
	if math.Abs(clip.StartSeconds-want) > 0.03 {
		t.Fatalf("start = %v, want ~%v", clip.StartSeconds, want)
	}
	if clip.StartSeconds < 9-0.03 || clip.StartSeconds+10 > duration-3+0.03 {
		t.Fatalf("clip %v+10 outside [filler, duration-clip-3]", clip.StartSeconds)
	}
	encoded := encodeClip(clip)
	decoded, err := decodeClip(encoded)
	if err != nil || !bytes.Equal(decoded.Data, clip.Data) || decoded.StartSeconds != clip.StartSeconds {
		t.Fatalf("clip record round trip failed: %v", err)
	}
}
