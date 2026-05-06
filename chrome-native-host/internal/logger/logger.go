// Package logger wraps Go's standard library log/slog to give the
// chrome-native-host, the superduck CLI and the MCP server a single
// structured-logging entry point.
//
// Key features:
//   - JSON or text handler selectable via SUPERDUCK_LOG_FORMAT (text|json,
//     default text for TTY / json otherwise).
//   - Level configurable via SUPERDUCK_LOG_LEVEL (debug|info|warn|error).
//   - Default destination is stderr so logs do not collide with the native
//     messaging protocol on stdout.
//   - Sensitive keys are scrubbed automatically via a ReplaceAttr hook so
//     stray secrets in log fields do not leak to disk or downstream
//     collectors.
//
// All loggers built through New are safe for concurrent use.
package logger

import (
	"context"
	"io"
	"log/slog"
	"os"
	"strings"
	"sync"
)

// Format selects the slog handler to install.
type Format string

const (
	FormatText Format = "text"
	FormatJSON Format = "json"
)

// Options controls New. The zero value is valid; New picks sensible defaults
// from the SUPERDUCK_LOG_* environment variables.
type Options struct {
	// Writer receives the structured log lines. Defaults to os.Stderr so
	// stdout stays clean for native messaging frames.
	Writer io.Writer
	// Level overrides SUPERDUCK_LOG_LEVEL. If nil, the env var is consulted
	// and falls back to slog.LevelInfo.
	Level *slog.Level
	// Format overrides SUPERDUCK_LOG_FORMAT.
	Format Format
	// Component is added as a base attribute on every record.
	Component string
	// RedactKeys lists log attribute keys whose values should be replaced
	// with "[REDACTED]" before they reach the handler. nil uses the default
	// list.
	RedactKeys []string
}

// DefaultRedactKeys is the canonical set of attribute keys we always scrub.
// Callers can extend this list via Options.RedactKeys.
var DefaultRedactKeys = []string{
	"api_key",
	"apikey",
	"authorization",
	"cookie",
	"password",
	"posthog_key",
	"secret",
	"token",
}

const (
	envLevel  = "SUPERDUCK_LOG_LEVEL"
	envFormat = "SUPERDUCK_LOG_FORMAT"
)

// New constructs a *slog.Logger configured per opts and the environment.
func New(opts Options) *slog.Logger {
	w := opts.Writer
	if w == nil {
		w = os.Stderr
	}

	level := slog.LevelInfo
	if opts.Level != nil {
		level = *opts.Level
	} else if v := strings.ToLower(strings.TrimSpace(os.Getenv(envLevel))); v != "" {
		switch v {
		case "debug":
			level = slog.LevelDebug
		case "info":
			level = slog.LevelInfo
		case "warn", "warning":
			level = slog.LevelWarn
		case "error":
			level = slog.LevelError
		}
	}

	format := opts.Format
	if format == "" {
		format = Format(strings.ToLower(strings.TrimSpace(os.Getenv(envFormat))))
	}

	redact := opts.RedactKeys
	if redact == nil {
		redact = DefaultRedactKeys
	}
	redactSet := make(map[string]struct{}, len(redact))
	for _, k := range redact {
		redactSet[strings.ToLower(k)] = struct{}{}
	}

	handlerOpts := &slog.HandlerOptions{
		Level: level,
		ReplaceAttr: func(_ []string, a slog.Attr) slog.Attr {
			if _, ok := redactSet[strings.ToLower(a.Key)]; ok {
				return slog.String(a.Key, "[REDACTED]")
			}
			return a
		},
	}

	var h slog.Handler
	switch format {
	case FormatJSON:
		h = slog.NewJSONHandler(w, handlerOpts)
	default:
		h = slog.NewTextHandler(w, handlerOpts)
	}

	l := slog.New(h)
	if opts.Component != "" {
		l = l.With(slog.String("component", opts.Component))
	}
	return l
}

var (
	defaultOnce sync.Once
	defaultLog  *slog.Logger
)

// Default returns a process-wide structured logger lazily initialized from
// the environment. Most short-lived call sites should use this rather than
// constructing their own.
func Default() *slog.Logger {
	defaultOnce.Do(func() {
		defaultLog = New(Options{Component: "superduck"})
	})
	return defaultLog
}

// SetDefault swaps the process-wide logger (mostly for tests).
func SetDefault(l *slog.Logger) {
	defaultOnce.Do(func() {})
	defaultLog = l
}

// With attaches additional fields to the default logger.
func With(args ...any) *slog.Logger {
	return Default().With(args...)
}

// FromContext returns the logger stored on ctx, or Default if none is set.
// This lets request handlers carry per-request fields without threading the
// logger through every function signature.
type ctxKey struct{}

func FromContext(ctx context.Context) *slog.Logger {
	if ctx == nil {
		return Default()
	}
	if l, ok := ctx.Value(ctxKey{}).(*slog.Logger); ok && l != nil {
		return l
	}
	return Default()
}

// IntoContext returns a derived context that carries l so callees can pull it
// back out via FromContext.
func IntoContext(ctx context.Context, l *slog.Logger) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	return context.WithValue(ctx, ctxKey{}, l)
}
