// Package errortrack provides lightweight, opt-in error reporting for the
// superduck CLI, native-host and MCP server. It is wire-compatible with
// Sentry's "store" endpoint so any Sentry-compatible backend (Sentry SaaS,
// self-hosted Sentry, GlitchTip) can ingest events without pulling in the
// official sentry-go SDK (which would add a dependency that fails our
// min-release-age policy on first import).
//
// Design constraints (mirrors internal/analytics):
//
//   - Disabled when SUPERDUCK_ERRORTRACK_DISABLED is truthy, in CI, or no DSN.
//   - DSN read from SUPERDUCK_SENTRY_DSN env var, or compiled in via
//     SentryDSN ldflag.
//   - All network I/O happens on a background goroutine with a short timeout
//     so a slow Sentry host can never delay the CLI exit.
//   - Sensitive values (api_key, token, password, cookie, …) are scrubbed
//     from extras and breadcrumbs before send.
//   - Breadcrumbs are bounded (default 32) so long-running processes don't
//     accumulate unbounded memory.
//   - User context is opt-in (CaptureWithUser); the default report only ships
//     OS / arch / release info.
package errortrack

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"runtime"
	"runtime/debug"
	"strings"
	"sync"
	"time"
)

// SentryDSN may be overridden at build time via -ldflags:
//
//	go build -ldflags "-X chrome-native-host/internal/errortrack.SentryDSN=https://..."
var SentryDSN = ""

// Release is stamped onto every event. Override at build time the same way as
// SentryDSN, or call SetRelease before any Capture.
var Release = "dev"

const (
	envDSN          = "SUPERDUCK_SENTRY_DSN"
	envDisabled     = "SUPERDUCK_ERRORTRACK_DISABLED"
	envEnvironment  = "SUPERDUCK_ENV"
	envCI           = "CI"
	defaultMaxCrumb = 32
	maxBreadcrumbs  = 100 // hard ceiling to prevent runaway memory
	sdkName         = "superduck.errortrack"
	sdkVersion      = "0.1.0"
)

// Level mirrors Sentry's severity vocabulary. Use Capture for "error",
// CaptureMessage for everything else.
type Level string

const (
	LevelDebug   Level = "debug"
	LevelInfo    Level = "info"
	LevelWarning Level = "warning"
	LevelError   Level = "error"
	LevelFatal   Level = "fatal"
)

// Breadcrumb is a small log of activity preceding the error.
type Breadcrumb struct {
	Timestamp time.Time      `json:"timestamp"`
	Category  string         `json:"category,omitempty"`
	Message   string         `json:"message,omitempty"`
	Level     Level          `json:"level,omitempty"`
	Data      map[string]any `json:"data,omitempty"`
}

// User is optional contextual identification. Ship only what callers
// explicitly attach — nothing here is read from the environment.
type User struct {
	ID       string `json:"id,omitempty"`
	Username string `json:"username,omitempty"`
	Email    string `json:"email,omitempty"`
}

// Options configures a Client. The zero value is valid.
type Options struct {
	DSN          string
	Environment  string
	Release      string
	HTTPClient   *http.Client
	Timeout      time.Duration
	MaxCrumbs    int
	RedactKeys   []string
	ServerName   string
	ComponentTag string // e.g. "cli", "native-host", "mcp-server"
}

// Client buffers breadcrumbs and ships envelopes to Sentry. The zero value
// is unusable; always call New.
type Client struct {
	enabled    bool
	dsn        parsedDSN
	httpClient *http.Client

	environment  string
	release      string
	serverName   string
	componentTag string

	maxCrumbs int
	redact    map[string]struct{}

	mu          sync.Mutex
	breadcrumbs []Breadcrumb
	inflight    int
	cond        *sync.Cond
}

