package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"snowy_viewer/internal/masterdata"
	"snowy_viewer/internal/models"
)

const (
	defaultGachaPage       = 1
	defaultGachaLimit      = 24
	maxGachaPage           = 1_000_000
	maxGachaLimit          = 100
	masterDataRetryAfter   = "30"
	masterDataCacheControl = "public, max-age=300, s-maxage=3600"
)

// Handler holds dependencies for HTTP handlers.
type Handler struct {
	store *masterdata.Store
}

func (h *Handler) requireSnapshot(w http.ResponseWriter, r *http.Request) *masterdata.Snapshot {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return nil
	}
	snap := h.store.GetSnapshot()
	if snap != nil {
		return snap
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Retry-After", masterDataRetryAfter)
	w.WriteHeader(http.StatusServiceUnavailable)
	if r.Method != http.MethodHead {
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "masterdata unavailable"})
	}
	return nil
}

// New creates a new Handler instance.
func New(store *masterdata.Store) *Handler {
	return &Handler{
		store: store,
	}
}

// RegisterRoutes registers all API routes.
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/card-event-map", h.handleCardEventMap)
	mux.HandleFunc("/api/music-event-map", h.handleMusicEventMap)
	mux.HandleFunc("/api/card-gacha-map", h.handleCardGachaMap)
	mux.HandleFunc("/api/event-virtuallive-map", h.handleEventVirtualLiveMap)
	mux.HandleFunc("/api/virtuallive-event-map", h.handleVirtualLiveEventMap)
	mux.HandleFunc("/api/gachas", h.handleGachaList)
	mux.HandleFunc("/api/gachas/", h.handleGachaDetail)
}

func serveEncodedMap(w http.ResponseWriter, r *http.Request, encoded masterdata.EncodedMap) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", masterDataCacheControl)
	if encoded.ETag != "" {
		w.Header().Set("ETag", encoded.ETag)
		if etagMatches(r.Header.Get("If-None-Match"), encoded.ETag) {
			w.WriteHeader(http.StatusNotModified)
			return
		}
	}
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		_, _ = w.Write(encoded.Data)
	}
}

func etagMatches(ifNoneMatch, etag string) bool {
	if ifNoneMatch == "" || etag == "" {
		return false
	}
	for _, raw := range strings.Split(ifNoneMatch, ",") {
		candidate := strings.TrimSpace(raw)
		if candidate == "*" || candidate == etag || strings.TrimPrefix(candidate, "W/") == etag {
			return true
		}
	}
	return false
}

func (h *Handler) handleCardEventMap(w http.ResponseWriter, r *http.Request) {
	snap := h.requireSnapshot(w, r)
	if snap == nil {
		return
	}
	serveEncodedMap(w, r, snap.CardEventMapJSON)
}

func (h *Handler) handleMusicEventMap(w http.ResponseWriter, r *http.Request) {
	snap := h.requireSnapshot(w, r)
	if snap == nil {
		return
	}
	serveEncodedMap(w, r, snap.MusicEventMapJSON)
}

func (h *Handler) handleCardGachaMap(w http.ResponseWriter, r *http.Request) {
	snap := h.requireSnapshot(w, r)
	if snap == nil {
		return
	}
	serveEncodedMap(w, r, snap.CardGachaMapJSON)
}

func (h *Handler) handleEventVirtualLiveMap(w http.ResponseWriter, r *http.Request) {
	snap := h.requireSnapshot(w, r)
	if snap == nil {
		return
	}
	serveEncodedMap(w, r, snap.EventVirtualLiveMapJSON)
}

func (h *Handler) handleVirtualLiveEventMap(w http.ResponseWriter, r *http.Request) {
	snap := h.requireSnapshot(w, r)
	if snap == nil {
		return
	}
	serveEncodedMap(w, r, snap.VirtualLiveEventMapJSON)
}

