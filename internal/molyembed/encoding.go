package molyembed

import (
	"sort"
	"strconv"
	"strings"
)

// RFC 9110 §12.5.3: an explicit q=0 overrides '*'. For equal qualities we
// prefer Brotli, then gzip. Implicitly acceptable identity is the fallback;
// an explicitly requested identity participates in preference ordering.
func preferredEncodings(header string) []string {
	if strings.TrimSpace(header) == "" {
		return []string{"identity"}
	}
	values := map[string]float64{}
	for _, entry := range strings.Split(header, ",") {
		fields := strings.Split(entry, ";")
		coding := strings.ToLower(strings.TrimSpace(fields[0]))
		if coding == "" {
			continue
		}
		quality := 1.0
		for _, field := range fields[1:] {
			pair := strings.SplitN(field, "=", 2)
			if len(pair) == 2 && strings.EqualFold(strings.TrimSpace(pair[0]), "q") {
				number, err := strconv.ParseFloat(strings.TrimSpace(pair[1]), 64)
				if err != nil || !(number >= 0 && number <= 1) {
					quality = 0
				} else {
					quality = number
				}
			}
		}
		// Conflicting repeated declarations must not undo an explicit prohibition.
		if old, exists := values[coding]; !exists || quality < old {
			values[coding] = quality
		}
	}
	type preference struct {
		coding  string
		quality float64
	}
	options := []preference{}
	for _, coding := range []string{"br", "gzip"} {
		quality, found := values[coding]
		if !found {
			quality = values["*"]
		}
		if quality > 0 {
			options = append(options, preference{coding, quality})
		}
	}
	identity, explicitIdentity := values["identity"]
	if explicitIdentity && identity > 0 {
		options = append(options, preference{"identity", identity})
	}
	sort.SliceStable(options, func(i, j int) bool { return options[i].quality > options[j].quality })
	result := make([]string, 0, len(options)+1)
	for _, option := range options {
		result = append(result, option.coding)
	}
	wildcard, hasWildcard := values["*"]
	if !explicitIdentity && (!hasWildcard || wildcard > 0) {
		result = append(result, "identity")
	}
	return result
}
