package main

import (
	"encoding/json"
	"flag"
	"fmt"

	"chrome-native-host/internal/cliclient"
)

func cmdStatus(argv []string) error {
	fs := flag.NewFlagSet("status", flag.ContinueOnError)
	if err := fs.Parse(argv); err != nil {
		return err
	}

	status, err := cliclient.Health(clientOpts())
	if gflags.JSON {
		envelope := map[string]any{
			"ok":     err == nil,
			"status": status,
		}
		if err != nil {
			envelope["error"] = err.Error()
		}
		b, marshalErr := json.Marshal(envelope)
		if marshalErr != nil {
			return marshalErr
		}
		fmt.Println(string(b))
		return err
	}

	if err != nil {
		return err
	}

	fmt.Println("native-host status")
	printStatusLine("socket", status["socketPath"])
	printStatusLine("pid", status["pid"])
	printStatusLine("ok", status["ok"])
	printStatusLine("chromeReady", status["chromeReady"])
	printStatusLine("mcpConnected", status["mcpConnected"])
	printStatusLine("udsConnections", status["udsConnections"])
	printStatusLine("authenticatedUdsConnections", status["authenticatedUdsConnections"])
	printStatusLine("startedAt", status["startedAt"])
	printStatusLine("lastChromeMessageAt", status["lastChromeMessageAt"])
	printStatusLine("lastChromeError", status["lastChromeError"])
	return nil
}

func printStatusLine(label string, value any) {
	if value == nil || value == "" {
		return
	}
	fmt.Printf("  %-20s %v\n", label+":", value)
}
