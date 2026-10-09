package guessmusic

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientIP(t *testing.T) {
	zeabur := mustCIDRs("203.0.113.0/24")
	cases := []struct {
		name    string
		trusted bool // treat 203.0.113.0/24 as our ingress
		remote  string
		headers map[string]string
		want    string
	}{
		{name: "direct visitor", remote: "198.51.100.7:1", want: "198.51.100.7"},
		{name: "direct visitor forging headers", remote: "198.51.100.7:1",
			headers: map[string]string{"CF-Connecting-IP": "1.2.3.4", "X-Forwarded-For": "1.2.3.4", "X-Real-IP": "1.2.3.4"}, want: "198.51.100.7"},
		{name: "cloudflare straight to us", remote: "162.158.1.2:1",
			headers: map[string]string{"CF-Connecting-IP": "198.51.100.7"}, want: "198.51.100.7"},
		{name: "cloudflare without CF-Connecting-IP", remote: "162.158.1.2:1",
			headers: map[string]string{"X-Forwarded-For": "198.51.100.7"}, want: "162.158.1.2"},
		// Production: Cloudflare -> platform ingress (private) -> us.
		{name: "cloudflare via private ingress", remote: "10.0.0.5:1",
			headers: map[string]string{"CF-Connecting-IP": "198.51.100.7", "X-Forwarded-For": "198.51.100.7, 172.70.1.1"}, want: "198.51.100.7"},
		{name: "cloudflare via ingress, header missing", remote: "10.0.0.5:1",
			headers: map[string]string{"X-Forwarded-For": "198.51.100.7, 172.70.1.1"}, want: "198.51.100.7"},
		{name: "cloudflare via ingress, ipv6 visitor", remote: "10.0.0.5:1",
			headers: map[string]string{"CF-Connecting-IP": "2001:db8::1", "X-Forwarded-For": "2001:db8::1, 2606:4700::1"}, want: "2001:db8::1"},
		// Someone reaching the ingress without Cloudflare cannot pick an address.
		{name: "bypassing cloudflare with forged CF header", remote: "10.0.0.5:1",
			headers: map[string]string{"CF-Connecting-IP": "1.2.3.4", "X-Forwarded-For": "198.51.100.7"}, want: "198.51.100.7"},
		{name: "forged hops further out are ignored", remote: "10.0.0.5:1",
			headers: map[string]string{"X-Forwarded-For": "127.0.0.1, 1.2.3.4, 198.51.100.7"}, want: "198.51.100.7"},
		{name: "forged loopback cannot claim local", remote: "10.0.0.5:1",
			headers: map[string]string{"X-Forwarded-For": "127.0.0.1, 198.51.100.7"}, want: "198.51.100.7"},
		{name: "ingress with only X-Real-IP", remote: "10.0.0.5:1",
			headers: map[string]string{"X-Real-IP": "198.51.100.7"}, want: "198.51.100.7"},
		{name: "ingress with private X-Real-IP", remote: "10.0.0.5:1",
			headers: map[string]string{"X-Real-IP": "127.0.0.1"}, want: "10.0.0.5"},
		{name: "public ingress untrusted", remote: "203.0.113.9:1",
			headers: map[string]string{"X-Forwarded-For": "198.51.100.7"}, want: "203.0.113.9"},
		{name: "public ingress trusted", trusted: true, remote: "203.0.113.9:1",
			headers: map[string]string{"CF-Connecting-IP": "198.51.100.7", "X-Forwarded-For": "198.51.100.7, 104.16.0.1"}, want: "198.51.100.7"},
		{name: "local dev proxy", remote: "[::1]:1",
			headers: map[string]string{"X-Forwarded-For": "::1"}, want: "::1"},
		{name: "unparseable peer", remote: "pipe", want: "pipe"},
	}
	for _, c := range cases {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = c.remote
		for k, v := range c.headers {
			req.Header.Set(k, v)
		}
		p := ipResolver{}
		if c.trusted {
			p.trusted = zeabur
		}
		if got := p.clientIP(req); got != c.want {
			t.Errorf("%s: clientIP = %s, want %s", c.name, got, c.want)
		}
	}
}

func TestParseCIDRs(t *testing.T) {
	nets, err := ParseCIDRs(" 10.1.0.0/16, 203.0.113.9 ,2001:db8::/32,")
	if err != nil || len(nets) != 3 {
		t.Fatalf("got %v, %v", nets, err)
	}
	if nets[1].String() != "203.0.113.9/32" {
		t.Fatalf("bare address should be a host route, got %s", nets[1])
	}
	if _, err := ParseCIDRs("10.0.0.0/33"); err == nil {
		t.Fatal("bad CIDR must fail")
	}
	if _, err := ParseCIDRs("nope"); err == nil {
		t.Fatal("bad address must fail")
	}
}

func TestSessionRateLimit(t *testing.T) {
	h := newHarnessWith(t, nil, true, func(o *Options, _ string) { o.SessionsPerHour = 2 })
	post := func(ip string) result {
		return h.do(http.MethodPost, "/api/guess-music/daily/sessions", `{"tier":"easy","mode":"practice"}`, "",
			"CF-Connecting-IP", ip)
	}
	// The harness peer is public, so CF-Connecting-IP is ignored: one bucket.
	h.expect(post("1.1.1.1"), 201, "")
	h.expect(post("2.2.2.2"), 201, "")
	r := post("3.3.3.3")
	h.expect(r, 429, "rate_limited")
	if r.Header.Get("Retry-After") == "" {
		t.Fatal("429 should carry Retry-After")
	}
	h.clock.Advance(61 * 60e9)
	h.expect(post("1.1.1.1"), 201, "")
}

func TestPracticeClipRateLimit(t *testing.T) {
	h := newHarnessWith(t, nil, true, func(o *Options, _ string) { o.PracticeClipsPerHour = 2 })
	for i := 0; i < 2; i++ {
		h.expect(h.postClip(fmt.Sprintf(`{"vocalId":1,"clipSeconds":5,"seed":"s%d","round":0}`, i)), 200, "")
	}
	h.expect(h.postClip(`{"vocalId":1,"clipSeconds":5,"seed":"s9","round":0}`), 429, "rate_limited")
	// Invalid requests are rejected before they count.
	h.expect(h.postClip(`{"vocalId":1,"clipSeconds":3}`), 400, "bad_request")
}

func TestRateLimitGroupsIPv6Networks(t *testing.T) {
	clock := &fakeClock{}
	l := newRateLimiter(2, 3600e9, clock.Now)
	if !l.Allow("2001:db8:1:2::a") || !l.Allow("2001:db8:1:2:ffff::b") {
		t.Fatal("first two requests from the /64 should pass")
	}
	if l.Allow("2001:db8:1:2:1234::c") {
		t.Fatal("a third address in the same /64 shares the bucket")
	}
	if !l.Allow("2001:db8:1:3::a") {
		t.Fatal("another /64 has its own bucket")
	}
	if !l.Allow("::1") || !l.Allow("127.0.0.1") {
		t.Fatal("loopback is never limited")
	}
}
