package guessmusic

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"math"
)

// MPEG audio versions as encoded in the frame header.
const (
	mpegVersion25 = 0 // MPEG-2.5
	mpegVersion2  = 2 // MPEG-2
	mpegVersion1  = 3 // MPEG-1
)

const (
	channelModeMono = 3
	// maxResyncScan bounds how far the parser searches for the next frame
	// after junk inside the stream.
	maxResyncScan = 64 << 10
	// reservoirBytes is the largest main_data_begin back-reference (MPEG-1).
	reservoirBytes = 511
	// maxLeadFrames caps the frames prepended for the bit reservoir.
	maxLeadFrames  = 8
	xingFlagFrames = 0x1
	xingFlagBytes  = 0x2
	xingFlagTOC    = 0x4
	xingPayloadLen = 4 + 4 + 4 + 4 + 100 // tag, flags, frames, bytes, TOC
)

var (
	errNoFrames = errors.New("mp3: no MPEG Layer III frames found")

	// Layer III bitrates in kbps, indexed by bitrate index.
	bitratesV1L3 = [16]int{0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, -1}
	bitratesV2L3 = [16]int{0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, -1}

	sampleRates = map[int][3]int{
		mpegVersion1:  {44100, 48000, 32000},
		mpegVersion2:  {22050, 24000, 16000},
		mpegVersion25: {11025, 12000, 8000},
	}
)

// frameHeader is a decoded MPEG audio Layer III frame header.
type frameHeader struct {
	raw          [4]byte
	version      int
	bitrateIndex int
	bitrate      int // bits per second
	sampleRate   int
	padding      bool
	crc          bool // a 16-bit CRC follows the header
	channelMode  int
	length       int // whole frame length in bytes, header included
	samples      int // PCM samples per channel in this frame
}

func parseFrameHeader(b []byte) (frameHeader, bool) {
	var h frameHeader
	if len(b) < 4 {
		return h, false
	}
	if b[0] != 0xFF || b[1]&0xE0 != 0xE0 {
		return h, false
	}
	version := int(b[1]>>3) & 0x3
	layer := int(b[1]>>1) & 0x3
	if version == 1 || layer != 1 { // reserved version, or not Layer III
		return h, false
	}
	bitrateIndex := int(b[2]>>4) & 0xF
	sampleRateIndex := int(b[2]>>2) & 0x3
	if bitrateIndex == 0 || bitrateIndex == 15 || sampleRateIndex == 3 {
		return h, false // free format or invalid
	}
	if b[3]&0x3 == 2 { // reserved emphasis
		return h, false
	}
	copy(h.raw[:], b[:4])
	h.version = version
	h.bitrateIndex = bitrateIndex
	h.sampleRate = sampleRates[version][sampleRateIndex]
	h.padding = b[2]&0x2 != 0
	h.crc = b[1]&0x1 == 0
	h.channelMode = int(b[3]>>6) & 0x3
	if version == mpegVersion1 {
		h.bitrate = bitratesV1L3[bitrateIndex] * 1000
		h.samples = 1152
		h.length = 144 * h.bitrate / h.sampleRate
	} else {
		h.bitrate = bitratesV2L3[bitrateIndex] * 1000
		h.samples = 576
		h.length = 72 * h.bitrate / h.sampleRate
	}
	if h.padding {
		h.length++
	}
	if h.length < 4+h.sideInfoLen() {
		return h, false
	}
	return h, true
}

func (h frameHeader) sideInfoLen() int {
	mono := h.channelMode == channelModeMono
	if h.version == mpegVersion1 {
		if mono {
			return 17
		}
		return 32
	}
	if mono {
		return 9
	}
	return 17
}

// mainDataLen is the number of bytes in the frame usable as bit reservoir.
func (h frameHeader) mainDataLen() int {
	n := h.length - 4 - h.sideInfoLen()
	if h.crc {
		n -= 2
	}
	return n
}

func (h frameHeader) compatible(o frameHeader) bool {
	return h.version == o.version && h.sampleRate == o.sampleRate
}

type mp3Frame struct {
	offset int
	header frameHeader
}