// New constructs a Client. If error tracking is disabled (env opt-out, CI, or
// missing/invalid DSN) the returned client is a no-op — callers do not need
// to branch on Enabled.
func New(opts Options) *Client {
	c := &Client{
		httpClient:   opts.HTTPClient,
		environment:  firstNonEmpty(opts.Environment, getenv(envEnvironment), "production"),
		release:      firstNonEmpty(opts.Release, Release),
		serverName:   strings.TrimSpace(opts.ServerName),
		componentTag: strings.TrimSpace(opts.ComponentTag),
		maxCrumbs:    opts.MaxCrumbs,
	}
	c.cond = sync.NewCond(&c.mu)
	if c.maxCrumbs <= 0 {
		c.maxCrumbs = defaultMaxCrumb
	}
	if c.maxCrumbs > maxBreadcrumbs {
		c.maxCrumbs = maxBreadcrumbs
	}
	if c.httpClient == nil {
		timeout := opts.Timeout
		if timeout <= 0 {
			timeout = 2 * time.Second
		}
		c.httpClient = &http.Client{Timeout: timeout}
	}

	rk := opts.RedactKeys
	if rk == nil {
		rk = DefaultRedactKeys
	}
	c.redact = make(map[string]struct{}, len(rk))
	for _, k := range rk {
		c.redact[strings.ToLower(strings.TrimSpace(k))] = struct{}{}
	}

	rawDSN := firstNonEmpty(opts.DSN, getenv(envDSN), SentryDSN)
	if rawDSN == "" || isTruthyEnv(envDisabled) || isTruthyEnv(envCI) {
		c.enabled = false
		return c
	}
	parsed, err := parseDSN(rawDSN)
	if err != nil {
		c.enabled = false
		return c
	}
	c.dsn = parsed
	c.enabled = true
	return c
}

// SetRelease overrides the package-level Release tag. Useful for tests and
// for binaries that learn their version after init.
func SetRelease(r string) {
	if strings.TrimSpace(r) != "" {
		Release = r
	}
}

// Enabled reports whether the client will actually deliver events.
func (c *Client) Enabled() bool {
	return c != nil && c.enabled
}

// AddBreadcrumb appends a crumb to the rolling buffer. Safe from any
// goroutine. Excess crumbs beyond MaxCrumbs are dropped from the front.
func (c *Client) AddBreadcrumb(b Breadcrumb) {
	if c == nil {
		return
	}
	if b.Timestamp.IsZero() {
		b.Timestamp = time.Now().UTC()
	}
	if b.Level == "" {
		b.Level = LevelInfo
	}
	b.Data = redactMap(b.Data, c.redact)

	c.mu.Lock()
	defer c.mu.Unlock()
	c.breadcrumbs = append(c.breadcrumbs, b)
	if over := len(c.breadcrumbs) - c.maxCrumbs; over > 0 {
		// Drop oldest, retain ordering.
		c.breadcrumbs = append(c.breadcrumbs[:0], c.breadcrumbs[over:]...)
	}
}

// snapshotCrumbs returns a defensive copy so events serialize a stable view.
func (c *Client) snapshotCrumbs() []Breadcrumb {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]Breadcrumb, len(c.breadcrumbs))
	copy(out, c.breadcrumbs)
	return out
}

// Capture reports an error. Safe (and a no-op) when err is nil or the client
// is disabled. Extras are merged with the standard runtime context after
// scrubbing.
func (c *Client) Capture(err error, extras map[string]any) {
	if !c.Enabled() || err == nil {
		return
	}
	c.captureInternal(err, extras, nil, LevelError, "")
}

// CaptureWithUser is Capture plus a one-off user attachment for this event.
// The user is not retained on the client.
func (c *Client) CaptureWithUser(err error, user User, extras map[string]any) {
	if !c.Enabled() || err == nil {
		return
	}
	c.captureInternal(err, extras, &user, LevelError, "")
}

// CaptureMessage reports a non-error event (warning, info, etc).
func (c *Client) CaptureMessage(msg string, level Level, extras map[string]any) {
	if !c.Enabled() || strings.TrimSpace(msg) == "" {
		return
	}
	c.captureInternal(errors.New(msg), extras, nil, level, msg)
}

