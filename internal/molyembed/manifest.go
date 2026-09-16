package molyembed

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

type EngineSize struct {
	DownloadBytes int64 `json:"downloadBytes"`
	DecodedBytes  int64 `json:"decodedBytes"`
	BrotliBytes   int64 `json:"brotliBytes,omitempty"`
	GzipBytes     int64 `json:"gzipBytes,omitempty"`
}
type Release struct {
	ID              string                `json:"id"`
	Module          string                `json:"module"`
	Stage           string                `json:"stage"`
	ContractVersion int                   `json:"contractVersion"`
	Engines         map[string]EngineSize `json:"engines"`
}
type Snapshot struct {
	ID                string            `json:"id"`
	Region            string            `json:"region"`
	Version           string            `json:"version"`
	Assets            string            `json:"assets"`
	Catalog           string            `json:"catalog"`
	Available         bool              `json:"available"`
	UnavailableReason string            `json:"unavailableReason,omitempty"`
	Provenance        map[string]string `json:"provenance,omitempty"`
	Base              EngineSize        `json:"base"`
}
type Manifest struct {
	SchemaVersion int        `json:"schemaVersion"`
	Release       Release    `json:"release"`
	Snapshots     []Snapshot `json:"snapshots"`
}

func (h *Handler) serveManifest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if h.rootErr != nil {
		problem(w, r, http.StatusServiceUnavailable, "runtime_unavailable")
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	info, err := os.Stat(filepath.Join(h.root, "manifest.json"))
	if err != nil {
		problem(w, r, http.StatusServiceUnavailable, "runtime_unavailable")
		return
	}
	stamp := fmt.Sprintf("%d:%d", info.ModTime().UnixNano(), info.Size())
	if stamp != h.stamp {
		h.stamp = stamp
		h.manifest, h.manifestErr = h.loadManifest()
	}
	if h.manifestErr != nil {
		problem(w, r, http.StatusServiceUnavailable, "manifest_invalid")
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if r.Method == http.MethodGet {
		_, _ = w.Write(h.manifest)
	}
}
func (h *Handler) loadManifest() ([]byte, error) {
	var m Manifest
	if err := h.readJSON("manifest.json", 1<<20, &m); err != nil {
		return nil, err
	}
	releaseRoot := Prefix + "releases/" + m.Release.ID + "/"
	if m.SchemaVersion != ContractVersion || m.Release.ContractVersion != ContractVersion || !identifier.MatchString(m.Release.ID) || m.Release.Module != releaseRoot+"embed.mjs" || m.Release.Stage != releaseRoot+"stage.html" {
		return nil, errors.New("invalid release contract")
	}
	for _, path := range []string{m.Release.Module, m.Release.Stage, releaseRoot + "pkg/webgpu/moly-app_bg.wasm", releaseRoot + "pkg/webgl2/moly-app_bg.wasm"} {
		f, err := h.open(strings.TrimPrefix(path, Prefix))
		if err != nil {
			return nil, err
		}
		f.Close()
	}
	if len(m.Release.Engines) != 2 || len(m.Snapshots) < 1 || len(m.Snapshots) > 2 {
		return nil, errors.New("incomplete deployment")
	}
	for _, backend := range []string{"webgpu", "webgl2"} {
		size, ok := m.Release.Engines[backend]
		if !ok || size.DownloadBytes <= 0 || size.DecodedBytes <= 0 || size.DownloadBytes > 1<<30 || size.DecodedBytes > 1<<30 || size.BrotliBytes < 0 || size.GzipBytes < 0 {
			return nil, errors.New("invalid engine size")
		}
		root := "releases/" + m.Release.ID + "/pkg/" + backend + "/"
		wasm, err := h.open(root + "moly-app_bg.wasm")
		if err != nil {
			return nil, err
		}
		wasmInfo, err := wasm.Stat()
		wasm.Close()
		if err != nil || wasmInfo.Size() != size.DecodedBytes {
			return nil, errors.New("engine decoded size mismatch")
		}
		if size.BrotliBytes > 0 {
			br, err := h.open(root + "moly-app_bg.wasm.br")
			if err != nil {
				return nil, err
			}
			brInfo, statErr := br.Stat()
			br.Close()
			if statErr != nil || brInfo.Size() != size.BrotliBytes || size.DownloadBytes != size.BrotliBytes {
				return nil, errors.New("engine Brotli size mismatch")
			}
		}
		if size.GzipBytes > 0 {
			gz, err := h.open(root + "moly-app_bg.wasm.gz")
			if err != nil {
				return nil, err
			}
			gzInfo, statErr := gz.Stat()
			gz.Close()
			if statErr != nil || gzInfo.Size() != size.GzipBytes {
				return nil, errors.New("engine gzip size mismatch")
			}
		}
		f, err := h.open(root + "moly-app.js")
		if err != nil {
			return nil, err
		}
		f.Close()
	}
	seen := map[string]bool{}
	for i := range m.Snapshots {
		s := &m.Snapshots[i]
		root := Prefix + "snapshots/" + s.ID + "/"
		if !identifier.MatchString(s.ID) || (s.Region != "cn" && s.Region != "jp") || seen[s.Region] || s.Assets != root+"assets/" || s.Catalog != root+"catalog/index.json" {
			return nil, errors.New("invalid source-qualified snapshot")
		}
		seen[s.Region] = true
		if !gameVersion.MatchString(s.Version) || s.Base.DownloadBytes < 0 || s.Base.DecodedBytes < 0 {
			return nil, errors.New("invalid snapshot version or size")
		}
		if s.Provenance["assetPolicy"] == "development-mount" && !h.development {
			return nil, errors.New("mutable development assets cannot be served as immutable production assets")
		}
		var assets struct {
			Region  string `json:"region"`
			Version string `json:"gameVersion"`
		}
		var catalog struct {
			SchemaVersion int    `json:"schemaVersion"`
			Region        string `json:"region"`
			Version       string `json:"version"`
			SnapshotID    string `json:"snapshotId"`
		}
		s.Available = true
		s.UnavailableReason = ""
		if err := h.readJSON(strings.TrimPrefix(s.Assets, Prefix)+"mysekai-fixtures.json", 32<<20, &assets); err != nil {
			s.Available = false
			s.UnavailableReason = "assets_missing"
		} else if assets.Region != s.Region || assets.Version != s.Version {
			s.Available = false
			s.UnavailableReason = "source_mismatch"
		} else if err := h.readJSON(strings.TrimPrefix(s.Catalog, Prefix), 64<<20, &catalog); err != nil {
			s.Available = false
			s.UnavailableReason = "catalog_missing"
		} else if catalog.SchemaVersion != 1 || catalog.Region != s.Region || catalog.Version != s.Version || catalog.SnapshotID != s.ID {
			s.Available = false
			s.UnavailableReason = "source_mismatch"
		}
	}
	return json.Marshal(m)
}
