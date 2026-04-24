package main

// Tiny HTTP server that serves testdata/cli_test.html plus a /api/ping
// endpoint, so the SuperDuck CLI smoke test can verify the network command.
//
// Usage:
//   go run ./testdata/server [-addr :8765]
// or
//   make test-server  (if a target is added)

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"runtime"
	"time"
)

func main() {
	addr := flag.String("addr", ":8765", "listen address")
	flag.Parse()

	_, file, _, _ := runtime.Caller(0)
	dir := filepath.Dir(file)
	htmlPath := filepath.Join(dir, "..", "cli_test.html")

	mux := http.NewServeMux()
	mux.HandleFunc("/api/ping", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"pong":true,"ts":%d,"q":%q}`, time.Now().UnixMilli(), r.URL.RawQuery)
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			http.ServeFile(w, r, htmlPath)
			return
		}
		http.NotFound(w, r)
	})

	log.Printf("serving %s on http://localhost%s", htmlPath, *addr)
	if err := http.ListenAndServe(*addr, mux); err != nil {
		log.Fatal(err)
	}
}