// mp3Stream is a parsed MPEG Layer III elementary stream, or a contiguous
// part of one (a byte range fetched from the CDN).
type mp3Stream struct {
	data            []byte
	frames          []mp3Frame
	sampleRate      int
	samplesPerFrame int
	// base is the index of frames[0] in the whole stream.
	base int
	// total is the number of audio frames of the whole stream; 0 means
	// len(frames) (the stream is complete).
	total int
}

func (s *mp3Stream) totalFrames() int {
	if s.total > 0 {
		return s.total
	}
	return len(s.frames)
}

// id3v2Size returns the size of an ID3v2 tag at the start of data, or 0.
func id3v2Size(data []byte) int {
	if len(data) < 10 || data[0] != 'I' || data[1] != 'D' || data[2] != '3' {
		return 0
	}
	if data[3] == 0xFF || data[4] == 0xFF {
		return 0
	}
	for _, b := range data[6:10] {
		if b&0x80 != 0 {
			return 0
		}
	}
	size := int(data[6])<<21 | int(data[7])<<14 | int(data[8])<<7 | int(data[9])
	total := 10 + size
	if data[5]&0x10 != 0 { // footer present
		total += 10
	}
	if total > len(data) {
		return len(data)
	}
	return total
}

// findSync finds the next offset >= pos holding a frame header that is
// confirmed by a compatible header right after it (or the end of data).
// If ref is non-nil the candidate must also be compatible with it.
func findSync(data []byte, pos int, limit int, ref *frameHeader) (int, frameHeader, bool) {
	end := len(data) - 4
	if limit > 0 && pos+limit < end {
		end = pos + limit
	}
	for i := pos; i <= end; i++ {
		if data[i] != 0xFF {
			continue
		}
		h, ok := parseFrameHeader(data[i:])
		if !ok {
			continue
		}
		if ref != nil && !h.compatible(*ref) {
			continue
		}
		next := i + h.length
		if next == len(data) {
			return i, h, true
		}
		if next > len(data) {
			continue
		}
		if nh, ok := parseFrameHeader(data[next:]); ok && nh.compatible(h) {
			return i, h, true
		}
	}
	return 0, frameHeader{}, false
}

// isInfoFrame reports whether the frame carries a Xing/Info or VBRI header
// (a metadata frame without audio).
func isInfoFrame(data []byte, offset int, h frameHeader) bool {
	frame := data[offset : offset+h.length]
	xing := 4 + h.sideInfoLen()
	if h.crc {
		xing += 2
	}
	if xing+4 <= len(frame) {
		tag := frame[xing : xing+4]
		if bytes.Equal(tag, []byte("Xing")) || bytes.Equal(tag, []byte("Info")) {
			return true
		}
	}
	if 36+4 <= len(frame) && bytes.Equal(frame[36:40], []byte("VBRI")) {
		return true
	}
	return false
}

func isTrailerTag(rest []byte) bool {
	return bytes.HasPrefix(rest, []byte("TAG")) ||
		bytes.HasPrefix(rest, []byte("APETAGEX")) ||
		bytes.HasPrefix(rest, []byte("LYRICSBEGIN")) ||
		bytes.HasPrefix(rest, []byte("ID3"))
}

// parseMP3 parses data into Layer III frames, skipping a leading ID3v2 tag,
// a Xing/Info/VBRI header frame, trailing tags and junk between frames.
func parseMP3(data []byte) (*mp3Stream, error) {
	pos := id3v2Size(data)
	start, first, ok := findSync(data, pos, 0, nil)
	if !ok {
		return nil, errNoFrames
	}
	s := &mp3Stream{
		data:            data,
		sampleRate:      first.sampleRate,
		samplesPerFrame: first.samples,
	}
	pos = start
	if isInfoFrame(data, pos, first) {
		pos += first.length
	}
	for pos+4 <= len(data) {
		h, ok := parseFrameHeader(data[pos:])
		if ok && h.compatible(first) && pos+h.length <= len(data) {
			s.frames = append(s.frames, mp3Frame{offset: pos, header: h})
			pos += h.length
			continue
		}
		if ok && pos+h.length > len(data) {
			break // truncated final frame
		}
		if isTrailerTag(data[pos:]) {
			break
		}
		next, _, found := findSync(data, pos+1, maxResyncScan, &first)
		if !found {
			break
		}
		pos = next
	}
	if len(s.frames) == 0 {
		return nil, errNoFrames
	}
	return s, nil
}

