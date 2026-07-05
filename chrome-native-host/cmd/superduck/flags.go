package main

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// splitGlobalFlags pulls global flags out of argv regardless of position, so
// subcommands can use stdlib flag for the rest.
func splitGlobalFlags(in []string) []string {
	out := make([]string, 0, len(in))
	i := 0
	for i < len(in) {
		a := in[i]
		switch {
		case a == "--json":
			gflags.JSON = true
			i++
		case a == "--tab":
			value := requireGlobalFlagValue(in, i, a)
			n, err := strconv.Atoi(value)
			if err != nil {
				fatalUsage("invalid --tab: %v", err)
			}
			if n <= 0 {
				fatalUsage("invalid --tab: must be positive")
			}
			gflags.Tab = n
			i += 2
		case a == "--session" || a == "--session-id":
			gflags.SessionID = requireGlobalFlagValue(in, i, a)
			i += 2
		case strings.HasPrefix(a, "--session="):
			gflags.SessionID = requireGlobalFlagInlineValue(a, "--session")
			i++
		case strings.HasPrefix(a, "--session-id="):
			gflags.SessionID = requireGlobalFlagInlineValue(a, "--session-id")
			i++
		case a == "--socket":
			gflags.SocketPath = requireGlobalFlagValue(in, i, a)
			i += 2
		case a == "--timeout":
			value := requireGlobalFlagValue(in, i, a)
			s, err := strconv.Atoi(value)
			if err != nil {
				fatalUsage("invalid --timeout: %v", err)
			}
			if s <= 0 {
				fatalUsage("invalid --timeout: must be positive")
			}
			gflags.Timeout = time.Duration(s) * time.Second
			gflags.TimeoutSet = true
			i += 2
		default:
			out = append(out, a)
			i++
		}
	}
	return out
}

func requireGlobalFlagValue(in []string, index int, flag string) string {
	if index+1 >= len(in) || strings.TrimSpace(in[index+1]) == "" || strings.HasPrefix(in[index+1], "--") {
		fatalUsage("missing value for %s", flag)
	}
	return in[index+1]
}

func requireGlobalFlagInlineValue(arg string, flag string) string {
	prefix := flag + "="
	if !strings.HasPrefix(arg, prefix) {
		fatalUsage("missing value for %s", flag)
	}
	value := strings.TrimSpace(strings.TrimPrefix(arg, prefix))
	if value == "" {
		fatalUsage("missing value for %s", flag)
	}
	return value
}

func fatalUsage(format string, args ...any) {
	fmt.Fprintln(os.Stderr, "error:", fmt.Sprintf(format, args...))
	os.Exit(ExitUsage)
}

// reorderFlagsFirst lets the stdlib flag package see flags that come after
// positional arguments. Bool flags (--allow-cross-origin) and value flags
// (-X POST, -H "K:V") are both handled.
var knownValueFlags = map[string]bool{
	"-X": true, "--method": true,
	"-H": true, "--header": true,
	"-d": true, "--data": true,
	"--selector": true, "--text": true,
	"--modifiers": true, "--ref": true,
	"--direction": true, "--amount": true,
	"--repeat":  true,
	"--output":  true,
	"--file":    true,
	"--pattern": true, "--limit": true,
	"--url-pattern": true, "--filter": true,
	"--depth":     true,
	"--max-chars": true,
	"--value":     true,
	"--image-id":  true, "--filename": true,
	"--coord": true, "--command": true, "--id": true,
	"--quality": true,
	"--path":    true, "--paths": true,
}

func reorderFlagsFirst(in []string) []string {
	flags := []string{}
	pos := []string{}
	i := 0
	for i < len(in) {
		a := in[i]
		switch {
		case a == "--":
			// Preserve "--" to stop flag.Parse from interpreting
			// subsequent args (e.g. "--help") as flags.
			result := append(flags, "--")
			result = append(result, in[i+1:]...)
			return result
		case len(a) > 1 && a[0] == '-':
			flags = append(flags, a)
			if knownValueFlags[a] && i+1 < len(in) {
				flags = append(flags, in[i+1])
				i += 2
				continue
			}
			i++
		default:
			pos = append(pos, a)
			i++
		}
	}
	return append(flags, pos...)
}
