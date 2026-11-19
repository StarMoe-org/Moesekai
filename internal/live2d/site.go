package live2d

import (
	"bufio"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync/atomic"
	"time"
)

// The site that publishes the story data (an exporter's publication): every region's canonical
// view at `<site>/<region>/` (its root listing names the version published now), each version at
// `<site>/<region>@<version>/`, the versions published at `<site>/history/<region>/canonical`, what
// a version changed at `<site>/changes/<region>/canonical@<version>` and the path tree of the
// version published now at `<site>/trees/<region>/canonical`. A file of a version never changes.

const (
	// maxDocumentBytes bounds an episode, model or listing document.
	maxDocumentBytes = 8 << 20
	// maxTreeBytes bounds the decompressed path tree (about 60 MB for jp in 2026).
	maxTreeBytes  = 512 << 20
	fetchAttempts = 3
)

var errNotFound = errors.New("not found")

type site struct {
	base   string
	client *http.Client
	// requests counts the requests made, for the log of a build.
	requests atomic.Int64
}

func newSite(base string) *site {
	return &site{
		base:   strings.TrimRight(base, "/"),
		client: &http.Client{Timeout: 120 * time.Second},
	}
}

func escapePath(path string) string {
	parts := strings.Split(path, "/")
	for i, part := range parts {
		parts[i] = url.PathEscape(part)
	}
	return strings.Join(parts, "/")
}

// getJSON decodes the JSON at `address` into `target`, reading at most `limit` bytes of it; a
// gzip body is decompressed. A 404 is errNotFound; other failures are tried again.
func (s *site) getJSON(ctx context.Context, address string, limit int64, target any) error {
	var last error
	for attempt := 1; attempt <= fetchAttempts; attempt++ {
		err := s.getJSONOnce(ctx, address, limit, target)
		if err == nil || errors.Is(err, errNotFound) || ctx.Err() != nil {
			return err
		}
		last = err
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Duration(attempt) * 500 * time.Millisecond):
		}
	}
	return last
}

func (s *site) getJSONOnce(ctx context.Context, address string, limit int64, target any) error {
	s.requests.Add(1)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, address, nil)
	if err != nil {
		return err
	}
	request.Header.Set("User-Agent", "moesekai-live2d-index/1")
	response, err := s.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNotFound {
		return fmt.Errorf("%s: %w", address, errNotFound)
	}
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("%s: %s", address, response.Status)
	}
	body := bufio.NewReader(io.LimitReader(response.Body, limit+1))
	var reader io.Reader = body
	// the history, the changes and the tree are stored gzip-compressed and served as such
	if magic, _ := body.Peek(2); len(magic) == 2 && magic[0] == 0x1f && magic[1] == 0x8b {
		unzipped, err := gzip.NewReader(body)
		if err != nil {
			return fmt.Errorf("%s: %w", address, err)
		}
		defer unzipped.Close()
		reader = io.LimitReader(unzipped, limit+1)
	}
	if err := json.NewDecoder(reader).Decode(target); err != nil {
		return fmt.Errorf("%s: %w", address, err)
	}
	return nil
}

type listing struct {
	Format           string `json:"format"`
	PublishedVersion string `json:"published_version"`
}

// published is the version of `region` the site publishes now.
func (s *site) published(ctx context.Context, region string) (string, error) {
	var root listing
	if err := s.getJSON(ctx, fmt.Sprintf("%s/%s/", s.base, region), maxDocumentBytes, &root); err != nil {
		return "", err
	}
	if root.PublishedVersion == "" {
		return "", fmt.Errorf("%s/%s/: no published version", s.base, region)
	}
	return root.PublishedVersion, nil
}

type historyEntry struct {
	PublishedVersion string `json:"published_version"`
}

// history is the versions of `region` published, newest first.
func (s *site) history(ctx context.Context, region string) ([]historyEntry, error) {
	var history struct {
		Format  string         `json:"format"`
		Entries []historyEntry `json:"entries"`
	}
	if err := s.getJSON(ctx, fmt.Sprintf("%s/history/%s/canonical", s.base, region), maxDocumentBytes, &history); err != nil {
		return nil, err
	}
	if history.Format != "version-history" {
		return nil, fmt.Errorf("history of %s: format %q", region, history.Format)
	}
	return history.Entries, nil
}

type changedFile struct {
	Path string `json:"path"`
}

type versionChanges struct {
	Format  string        `json:"format"`
	From    string        `json:"from"`
	To      string        `json:"to"`
	Added   []changedFile `json:"added"`
	Removed []changedFile `json:"removed"`
	Changed []changedFile `json:"changed"`
}

// changes is what `version` of `region` changed from the version before it; errNotFound when
// the site keeps no record of it.
func (s *site) changes(ctx context.Context, region, version string) (*versionChanges, error) {
	var changes versionChanges
	address := fmt.Sprintf("%s/changes/%s/canonical@%s", s.base, region, url.PathEscape(version))
	if err := s.getJSON(ctx, address, maxTreeBytes, &changes); err != nil {
		return nil, err
	}
	if changes.Format != "version-changes" || changes.To != version {
		return nil, fmt.Errorf("%s: not the changes of %s", address, version)
	}
	return &changes, nil
}

type treeDirectory struct {
	Name        string          `json:"name"`
	Directories []treeDirectory `json:"directories"`
	Files       struct {
		Names []string `json:"names"`
	} `json:"files"`
}

type pathTree struct {
	Format           string        `json:"format"`
	PublishedVersion string        `json:"published_version"`
	Root             treeDirectory `json:"root"`
}

// tree is the path tree of the version of `region` the site publishes now.
func (s *site) tree(ctx context.Context, region string) (*pathTree, error) {
	var tree pathTree
	if err := s.getJSON(ctx, fmt.Sprintf("%s/trees/%s/canonical", s.base, region), maxTreeBytes, &tree); err != nil {
		return nil, err
	}
	if tree.Format != "directory-tree" || tree.PublishedVersion == "" {
		return nil, fmt.Errorf("tree of %s: format %q", region, tree.Format)
	}
	return &tree, nil
}

// walk calls `visit` with the path of every file under `dir` whose path starts with `prefix`
// (directories that cannot hold one are skipped).
func (dir *treeDirectory) walk(at, prefix string, visit func(path string)) {
	for _, name := range dir.Files.Names {
		if path := at + name; strings.HasPrefix(path, prefix) {
			visit(path)
		}
	}
	for i := range dir.Directories {
		sub := &dir.Directories[i]
		path := at + sub.Name + "/"
		if strings.HasPrefix(path, prefix) || strings.HasPrefix(prefix, path) {
			sub.walk(path, prefix, visit)
		}
	}
}

// file decodes the file at `path` of `version` of `region`.
func (s *site) file(ctx context.Context, region, version, path string, target any) error {
	address := fmt.Sprintf("%s/%s@%s/%s", s.base, region, url.PathEscape(version), escapePath(path))
	return s.getJSON(ctx, address, maxDocumentBytes, target)
}
