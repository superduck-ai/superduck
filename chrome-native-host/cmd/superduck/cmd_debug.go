package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"chrome-native-host/internal/cliclient"
	"chrome-native-host/internal/debugbundle"
)

func cmdDebug(argv []string) error {
	if len(argv) == 0 {
		return fmt.Errorf("usage: superduck debug <start|stop|status|collect|doctor>")
	}
	sub := argv[0]
	rest := argv[1:]
	switch sub {
	case "start":
		return cmdDebugStart(rest)
	case "stop":
		return cmdDebugStop(rest)
	case "status":
		return cmdDebugStatus(rest)
	case "collect":
		return cmdDebugCollect(rest)
	case "doctor":
		return cmdDebugDoctor(rest)
	case "enable":
		return cmdDebugEnable(rest)
	case "disable":
		return cmdDebugDisable(rest)
	default:
		return fmt.Errorf("unknown debug subcommand: %s", sub)
	}
}

func cmdDebugEnable(_ []string) error {
	out, err := cliclient.CallString("superduck_debug_enable", nil, clientOpts())
	if err != nil {
		return err
	}
	fmt.Println(out)
	return nil
}

func cmdDebugDisable(_ []string) error {
	out, err := cliclient.CallString("superduck_debug_disable", nil, clientOpts())
	if err != nil {
		return err
	}
	fmt.Println(out)
	return nil
}

func cmdDebugStart(_ []string) error {
	out, err := cliclient.CallString("superduck_debug_start", nil, clientOpts())
	if err != nil {
		return err
	}
	fmt.Println(out)
	return nil
}

func cmdDebugStop(_ []string) error {
	out, err := cliclient.CallString("superduck_debug_stop", nil, clientOpts())
	if err != nil {
		return err
	}
	fmt.Println(out)
	return nil
}

func cmdDebugStatus(argv []string) error {
	fs := flag.NewFlagSet("debug status", flag.ContinueOnError)
	jsonOut := fs.Bool("json", false, "output JSON")
	if err := fs.Parse(argv); err != nil {
		return err
	}
	out, err := cliclient.CallString("superduck_debug_status", nil, clientOpts())
	if err != nil {
		return err
	}
	if *jsonOut {
		fmt.Println(out)
		return nil
	}
	var status map[string]any
	if json.Unmarshal([]byte(out), &status) != nil {
		fmt.Println(out)
		return nil
	}
	fmt.Printf("enabled: %v\n", status["enabled"])
	fmt.Printf("ringBufferLength: %v\n", status["ringBufferLength"])
	fmt.Printf("persistedEventCount: %v\n", status["persistedEventCount"])
	if s, ok := status["session"].(map[string]any); ok {
		fmt.Printf("debugSessionId: %v\n", s["debugSessionId"])
		fmt.Printf("startedAt: %v\n", s["startedAt"])
		fmt.Printf("eventCount: %v\n", s["eventCount"])
	}
	return nil
}

func cmdDebugCollect(argv []string) error {
	fs := flag.NewFlagSet("debug collect", flag.ContinueOnError)
	outputDir := fs.String("output", "", "output directory (default ~/.superduck/debug)")
	if err := fs.Parse(argv); err != nil {
		return err
	}
	out, err := cliclient.CallString("superduck_debug_collect", nil, clientOpts())
	if err != nil {
		return err
	}
	bundle, err := debugbundle.ParseBundleJSON(out)
	if err != nil {
		return err
	}
	dir, err := debugbundle.WriteBundle(bundle, *outputDir)
	if err != nil {
		return err
	}
	fmt.Printf("Debug bundle written to %s\n", dir)
	fmt.Printf("Findings: %d | Events by domain: %d | Artifacts: %d\n",
		len(bundle.Diagnosis.Findings), len(bundle.EventsByDomain), len(bundle.Artifacts))
	preview := bundle.SummaryMarkdown
	if len(preview) > 600 {
		preview = preview[:600] + "..."
	}
	fmt.Printf("\n--- summary.agent.md ---\n%s\n", preview)
	return nil
}

func cmdDebugDoctor(argv []string) error {
	fs := flag.NewFlagSet("debug doctor", flag.ContinueOnError)
	jsonOut := fs.Bool("json", false, "output JSON")
	if err := fs.Parse(argv); err != nil {
		return err
	}
	report := buildDoctorReport()
	if *jsonOut {
		data, _ := json.MarshalIndent(report, "", "  ")
		fmt.Println(string(data))
	} else {
		debugbundle.PrintDoctor(report, os.Stdout)
	}
	if !report.OK {
		os.Exit(1)
	}
	return nil
}

func buildDoctorReport() *debugbundle.DoctorReport {
	report := &debugbundle.DoctorReport{OK: true}
	opts := clientOpts()

	// 1. native messaging manifest
	var foundBrowsers []string
	for _, p := range debugbundle.ManifestPaths(nativeHostName) {
		if _, err := os.Stat(p); err == nil {
			// derive browser name from path: .../<Browser>/NativeMessagingHosts
			foundBrowsers = append(foundBrowsers, filepath.Base(filepath.Dir(filepath.Dir(p))))
		}
	}
	manifestCheck := debugbundle.DoctorCheck{
		ID:       "native_manifest",
		Category: "install",
		Details:  map[string]any{},
	}
	if len(foundBrowsers) > 0 {
		manifestCheck.Status = "pass"
		manifestCheck.Message = fmt.Sprintf("Native messaging manifest found for %s", strings.Join(foundBrowsers, ", "))
	} else {
		manifestCheck.Status = "fail"
		manifestCheck.Message = "No native messaging manifest found"
		manifestCheck.Fix = "run `superduck setup`"
		report.OK = false
	}
	report.Checks = append(report.Checks, manifestCheck)

	// 2. UDS / native-host reachable
	healthOpts := opts
	if healthOpts.Timeout > 3*time.Second {
		healthOpts.Timeout = 3 * time.Second
	}
	_, healthErr := cliclient.Health(healthOpts)
	udsCheck := debugbundle.DoctorCheck{ID: "native_host_uds", Category: "connectivity"}
	if healthErr == nil {
		udsCheck.Status = "pass"
		udsCheck.Message = "native-host UDS reachable"
	} else {
		udsCheck.Status = "fail"
		udsCheck.Message = fmt.Sprintf("native-host UDS unreachable: %v", healthErr)
		udsCheck.Fix = "make sure your browser is running with the SuperDuck extension loaded"
		report.OK = false
	}
	report.Checks = append(report.Checks, udsCheck)

	// 3. debug status (extension responds + debug enabled state)
	statusCheck := debugbundle.DoctorCheck{
		ID:       "debug_status",
		Category: "runtime",
		Details:  map[string]any{},
	}
	statusOut, statusErr := cliclient.CallString("superduck_debug_status", nil, opts)
	if statusErr != nil {
		statusCheck.Status = "fail"
		statusCheck.Message = fmt.Sprintf("debug status call failed: %v", statusErr)
		report.OK = false
	} else {
		var status map[string]any
		if json.Unmarshal([]byte(statusOut), &status) == nil {
			enabled, _ := status["enabled"].(bool)
			statusCheck.Details["enabled"] = enabled
			if enabled {
				statusCheck.Status = "pass"
				statusCheck.Message = "debug evidence recording is ENABLED"
			} else {
				statusCheck.Status = "warn"
				statusCheck.Message = "debug evidence recording is disabled — run `superduck debug start` before reproducing"
			}
		} else {
			statusCheck.Status = "warn"
			statusCheck.Message = "could not parse debug status response"
		}
	}
	report.Checks = append(report.Checks, statusCheck)

	return report
}