func (s *mp3Stream) frameDuration() float64 {
	return float64(s.samplesPerFrame) / float64(s.sampleRate)
}

// Duration returns the playable duration of the whole stream in seconds.
func (s *mp3Stream) Duration() float64 {
	return float64(s.totalFrames()) * s.frameDuration()
}

// mp3Clip is a standalone MP3 cut from a longer stream.
type mp3Clip struct {
	Data         []byte
	StartSeconds float64 // where the clip's first non-reservoir frame starts in the source
	Seconds      float64 // duration of the frames covering the requested window
	Frames       int     // audio frames in Data, reservoir frames included
}

var errWindowOutside = errors.New("mp3: clip window is outside the loaded frames")

// span returns the absolute frame range [first, end) covering the window.
func (s *mp3Stream) span(start, length float64) (int, int, error) {
	if length <= 0 || math.IsNaN(length) || math.IsInf(length, 0) || math.IsNaN(start) || math.IsInf(start, 0) {
		return 0, 0, fmt.Errorf("mp3: invalid clip window %.3f+%.3f", start, length)
	}
	if start < 0 {
		start = 0
	}
	total := s.totalFrames()
	fd := s.frameDuration()
	first := int(math.Floor(start/fd + 1e-9))
	end := int(math.Ceil((start+length)/fd - 1e-9))
	if first >= total {
		first = total - 1
	}
	if end > total {
		end = total
	}
	if end <= first {
		end = first + 1
	}
	if first < s.base || end > s.base+len(s.frames) {
		return 0, 0, errWindowOutside
	}
	return first, end, nil
}

// Slice cuts whole frames covering [start, start+length] plus leading
// frames for the bit reservoir, and prefixes a Xing/Info header frame so the
// clip's duration is exact in browsers.
func (s *mp3Stream) Slice(start, length float64) (*mp3Clip, error) {
	first, end, err := s.span(start, length)
	if err != nil {
		return nil, err
	}
	fd := s.frameDuration()
	lead := first - s.base // local index of the first window frame
	localFirst := lead
	leadBytes := 0
	for lead > 0 && localFirst-lead < maxLeadFrames && (localFirst-lead == 0 || leadBytes < reservoirBytes) {
		lead--
		leadBytes += s.frames[lead].header.mainDataLen()
	}

	frames := s.frames[lead : end-s.base]
	audioBytes := 0
	cbr := true
	for _, f := range frames {
		audioBytes += f.header.length
		if f.header.bitrateIndex != frames[0].header.bitrateIndex {
			cbr = false
		}
	}

	info := buildInfoFrame(frames, audioBytes, cbr)
	out := make([]byte, 0, len(info)+audioBytes)
	out = append(out, info...)
	for _, f := range frames {
		out = append(out, s.data[f.offset:f.offset+f.header.length]...)
	}
	return &mp3Clip{
		Data:         out,
		StartSeconds: float64(first) * fd,
		Seconds:      float64(end-first) * fd,
		Frames:       len(frames),
	}, nil
}

// buildInfoFrame builds a silent Layer III frame carrying a Xing ("Info" for
// CBR) header with frame count, byte count and a seek TOC.
func buildInfoFrame(frames []mp3Frame, audioBytes int, cbr bool) []byte {
	ref := frames[0].header
	need := 4 + ref.sideInfoLen() + xingPayloadLen
	raw := ref.raw
	raw[1] |= 0x01  // no CRC
	raw[2] &^= 0x02 // no padding

	chooseIndex := -1
	if cbr {
		if h, ok := headerWithBitrate(raw, ref.bitrateIndex); ok && h.length >= need {
			chooseIndex = ref.bitrateIndex
		}
	}
	if chooseIndex < 0 {
		for idx := 1; idx <= 14; idx++ {
			if h, ok := headerWithBitrate(raw, idx); ok && h.length >= need {
				chooseIndex = idx
				break
			}
		}
	}
	if chooseIndex < 0 {
		chooseIndex = 14
	}
	h, _ := headerWithBitrate(raw, chooseIndex)

	frame := make([]byte, h.length)
	copy(frame, h.raw[:])
	off := 4 + h.sideInfoLen()
	tag := "Xing"
	if cbr {
		tag = "Info"
	}
	copy(frame[off:], tag)
	binary.BigEndian.PutUint32(frame[off+4:], xingFlagFrames|xingFlagBytes|xingFlagTOC)
	binary.BigEndian.PutUint32(frame[off+8:], uint32(len(frames)))
	totalBytes := h.length + audioBytes
	binary.BigEndian.PutUint32(frame[off+12:], uint32(totalBytes))

	toc := frame[off+16 : off+16+100]
	offsets := make([]int, len(frames))
	running := h.length
	for i, f := range frames {
		offsets[i] = running
		running += f.header.length
	}
	for i := 0; i < 100; i++ {
		idx := int(math.Floor(float64(i) / 100 * float64(len(frames))))
		if idx >= len(frames) {
			idx = len(frames) - 1
		}
		v := int(math.Floor(float64(offsets[idx]) / float64(totalBytes) * 256))
		if v > 255 {
			v = 255
		}
		if i > 0 && v < int(toc[i-1]) {
			v = int(toc[i-1])
		}
		toc[i] = byte(v)
	}
	return frame
}