// Recover should be deferred at process entry points. It captures any panic,
// preserves the stack, and re-panics so the caller sees the original failure.
func (c *Client) Recover() {
	r := recover()
	if r == nil {
		return
	}
	if c.Enabled() {
		var err error
		switch v := r.(type) {
		case error:
			err = v
		default:
			err = fmt.Errorf("%v", v)
		}
		c.captureInternal(err, map[string]any{
			"panic":      true,
			"stacktrace": string(debug.Stack()),
		}, nil, LevelFatal, "")
		// Best-effort flush before re-panic; bounded to 1s.
		flushCtx, cancel := context.WithTimeout(context.Background(), time.Second)
		c.Flush(flushCtx)
		cancel()
	}
	panic(r)
}

// Flush waits for in-flight envelopes to finish, bounded by ctx.
func (c *Client) Flush(ctx context.Context) {
	if c == nil {
		return
	}
	done := make(chan struct{})
	go func() {
		c.mu.Lock()
		for c.inflight > 0 {
			c.cond.Wait()
		}
		c.mu.Unlock()
		close(done)
	}()
	select {
	case <-done:
	case <-ctx.Done():
	}
}

func (c *Client) captureInternal(err error, extras map[string]any, user *User, level Level, message string) {
	event := c.buildEvent(err, extras, user, level, message)
	body, jerr := json.Marshal(event)
	if jerr != nil {
		return
	}
	c.mu.Lock()
	c.inflight++
	c.mu.Unlock()
	go func() {
		defer func() {
			c.mu.Lock()
			c.inflight--
			c.cond.Broadcast()
			c.mu.Unlock()
		}()
		c.send(body)
	}()
}

func (c *Client) send(body []byte) {
	endpoint := c.dsn.storeEndpoint()
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", sdkName+"/"+sdkVersion)
	req.Header.Set("X-Sentry-Auth", c.dsn.authHeader(time.Now().UTC()))

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return
	}
	_ = resp.Body.Close()
}

func (c *Client) buildEvent(err error, extras map[string]any, user *User, level Level, message string) map[string]any {
	if message == "" {
		message = err.Error()
	}
	message = redactString(message)
	errValue := redactString(err.Error())
	tags := map[string]string{}
	if c.componentTag != "" {
		tags["component"] = c.componentTag
	}
	contexts := map[string]any{
		"runtime": map[string]any{
			"name":    "go",
			"version": runtime.Version(),
		},
		"os": map[string]any{
			"name": runtime.GOOS,
			"arch": runtime.GOARCH,
		},
	}
	event := map[string]any{
		"event_id":    newEventID(),
		"timestamp":   time.Now().UTC().Format(time.RFC3339Nano),
		"platform":    "go",
		"level":       string(level),
		"sdk":         map[string]any{"name": sdkName, "version": sdkVersion},
		"environment": c.environment,
		"release":     c.release,
		"server_name": c.serverName,
		"message":     message,
		"exception": map[string]any{
			"values": []map[string]any{
				{
					"type":  classify(err),
					"value": errValue,
				},
			},
		},
		"contexts":    contexts,
		"tags":        tags,
		"extra":       redactMap(extras, c.redact),
		"breadcrumbs": map[string]any{"values": c.snapshotCrumbs()},
	}
	if user != nil {
		event["user"] = user
	}
	return event
}

// DefaultRedactKeys is the set of extras / breadcrumb-data keys whose values
// are replaced with "[REDACTED]" before send.
var DefaultRedactKeys = []string{
	"api_key", "apikey",
	"authorization", "auth",
	"cookie", "set-cookie",
	"password", "passwd", "pwd",
	"posthog_key",
	"secret",
	"token", "access_token", "refresh_token",
}

func redactMap(in map[string]any, redact map[string]struct{}) map[string]any {
	return redactMapDepth(in, redact, 0)
}