func (h *Handler) handleGachaList(w http.ResponseWriter, r *http.Request) {
	snap := h.requireSnapshot(w, r)
	if snap == nil {
		return
	}
	// Parse Params
	query := r.URL.Query()
	page, err := parseBoundedPositiveInt(query.Get("page"), defaultGachaPage, maxGachaPage)
	if err != nil {
		writePaginationError(w, err)
		return
	}
	limit, err := parseBoundedPositiveInt(query.Get("limit"), defaultGachaLimit, maxGachaLimit)
	if err != nil {
		writePaginationError(w, err)
		return
	}
	search := strings.ToLower(query.Get("search"))
	sortBy := query.Get("sortBy")
	sortOrder := query.Get("sortOrder")

	gachaPickups := snap.GachaPickups

	// Fast path: default sort (startAt desc) with no search filter uses pre-sorted slice directly.
	var filtered []models.Gacha
	if search == "" && (sortBy == "" || sortBy == "startAt") && sortOrder != "asc" {
		filtered = snap.GachaByStartDesc
	} else {
		gachaList := snap.GachaList
		if search == "" {
			filtered = make([]models.Gacha, len(gachaList))
			copy(filtered, gachaList)
		} else {
			searchID, searchIDErr := strconv.Atoi(search)
			for _, g := range gachaList {
				if (searchIDErr == nil && g.ID == searchID) || strings.Contains(strings.ToLower(g.Name), search) {
					filtered = append(filtered, g)
				}
			}
		}

		// Sort
		asc := sortOrder == "asc"
		sort.Slice(filtered, func(i, j int) bool {
			left := filtered[i]
			right := filtered[j]

			if sortBy == "id" {
				if left.ID == right.ID {
					if left.StartAt == right.StartAt {
						return false
					}
					if asc {
						return left.StartAt < right.StartAt
					}
					return left.StartAt > right.StartAt
				}
				if asc {
					return left.ID < right.ID
				}
				return left.ID > right.ID
			}

			// Default sort by startAt.
			if left.StartAt == right.StartAt {
				if left.ID == right.ID {
					return false
				}
				if asc {
					return left.ID < right.ID
				}
				return left.ID > right.ID
			}
			if asc {
				return left.StartAt < right.StartAt
			}
			return left.StartAt > right.StartAt
		})
	}

	// Paginate
	total := len(filtered)
	start := total
	pageOffset := page - 1
	// Check the quotient before multiplying so untrusted page/limit values cannot overflow int.
	if pageOffset <= total/limit {
		start = pageOffset * limit
	}
	end := total
	if limit < total-start {
		end = start + limit
	}
	paged := filtered[start:end]

	// Map to Response
	resultItems := make([]models.GachaListItem, len(paged))
	for i, g := range paged {
		pickups := gachaPickups[g.ID]
		if pickups == nil {
			pickups = []int{}
		}
		resultItems[i] = models.GachaListItem{
			ID:              g.ID,
			GachaType:       g.GachaType,
			Name:            g.Name,
			AssetbundleName: g.AssetbundleName,
			StartAt:         g.StartAt,
			EndAt:           g.EndAt,
			PickupCardIds:   pickups,
		}
	}

	resp := models.GachaListResponse{
		Total:  total,
		Page:   page,
		Limit:  limit,
		Gachas: resultItems,
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", masterDataCacheControl)
	if r.Method == http.MethodHead {
		w.WriteHeader(http.StatusOK)
		return
	}
	_ = json.NewEncoder(w).Encode(resp)
}

func parseBoundedPositiveInt(raw string, fallback, maximum int) (int, error) {
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.ParseUint(raw, 10, 31)
	if err != nil || value < 1 || value > uint64(maximum) {
		return 0, fmt.Errorf("pagination value must be between 1 and %d", maximum)
	}
	return int(value), nil
}

func writePaginationError(w http.ResponseWriter, err error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadRequest)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
}

func (h *Handler) handleGachaDetail(w http.ResponseWriter, r *http.Request) {
	snap := h.requireSnapshot(w, r)
	if snap == nil {
		return
	}
	// Registered as a subtree pattern, so reject anything past /api/gachas/{id}.
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) != 4 {
		http.NotFound(w, r)
		return
	}
	idStr := parts[3]
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	found, ok := snap.GachaByID[id]
	if !ok {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusNotFound)
		if r.Method != http.MethodHead {
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "Gacha not found"})
		}
		return
	}

	pickups := snap.GachaPickups[found.ID]
	if pickups == nil {
		pickups = []int{}
	}

	resp := models.GachaDetailResponse{
		Gacha:         found,
		PickupCardIds: pickups,
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", masterDataCacheControl)
	if r.Method == http.MethodHead {
		w.WriteHeader(http.StatusOK)
		return
	}
	_ = json.NewEncoder(w).Encode(resp)
}
