package main

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

// splitGlobalFlags pulls --json/--tab/--socket/--timeout out of argv
// regardless of position, so subcommands can use stdlib flag for the rest.
func splitGlobalFlags(in []string) []string {
	out := make([]string, 0, len(in))
	i := 0
	for i < len(in) {
		a := in[i]
		switch {
		case a == "--json":
			gflags.JSON = true
			i++
		case a == "--tab" && i+1 < len(in):
			n, err := strconv.Atoi(in[i+1])
			if err != nil {
				fatalUsage("invalid --tab: %v", err)
			}
			gflags.Tab = n
			i += 2
		case a == "--socket" && i+1 < len(in):
			gflags.SocketPath = in[i+1]
			i += 2
		case a == "--timeout" && i+1 < len(in):
			s, err := strconv.Atoi(in[i+1])
			if err != nil {
				fatalUsage("invalid --timeout: %v", err)
			}
			gflags.Timeout = time.Duration(s) * time.Second
			i += 2
		default:
			out = append(out, a)
			i++
		}
	}
	return out
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
	"--repeat": true,
	"--output": true,
	"--file":   true,
	"--pattern": true, "--limit": true,
	"--url-pattern": true, "--filter": true,
	"--depth":     true,
	"--max-chars": true,
	"--value":     true,
	"--image-id":  true, "--filename": true,
	"--coord": true, "--command": true, "--id": true,
	"--quality": true,
}

func reorderFlagsFirst(in []string) []string {
	flags := []string{}
	pos := []string{}
	i := 0
	for i < len(in) {
		a := in[i]
		switch {
		case a == "--":
			pos = append(pos, in[i+1:]...)
			return append(flags, pos...)
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
