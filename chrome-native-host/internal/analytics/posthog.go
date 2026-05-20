// Package analytics provides lightweight PostHog product analytics for the
// superduck CLI and native-host. It captures command usage so we can see which
// CLI features actually get used and measure the impact of changes.
//
// The client is opt-in:
//
//   - Disabled when SUPERDUCK_ANALYTICS_DISABLED is set, or in CI.
//   - Enabled when a write key is compiled in via PostHogWriteKey, or
//     supplied through the SUPERDUCK_POSTHOG_KEY env var.
//
// All network I/O happens on a background goroutine with a short timeout so
// instrumentation never blocks the CLI's main path. A best-effort persistent
// distinct_id is stored in ~/.superduck/analytics-id.
package analytics

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// PostHogWriteKey is the write-only project token for PostHog product analytics.
// This is a public, write-only key (cannot read data) — safe to commit.
var PostHogWriteKey = "phc_usrQSJ4QknZBB8iZT9jmJZE5XixypAwvFn49dB8wFSss"

// PostHogHost can be overridden for self-hosted PostHog instances.
var PostHogHost = "https://us.i.posthog.com"

// LibVersion is the CLI version string embedded in analytics events.
// Set at build time via -ldflags "-X chrome-native-host/internal/analytics.LibVersion=0.2.5"
var LibVersion = "dev"

const (
	envDisabled = "SUPERDUCK_ANALYTICS_DISABLED"
	envWriteKey = "SUPERDUCK_POSTHOG_KEY"
	envHost     = "SUPERDUCK_POSTHOG_HOST"
	envCI       = "CI"
)

// Client is a minimal PostHog capture client. The zero value is unusable;
// always construct via New.
type Client struct {
	apiKey     string
	host       string
	httpClient *http.Client
	enabled    bool

	idOnce     sync.Once
	distinctID string
	idOverride string

	pending sync.WaitGroup
}

// Options configures a Client. All fields are optional.
type Options struct {
	APIKey     string        // overrides env / build-time default
	Host       string        // overrides PostHogHost / env
	DistinctID string        // overrides the on-disk anonymous id
	HTTPClient *http.Client  // overrides http.DefaultClient (testing)
	Timeout    time.Duration // request timeout (default 2s)
}

// New constructs a Client. If analytics is disabled (env opt-out, no key, or
// running in CI) the returned client is a no-op — callers do not need to
// branch on enabled state. The on-disk distinct_id is loaded lazily on first
// Capture so help-screen invocations don't pay for disk I/O.
func New(opts Options) *Client {
	c := &Client{
		host:       firstNonEmpty(opts.Host, os.Getenv(envHost), PostHogHost),
		apiKey:     firstNonEmpty(opts.APIKey, os.Getenv(envWriteKey), PostHogWriteKey),
		httpClient: opts.HTTPClient,
		idOverride: strings.TrimSpace(opts.DistinctID),
	}
	if c.httpClient == nil {
		timeout := opts.Timeout
		if timeout <= 0 {
			timeout = 2 * time.Second
		}
		c.httpClient = &http.Client{Timeout: timeout}
	}
	c.enabled = c.computeEnabled()
	return c
}

// Enabled reports whether the client will actually deliver events.
func (c *Client) Enabled() bool {
	if c == nil {
		return false
	}
	return c.enabled
}

// DistinctID returns the anonymous identifier used for events. Resolves the
// on-disk id lazily on first call.
func (c *Client) DistinctID() string {
	if c == nil {
		return ""
	}
	c.idOnce.Do(func() {
		if c.idOverride != "" {
			c.distinctID = c.idOverride
			return
		}
		c.distinctID = loadOrCreateDistinctID()
	})
	return c.distinctID
}

func (c *Client) computeEnabled() bool {
	if isTrueEnv(envDisabled) {
		return false
	}
	if isTrueEnv(envCI) {
		return false
	}
	return c.apiKey != ""
}

// Capture records a single product analytics event. Properties may be nil.
// Delivery is asynchronous and best-effort; this method never returns errors
// to the caller because failed instrumentation must not break user-facing
// commands.
func (c *Client) Capture(event string, properties map[string]any) {
	if !c.Enabled() || event == "" {
		return
	}
	payload := buildCaptureBody(c.apiKey, c.DistinctID(), event, properties, time.Now().UTC())
	c.pending.Add(1)
	go func() {
		defer c.pending.Done()
		c.send(payload)
	}()
}

// Flush waits for in-flight events to finish (bounded by ctx). Useful from
// short-lived processes like the CLI right before exit.
func (c *Client) Flush(ctx context.Context) {
	if c == nil {
		return
	}
	done := make(chan struct{})
	go func() {
		c.pending.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-ctx.Done():
	}
}

func (c *Client) send(body []byte) {
	endpoint := strings.TrimRight(c.host, "/") + "/capture/"
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "superduck-cli/analytics")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return
	}
	// Drain & close so the connection can be reused / closed cleanly.
	_ = resp.Body.Close()
}

// buildCaptureBody is exported (lowercase but tested) so we can verify the
// wire format independently of the HTTP transport.
func buildCaptureBody(apiKey, distinctID, event string, properties map[string]any, ts time.Time) []byte {
	props := map[string]any{
		"$lib":         "superduck-cli",
		"$lib_version": LibVersion,
	}
	for k, v := range properties {
		// Don't allow the caller to clobber library-identifying keys.
		if _, reserved := props[k]; reserved {
			continue
		}
		props[k] = v
	}
	envelope := map[string]any{
		"api_key":     apiKey,
		"event":       event,
		"distinct_id": distinctID,
		"timestamp":   ts.Format(time.RFC3339Nano),
		"properties":  props,
	}
	out, _ := json.Marshal(envelope)
	return out
}

// loadOrCreateDistinctID stores a stable random id under ~/.superduck so
// repeated CLI invocations from the same machine appear as one user. If the
// home directory is unavailable, returns a fresh ephemeral id rather than
// failing loudly — analytics is best-effort.
func loadOrCreateDistinctID() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return randomID()
	}
	dir := filepath.Join(home, ".superduck")
	idFile := filepath.Join(dir, "analytics-id")
	if data, err := os.ReadFile(idFile); err == nil {
		if id := strings.TrimSpace(string(data)); id != "" {
			return id
		}
	}
	id := randomID()
	if err := os.MkdirAll(dir, 0o755); err == nil {
		// 0600 — anonymous id is not a secret, but no reason to share it.
		_ = os.WriteFile(idFile, []byte(id+"\n"), 0o600)
	}
	return id
}

func randomID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		// Fall back to time-based id; collisions are acceptable for analytics.
		return "anon-" + time.Now().UTC().Format("20060102150405.000000000")
	}
	return "anon-" + hex.EncodeToString(b[:])
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func isTrueEnv(name string) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(name)))
	switch v {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}
