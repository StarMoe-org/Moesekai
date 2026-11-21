package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"snowy_viewer/internal/masterdata"
	"snowy_viewer/internal/models"
)

func gachaHandlerForTest(t *testing.T) *Handler {
	t.Helper()
	dir := t.TempDir()
	for _, filename := range []string{"events.json", "eventCards.json", "eventMusics.json", "virtualLives.json"} {
		if err := os.WriteFile(filepath.Join(dir, filename), []byte("[]"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	gachaJSON, err := json.Marshal([]models.Gacha{
		{ID: 1, Name: "First", StartAt: 1},
		{ID: 2, Name: "Second", StartAt: 2},
		{ID: 3, Name: "Third", StartAt: 3},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "gachas.json"), gachaJSON, 0o600); err != nil {
		t.Fatal(err)
	}
	store := masterdata.NewStore(dir)
	if err := store.Fetch(); err != nil {
		t.Fatal(err)
	}
	return New(store)
}

func TestGachaPaginationRejectsUnsafeValues(t *testing.T) {
	handler := gachaHandlerForTest(t)
	for _, query := range []string{
		"page=9223372036854775807&limit=2",
		"page=1&limit=9223372036854775807",
		"page=-1&limit=2",
		"page=invalid&limit=2",
		"page=1&limit=101",
	} {
		t.Run(query, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, "/api/gachas?"+query, nil)
			handler.handleGachaList(recorder, request)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
			}
			var response map[string]string
			if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
				t.Fatal(err)
			}
			if response["error"] == "" {
				t.Fatal("expected a bounded pagination error")
			}
		})
	}
}

func TestGachaPaginationHandlesBoundedPages(t *testing.T) {
	tests := []struct {
		name       string
		query      string
		wantPage   int
		wantLimit  int
		wantGachas int
	}{
		{
			name:       "maximum bounded page is empty",
			query:      "page=1000000&limit=100",
			wantPage:   maxGachaPage,
			wantLimit:  maxGachaLimit,
			wantGachas: 0,
		},
		{
			name:       "ordinary final page",
			query:      "page=2&limit=2",
			wantPage:   2,
			wantLimit:  2,
			wantGachas: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, "/api/gachas?"+tt.query, nil)
			gachaHandlerForTest(t).handleGachaList(recorder, request)

			if recorder.Code != http.StatusOK {
				t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
			}
			var response models.GachaListResponse
			if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
				t.Fatal(err)
			}
			if response.Page != tt.wantPage || response.Limit != tt.wantLimit || len(response.Gachas) != tt.wantGachas {
				t.Fatalf("response = %#v, want page=%d limit=%d gachas=%d", response, tt.wantPage, tt.wantLimit, tt.wantGachas)
			}
		})
	}
}

func TestRegisteredRoutesRejectExtraPathSegments(t *testing.T) {
	mux := http.NewServeMux()
	gachaHandlerForTest(t).RegisterRoutes(mux)

	tests := []struct {
		path       string
		wantStatus int
	}{
		{path: "/api/gachas", wantStatus: http.StatusOK},
		{path: "/api/gachas/1", wantStatus: http.StatusOK},
		{path: "/api/gachas/", wantStatus: http.StatusNotFound},
		{path: "/api/gachas/1/", wantStatus: http.StatusNotFound},
		{path: "/api/gachas/1/anything", wantStatus: http.StatusNotFound},
		{path: "/api/card-event-map", wantStatus: http.StatusOK},
		{path: "/api/card-event-map/anything", wantStatus: http.StatusNotFound},
		{path: "/api/music-event-map/anything", wantStatus: http.StatusNotFound},
		{path: "/api/card-gacha-map/anything", wantStatus: http.StatusNotFound},
		{path: "/api/event-virtuallive-map/anything", wantStatus: http.StatusNotFound},
		{path: "/api/virtuallive-event-map/anything", wantStatus: http.StatusNotFound},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			mux.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, tt.path, nil))
			if recorder.Code != tt.wantStatus {
				t.Fatalf("GET %s status = %d, want %d", tt.path, recorder.Code, tt.wantStatus)
			}
		})
	}
}