func redactMapDepth(in map[string]any, redact map[string]struct{}, depth int) map[string]any {
	if len(in) == 0 || depth > 4 {
		return in
	}
	out := make(map[string]any, len(in))
	for k, v := range in {
		if _, ok := redact[strings.ToLower(k)]; ok {
			out[k] = "[REDACTED]"
			continue
		}
		switch nested := v.(type) {
		case map[string]any:
			out[k] = redactMapDepth(nested, redact, depth+1)
		case map[string]string:
			m := make(map[string]any, len(nested))
			for kk, vv := range nested {
				m[kk] = vv
			}
			out[k] = redactMapDepth(m, redact, depth+1)
		case map[string][]string:
			m := make(map[string]any, len(nested))
			for kk, vv := range nested {
				m[kk] = vv
			}
			out[k] = redactMapDepth(m, redact, depth+1)
		case http.Header:
			m := make(map[string]any, len(nested))
			for kk, vv := range nested {
				m[kk] = vv
			}
			out[k] = redactMapDepth(m, redact, depth+1)
		case url.Values:
			m := make(map[string]any, len(nested))
			for kk, vv := range nested {
				m[kk] = vv
			}
			out[k] = redactMapDepth(m, redact, depth+1)
		default:
			out[k] = v
		}
	}
	return out
}

const maxMessageLen = 1024

var secretPatterns = regexp.MustCompile(`(?i)(Bearer\s+\S+|Basic\s+\S+|token[=:]\S+|api_key[=:]\S+|password[=:]\S+|https?://[^@\s]+@)`)

func redactString(s string) string {
	s = secretPatterns.ReplaceAllString(s, "[REDACTED]")
	if len(s) > maxMessageLen {
		s = s[:maxMessageLen] + "...(truncated)"
	}
	return s
}

func classify(err error) string {
	if err == nil {
		return ""
	}
	t := fmt.Sprintf("%T", err)
	// Strip pointer / package noise so the Sentry "type" column groups well.
	t = strings.TrimPrefix(t, "*")
	if i := strings.LastIndex(t, "."); i >= 0 {
		return t[i+1:]
	}
	return t
}

func newEventID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return strings.ReplaceAll(time.Now().UTC().Format("20060102150405.000000000"), ".", "")
	}
	return hex.EncodeToString(b[:])
}

// parsedDSN holds the structured pieces of a Sentry DSN.
type parsedDSN struct {
	publicKey string
	host      string
	scheme    string
	path      string
	projectID string
}

func parseDSN(raw string) (parsedDSN, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return parsedDSN{}, err
	}
	if u.Scheme == "" || u.Host == "" || u.User == nil {
		return parsedDSN{}, errors.New("errortrack: DSN must include scheme, host and public key")
	}
	if strings.TrimSpace(u.User.Username()) == "" {
		return parsedDSN{}, errors.New("errortrack: DSN missing public key")
	}
	pid := strings.Trim(u.Path, "/")
	if pid == "" {
		return parsedDSN{}, errors.New("errortrack: DSN missing project id")
	}
	parts := strings.Split(pid, "/")
	pid = parts[len(parts)-1]
	prefix := ""
	if len(parts) > 1 {
		prefix = strings.Join(parts[:len(parts)-1], "/")
	}
	return parsedDSN{
		publicKey: u.User.Username(),
		host:      u.Host,
		scheme:    u.Scheme,
		path:      prefix,
		projectID: pid,
	}, nil
}

func (d parsedDSN) storeEndpoint() string {
	base := d.scheme + "://" + d.host
	if d.path != "" {
		base += "/" + strings.Trim(d.path, "/")
	}
	return base + "/api/" + d.projectID + "/store/"
}

func (d parsedDSN) authHeader(now time.Time) string {
	return fmt.Sprintf(
		"Sentry sentry_version=7, sentry_timestamp=%d, sentry_client=%s/%s, sentry_key=%s",
		now.Unix(), sdkName, sdkVersion, d.publicKey,
	)
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func getenv(name string) string {
	return strings.TrimSpace(osGetenv(name))
}

// osGetenv is split out so tests can avoid a hard runtime dep on os.Setenv at
// package init; it just calls os.Getenv at runtime.
var osGetenv = func(name string) string { return defaultGetenv(name) }

func isTruthyEnv(name string) bool {
	switch strings.ToLower(strings.TrimSpace(osGetenv(name))) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}
