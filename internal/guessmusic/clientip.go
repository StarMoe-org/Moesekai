package guessmusic

import (
	"net"
	"net/http"
	"strings"
)

// cloudflareRanges are Cloudflare's edge networks
// (https://www.cloudflare.com/ips-v4 and /ips-v6, checked 2026-10-09).
// Only a hop from one of these may vouch for CF-Connecting-IP.
var cloudflareRanges = mustCIDRs(
	"173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
	"141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
	"197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
	"104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
	"2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32",
	"2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
)

func mustCIDRs(cidrs ...string) []*net.IPNet {
	nets, err := ParseCIDRs(strings.Join(cidrs, ","))
	if err != nil {
		panic(err)
	}
	return nets
}

// ParseCIDRs parses a comma-separated list of networks; a bare address
// counts as a single host.
func ParseCIDRs(list string) ([]*net.IPNet, error) {
	var nets []*net.IPNet
	for _, part := range strings.Split(list, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if !strings.Contains(part, "/") {
			ip := net.ParseIP(part)
			if ip == nil {
				return nil, &net.ParseError{Type: "IP address", Text: part}
			}
			bits := 128
			if ip.To4() != nil {
				ip, bits = ip.To4(), 32
			}
			nets = append(nets, &net.IPNet{IP: ip, Mask: net.CIDRMask(bits, bits)})
			continue
		}
		_, n, err := net.ParseCIDR(part)
		if err != nil {
			return nil, err
		}
		nets = append(nets, n)
	}
	return nets, nil
}

func inNets(ip net.IP, nets []*net.IPNet) bool {
	for _, n := range nets {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}

// ipResolver finds the address a request really came from, for rate limits.
//
// Production runs behind Cloudflare and then the hosting platform's ingress,
// so the TCP peer is a proxy. The resolver walks the X-Forwarded-For chain
// from the nearest hop outward, skipping our own proxies (loopback, private
// ranges, trusted); the first other hop is the edge that reached us. When
// that edge is a Cloudflare server, CF-Connecting-IP names the visitor.
// Anything a client writes into these headers itself sits further out in
// the chain, or arrives without Cloudflare in front, and is ignored.
type ipResolver struct {
	trusted []*net.IPNet
}

func (p ipResolver) ours(ip net.IP) bool {
	return ip.IsLoopback() || ip.IsPrivate() || inNets(ip, p.trusted)
}

func (p ipResolver) clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	peer := net.ParseIP(host)
	if peer == nil {
		return host
	}
	hops := []net.IP{}
	if p.ours(peer) {
		for _, header := range r.Header.Values("X-Forwarded-For") {
			for _, part := range strings.Split(header, ",") {
				if ip := net.ParseIP(strings.TrimSpace(part)); ip != nil {
					hops = append(hops, ip)
				}
			}
		}
	}
	hops = append(hops, peer)
	i := len(hops) - 1
	for i > 0 && p.ours(hops[i]) {
		i--
	}
	edge := hops[i]
	if p.ours(edge) && len(hops) == 1 {
		// A proxy of ours that sends no X-Forwarded-For may still name the
		// client in X-Real-IP; only a public address is believed.
		if ip := net.ParseIP(strings.TrimSpace(r.Header.Get("X-Real-IP"))); ip != nil && ip.IsGlobalUnicast() && !ip.IsPrivate() {
			edge = ip
		}
	}
	if inNets(edge, cloudflareRanges) {
		if ip := net.ParseIP(strings.TrimSpace(r.Header.Get("CF-Connecting-IP"))); ip != nil {
			return ip.String()
		}
		if i > 0 {
			return hops[i-1].String()
		}
	}
	return edge.String()
}