func headerWithBitrate(raw [4]byte, index int) (frameHeader, bool) {
	raw[2] = raw[2]&0x0F | byte(index)<<4
	return parseFrameHeader(raw[:])
}

// errNeedFullFile means the stream cannot be cut from byte ranges (VBR or
// an unexpected layout) and must be downloaded whole.
var errNeedFullFile = errors.New("mp3: stream needs a full download")

// id3v2DeclaredSize returns the size of the ID3v2 tag announced at the start
// of data, even when the tag extends beyond data, or 0 without a tag.
func id3v2DeclaredSize(data []byte) int {
	if len(data) < 10 || data[0] != 'I' || data[1] != 'D' || data[2] != '3' {
		return 0
	}
	if data[3] == 0xFF || data[4] == 0xFF {
		return 0
	}
	for _, b := range data[6:10] {
		if b&0x80 != 0 {
			return 0
		}
	}
	size := int(data[6])<<21 | int(data[7])<<14 | int(data[8])<<7 | int(data[9])
	total := 10 + size
	if data[5]&0x10 != 0 {
		total += 10
	}
	return total
}

// cbrInfo describes a constant bitrate stream well enough to compute where
// any frame lies without reading the frames before it.
type cbrInfo struct {
	audioStart int64   // file offset of the first audio frame
	frames     int     // audio frames in the stream
	frameLen   float64 // average frame length in bytes (padding included)
	ref        frameHeader
}

func (c cbrInfo) frameDuration() float64 {
	return float64(c.ref.samples) / float64(c.ref.sampleRate)
}

// frameOffset is the predicted file offset of frame i.
func (c cbrInfo) frameOffset(i int) float64 {
	return float64(c.audioStart) + float64(i)*c.frameLen
}

func nominalFrameLen(h frameHeader) float64 {
	if h.version == mpegVersion1 {
		return 144 * float64(h.bitrate) / float64(h.sampleRate)
	}
	return 72 * float64(h.bitrate) / float64(h.sampleRate)
}

// xingTag parses a Xing/Info header frame: tag name and the optional frame
// and byte counts (-1 when absent).
func xingTag(frame []byte, h frameHeader) (tag string, frames, size int) {
	off := 4 + h.sideInfoLen()
	if h.crc {
		off += 2
	}
	frames, size = -1, -1
	if off+8 > len(frame) {
		if 40 <= len(frame) && bytes.Equal(frame[36:40], []byte("VBRI")) {
			return "VBRI", -1, -1
		}
		return "", -1, -1
	}
	tag = string(frame[off : off+4])
	if tag != "Xing" && tag != "Info" {
		if 40 <= len(frame) && bytes.Equal(frame[36:40], []byte("VBRI")) {
			return "VBRI", -1, -1
		}
		return "", -1, -1
	}
	flags := binary.BigEndian.Uint32(frame[off+4:])
	p := off + 8
	if flags&xingFlagFrames != 0 && p+4 <= len(frame) {
		frames = int(binary.BigEndian.Uint32(frame[p:]))
		p += 4
	}
	if flags&xingFlagBytes != 0 && p+4 <= len(frame) {
		size = int(binary.BigEndian.Uint32(frame[p:]))
	}
	return tag, frames, size
}