func TestGachaDetailServesTheRequestedGacha(t *testing.T) {
	recorder := httptest.NewRecorder()
	gachaHandlerForTest(t).handleGachaDetail(recorder, httptest.NewRequest(http.MethodGet, "/api/gachas/2", nil))

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
	var response models.GachaDetailResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response.Gacha.ID != 2 {
		t.Fatalf("gacha id = %d, want 2", response.Gacha.ID)
	}
}

func TestGachaDetailReturnsJSONErrorForUnknownID(t *testing.T) {
	recorder := httptest.NewRecorder()
	gachaHandlerForTest(t).handleGachaDetail(recorder, httptest.NewRequest(http.MethodGet, "/api/gachas/999", nil))

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusNotFound)
	}
	var response map[string]string
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response["error"] != "Gacha not found" {
		t.Fatalf("error = %q, want %q", response["error"], "Gacha not found")
	}
}

func TestMasterDataEndpointsReturnRetryableServiceUnavailableBeforeStartupLoad(t *testing.T) {
	handler := New(masterdata.NewStore(t.TempDir()))
	recorder := httptest.NewRecorder()
	handler.handleCardEventMap(recorder, httptest.NewRequest(http.MethodGet, "/api/card-event-map", nil))

	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusServiceUnavailable)
	}
	if recorder.Header().Get("Retry-After") != masterDataRetryAfter {
		t.Fatalf("Retry-After = %q, want %q", recorder.Header().Get("Retry-After"), masterDataRetryAfter)
	}
	if recorder.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", recorder.Header().Get("Cache-Control"))
	}
}

func TestMapEndpointsSupportCacheControlETag304AndMethodGuards(t *testing.T) {
	h := gachaHandlerForTest(t)

	// POST rejected with 405
	postRec := httptest.NewRecorder()
	h.handleCardEventMap(postRec, httptest.NewRequest(http.MethodPost, "/api/card-event-map", nil))
	if postRec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST status = %d, want 405", postRec.Code)
	}
	if postRec.Header().Get("Allow") != "GET, HEAD" {
		t.Fatalf("Allow = %q, want GET, HEAD", postRec.Header().Get("Allow"))
	}

	// GET returns Cache-Control and ETag
	getRec := httptest.NewRecorder()
	h.handleCardEventMap(getRec, httptest.NewRequest(http.MethodGet, "/api/card-event-map", nil))
	if getRec.Code != http.StatusOK {
		t.Fatalf("GET status = %d, want 200", getRec.Code)
	}
	etag := getRec.Header().Get("ETag")
	if etag == "" {
		t.Fatal("missing ETag header")
	}
	if getRec.Header().Get("Cache-Control") != masterDataCacheControl {
		t.Fatalf("Cache-Control = %q, want %q", getRec.Header().Get("Cache-Control"), masterDataCacheControl)
	}

	// Matching If-None-Match returns 304 with empty body
	condReq := httptest.NewRequest(http.MethodGet, "/api/card-event-map", nil)
	condReq.Header.Set("If-None-Match", etag)
	condRec := httptest.NewRecorder()
	h.handleCardEventMap(condRec, condReq)
	if condRec.Code != http.StatusNotModified || condRec.Body.Len() != 0 {
		t.Fatalf("conditional GET = %d len=%d, want 304 empty", condRec.Code, condRec.Body.Len())
	}

	// HEAD returns 200 with empty body
	headRec := httptest.NewRecorder()
	h.handleCardEventMap(headRec, httptest.NewRequest(http.MethodHead, "/api/card-event-map", nil))
	if headRec.Code != http.StatusOK || headRec.Body.Len() != 0 {
		t.Fatalf("HEAD = %d len=%d, want 200 empty", headRec.Code, headRec.Body.Len())
	}
}
