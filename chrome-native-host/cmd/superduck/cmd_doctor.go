package main

import (
	"context"
	"flag"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"chrome-native-host/internal/cliclient"
)

func cmdDoctor(argv []string) error {
	fs := flag.NewFlagSet("doctor", flag.ContinueOnError)
	if err := fs.Parse(argv); err != nil {
		return err
	}

	ok := true
	var failedChecks []string
	check := func(name string, pass bool, hint string) {
		if pass {
			fmt.Printf("✓ %s\n", name)
		} else {
			fmt.Printf("✗ %s\n", name)
			if hint != "" {
				fmt.Printf("    → %s\n", hint)
			}
			ok = false
			failedChecks = append(failedChecks, name)
		}
	}

	// 1. 我自己在哪
	exe, err := os.Executable()
	check("CLI binary located", err == nil, "")
	if err == nil {
		fmt.Printf("    %s\n", exe)
	}

	// 2. native messaging manifest 文件存在
	if home, err := os.UserHomeDir(); err == nil {
		var mp string
		switch runtime.GOOS {
		case "darwin":
			mp = filepath.Join(home, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts", nativeHostName+".json")
		case "linux":
			mp = filepath.Join(home, ".config", "google-chrome", "NativeMessagingHosts", nativeHostName+".json")
		}
		if mp != "" {
			_, statErr := os.Stat(mp)
			check("Chrome native messaging manifest", statErr == nil, "run `superduck setup`")
			if statErr == nil {
				fmt.Printf("    %s\n", mp)
			}
		}
	}

	// 3. UDS 可连
	conn, dialErr := net.DialTimeout("unix", gflags.SocketPath, 2*time.Second)
	connOK := dialErr == nil
	if conn != nil {
		conn.Close()
	}
	check("native-host UDS reachable", connOK, "make sure Chrome is running with the SuperDuck extension loaded")

	// 4. 扩展存活: 调一次 list_tabs
	if connOK {
		_, callErr := cliclient.CallString("superduck_list_tabs", nil, clientOpts())
		check("extension responds (superduck_list_tabs)", callErr == nil, errString(callErr))
	}

	// 5. audit dir
	ad, _ := cliclient.AuditDir()
	_, statErr := os.Stat(ad)
	check("audit dir present", statErr == nil, fmt.Sprintf("will be created on first command at %s", ad))

	if !ok {
		tracker.Capture("cli.doctor.completed", map[string]any{
			"all_passed":    false,
			"checks_failed": failedChecks,
		})
		flushCtx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
		tracker.Flush(flushCtx)
		cancel()
		fmt.Println()
		fmt.Println("doctor: some checks failed")
		os.Exit(1)
	}
	tracker.Capture("cli.doctor.completed", map[string]any{
		"all_passed": true,
	})
	fmt.Println()
	fmt.Println("doctor: all checks passed")
	return nil
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
