package molyembed

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
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
	ID                  string         `json:"id"`
	Region              string         `json:"region"`
	Version             string         `json:"version"`
	Assets              string         `json:"assets"`
	Catalog             string         `json:"catalog"`
	Available           bool           `json:"available"`
	UnavailableReason   string         `json:"unavailableReason,omitempty"`
	Provenance          map[string]any `json:"provenance,omitempty"`
	Packs               bool           `json:"packs,omitempty"`
	AssetCatalog        string         `json:"assetCatalog,omitempty"`
	AssetReleaseVersion string         `json:"assetReleaseVersion,omitempty"`
	Base                EngineSize     `json:"base"`
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
	data := h.manifest
	if requested := r.URL.Query().Get("snapshot"); requested != "" {
		if !identifier.MatchString(requested) || len(r.URL.Query()["snapshot"]) != 1 {
			problem(w, r, http.StatusBadRequest, "snapshot_invalid")
			return
		}
		var manifest Manifest
		if err := json.Unmarshal(data, &manifest); err != nil {
			problem(w, r, http.StatusServiceUnavailable, "manifest_invalid")
			return
		}
		var pinned Snapshot
		for _, current := range manifest.Snapshots {
			if current.ID == requested {
				pinned = current
				break
			}
		}
		if pinned.ID == "" {
			if err := h.readJSON("snapshots/"+requested+"/snapshot.json", 1<<20, &pinned); err != nil {
				problem(w, r, http.StatusNotFound, "snapshot_missing")
				return
			}
		}
		region := r.URL.Query().Get("region")
		if pinned.ID != requested || (region != "" && region != pinned.Region) || h.validateSnapshot(&pinned) != nil {
			problem(w, r, http.StatusBadRequest, "snapshot_invalid")
			return
		}
		found := false
		for i := range manifest.Snapshots {
			if manifest.Snapshots[i].Region == pinned.Region {
				manifest.Snapshots[i] = pinned
				found = true
				break
			}
		}
		if !found {
			manifest.Snapshots = append(manifest.Snapshots, pinned)
		}
		data, _ = json.Marshal(manifest)
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if r.Method == http.MethodGet {
		_, _ = w.Write(data)
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
		if seen[s.Region] {
			return nil, errors.New("invalid source-qualified snapshot")
		}
		seen[s.Region] = true
		if err := h.validateSnapshot(s); err != nil {
			return nil, err
		}
	}
	return json.Marshal(m)
}

func (h *Handler) validateSnapshot(s *Snapshot) error {
	root := Prefix + "snapshots/" + s.ID + "/"
	if !identifier.MatchString(s.ID) || (s.Region != "cn" && s.Region != "jp") || s.Catalog != root+"catalog/index.json" {
		return errors.New("invalid source-qualified snapshot")
	}
	if s.Packs {
		if s.Assets != Prefix+"asset-store/" || !contentHash.MatchString(s.AssetCatalog) || s.AssetReleaseVersion == "" {
			return errors.New("invalid pinned store")
		}
	} else if s.Assets != root+"assets/" || s.AssetCatalog != "" || s.AssetReleaseVersion != "" {
		return errors.New("invalid loose assets")
	}
	if !gameVersion.MatchString(s.Version) || s.Base.DownloadBytes < 0 || s.Base.DecodedBytes < 0 {
		return errors.New("invalid snapshot version or size")
	}
	if s.Provenance["assetPolicy"] == "development-mount" && !h.development {
		return errors.New("mutable development assets cannot be served as immutable production assets")
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
	var assetErr error
	if s.Packs {
		assetErr = h.validateAssetCatalog(s)
		assets.Region, assets.Version = s.Region, s.Version
	} else {
		assetErr = h.readJSON(strings.TrimPrefix(s.Assets, Prefix)+"mysekai-fixtures.json", 32<<20, &assets)
	}
	if assetErr != nil {
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
	return nil
}

// The publisher validates all package/blob identities. Discovery independently
// verifies the exact immutable catalog and its source before declaring it usable.
func (h *Handler) validateAssetCatalog(s *Snapshot) error {
	f, err := h.open("asset-store/catalogs/" + s.AssetCatalog + ".json")
	if err != nil {
		return err
	}
	defer f.Close()
	bytes, err := io.ReadAll(io.LimitReader(f, 16<<20+1))
	if err != nil || len(bytes) > 16<<20 || fmt.Sprintf("%x", sha256.Sum256(bytes)) != s.AssetCatalog {
		return errors.New("asset catalog hash mismatch")
	}
	var catalog struct {
		Schema   string `json:"schema"`
		Region   string `json:"region"`
		Version  string `json:"version"`
		Packages []struct {
			Manifest string   `json:"manifest"`
			Paths    []string `json:"paths"`
		} `json:"packages"`
		Provenance struct {
			RuntimeSource struct {
				Region  string `json:"region"`
				Version string `json:"runtime_game_version"`
			} `json:"runtime_source"`
		} `json:"provenance"`
	}
	if err := json.Unmarshal(bytes, &catalog); err != nil {
		return err
	}
	version := catalog.Provenance.RuntimeSource.Version
	if version == "" {
		version = catalog.Version
	}
	if catalog.Schema != "moly-asset-packs/2" || catalog.Region != s.Region || catalog.Version != s.AssetReleaseVersion || version != s.Version || (catalog.Provenance.RuntimeSource.Region != "" && catalog.Provenance.RuntimeSource.Region != s.Region) || len(catalog.Packages) == 0 {
		return errors.New("asset catalog source mismatch")
	}
	for _, row := range catalog.Packages {
		if !storeDocument.MatchString("asset-store/"+row.Manifest) || !strings.HasPrefix(row.Manifest, "packages/") || len(row.Paths) == 0 {
			return errors.New("invalid package reference")
		}
	}
	return nil
}