// probeCBR inspects the start of the audio (data begins at file offset
// dataOffset, right after any ID3v2 tag) of a file of total bytes.
func probeCBR(data []byte, dataOffset, total int64) (cbrInfo, error) {
	pos, first, ok := findSync(data, 0, maxResyncScan, nil)
	if !ok {
		return cbrInfo{}, errNoFrames
	}
	info := cbrInfo{audioStart: dataOffset + int64(pos), ref: first}
	tagFrames, tagBytes := -1, -1
	if pos+first.length <= len(data) {
		tag, frames, size := xingTag(data[pos:pos+first.length], first)
		switch tag {
		case "Xing", "VBRI":
			return cbrInfo{}, errNeedFullFile
		case "Info":
			info.audioStart += int64(first.length)
			tagFrames, tagBytes = frames, size
			if next := pos + first.length; next+4 <= len(data) {
				if h, ok := parseFrameHeader(data[next:]); ok && h.compatible(first) {
					info.ref = h
				}
			}
		}
	}
	info.frameLen = nominalFrameLen(info.ref)
	switch {
	case tagFrames > 0 && tagBytes > first.length:
		info.frames = tagFrames
		info.frameLen = float64(tagBytes-first.length) / float64(tagFrames)
	case tagFrames > 0:
		info.frames = tagFrames
	default:
		info.frames = int(float64(total-info.audioStart) / info.frameLen)
	}
	if info.frames <= 0 || info.frameLen < 24 {
		return cbrInfo{}, errNoFrames
	}
	// Every complete frame in the probe must share the bitrate and start
	// where the average frame length predicts (encoder-style padding).
	checked := 0
	for p, i := int(info.audioStart-dataOffset), 0; p+4 <= len(data); i++ {
		h, ok := parseFrameHeader(data[p:])
		if !ok || !h.compatible(info.ref) || p+h.length > len(data) {
			break
		}
		if h.bitrateIndex != info.ref.bitrateIndex {
			return cbrInfo{}, errNeedFullFile
		}
		if math.Abs(float64(dataOffset+int64(p))-info.frameOffset(i)) > 1.5 {
			return cbrInfo{}, errNeedFullFile
		}
		checked++
		p += h.length
	}
	if checked < 2 {
		return cbrInfo{}, errNeedFullFile
	}
	// The counts must agree with the file size (a stale or bogus tag).
	if predicted := info.frameOffset(info.frames); predicted > float64(total)+info.frameLen || predicted < float64(total)-64*1024 {
		return cbrInfo{}, errNeedFullFile
	}
	return info, nil
}

// parseCBRChunk parses the frames of a byte range of a CBR stream that
// starts at file offset offset. Frame indices are derived from offsets, so
// a sync is accepted only where a frame boundary is predicted.
func parseCBRChunk(data []byte, offset int64, info cbrInfo) (*mp3Stream, error) {
	ref := info.ref
	s := &mp3Stream{data: data, sampleRate: ref.sampleRate, samplesPerFrame: ref.samples, total: info.frames}
	pos := 0
	for {
		p, _, ok := findSync(data, pos, len(data), &ref)
		if !ok {
			return nil, errNoFrames
		}
		idx := math.Round((float64(offset+int64(p)) - float64(info.audioStart)) / info.frameLen)
		if idx >= 0 && math.Abs(float64(offset+int64(p))-info.frameOffset(int(idx))) <= 4 {
			s.base = int(idx)
			pos = p
			break
		}
		pos = p + 1
	}
	for pos+4 <= len(data) && s.base+len(s.frames) < info.frames {
		h, ok := parseFrameHeader(data[pos:])
		if !ok || !h.compatible(ref) || pos+h.length > len(data) {
			break
		}
		if h.bitrateIndex != ref.bitrateIndex {
			return nil, errNeedFullFile
		}
		s.frames = append(s.frames, mp3Frame{offset: pos, header: h})
		pos += h.length
	}
	if len(s.frames) == 0 {
		return nil, errNoFrames
	}
	last := s.frames[len(s.frames)-1]
	if math.Abs(float64(offset+int64(last.offset))-info.frameOffset(s.base+len(s.frames)-1)) > 4 {
		return nil, errNeedFullFile // the layout drifts from the prediction
	}
	return s, nil
}
