package debugbundle

import "strings"

// RedactURL strips the query string from a URL, keeping origin + path.
// Non-URL strings are returned unchanged. This is a second line of defense
// for any raw logs copied into the bundle; CRX-side redaction is primary.
func RedactURL(s string) string {
	idx := strings.IndexByte(s, '?')
	if idx < 0 {
		return s
	}
	return s[:idx] + "?[redacted-query]"
}
