.PHONY: all clean native-host mcp-server superduck install test test-race test-coverage test-perf lint lint-install release-binaries

# Pinned linter version. Bump deliberately and re-run `make lint`.
GOLANGCI_LINT_VERSION ?= v2.6.0

# Build output directory
BUILD_DIR := build

# Product analytics (PostHog). When POSTHOG_KEY is set in the environment, the
# write-only project token is compiled into the binary so end-user installs
# emit telemetry by default. Leave POSTHOG_KEY unset for local development —
# the analytics package then no-ops unless SUPERDUCK_POSTHOG_KEY is exported.
#
# Never check the key into git. Keep it in your shell rc, a gitignored
# `.env.local`, or a CI secret (e.g. GitHub Actions secret POSTHOG_KEY).
POSTHOG_KEY ?=

# VERSION is injected into the binary via -ldflags. For release builds it comes
# from the git tag (e.g. make release-binaries VERSION=0.2.5). For local builds
# it reads the default value compiled into main.go.
VERSION ?=

ANALYTICS_LDFLAGS := $(if $(POSTHOG_KEY),-X chrome-native-host/internal/analytics.PostHogWriteKey=$(POSTHOG_KEY),)
VERSION_LDFLAGS := $(if $(VERSION),-X main.version=$(VERSION) -X chrome-native-host/internal/analytics.LibVersion=$(VERSION),)
GO_LDFLAGS := $(strip $(ANALYTICS_LDFLAGS) $(VERSION_LDFLAGS))
GO_BUILD_FLAGS := $(if $(strip $(GO_LDFLAGS)),-ldflags "$(GO_LDFLAGS)",)

all: native-host mcp-server superduck

native-host:
	@echo "Building native-host..."
	@mkdir -p $(BUILD_DIR)
	go build -o $(BUILD_DIR)/chrome-native-host ./cmd/native-host

mcp-server:
	@echo "Building mcp-server..."
	@mkdir -p $(BUILD_DIR)
	go build -o $(BUILD_DIR)/chrome-mcp-server ./cmd/mcp-server

superduck:
	@echo "Building superduck CLI..."
	@mkdir -p $(BUILD_DIR)
	go build $(GO_BUILD_FLAGS) -o $(BUILD_DIR)/superduck ./cmd/superduck

# Cross-compile both binaries (superduck CLI + chrome-native-host companion)
# into the npm sub-packages. Users install via `npm install -g superduck-cli`
# and `superduck init` reads chrome-native-host from the same bin dir.
release-binaries:
	@echo "Cross-building superduck + chrome-native-host for all platforms..."
	GOOS=darwin  GOARCH=arm64 go build $(GO_BUILD_FLAGS) -o ../npm/packages/superduck-darwin-arm64/bin/superduck ./cmd/superduck
	GOOS=darwin  GOARCH=arm64 go build                  -o ../npm/packages/superduck-darwin-arm64/bin/chrome-native-host ./cmd/native-host
	GOOS=darwin  GOARCH=amd64 go build $(GO_BUILD_FLAGS) -o ../npm/packages/superduck-darwin-x64/bin/superduck ./cmd/superduck
	GOOS=darwin  GOARCH=amd64 go build                  -o ../npm/packages/superduck-darwin-x64/bin/chrome-native-host ./cmd/native-host
	GOOS=linux   GOARCH=arm64 go build $(GO_BUILD_FLAGS) -o ../npm/packages/superduck-linux-arm64/bin/superduck ./cmd/superduck
	GOOS=linux   GOARCH=arm64 go build                  -o ../npm/packages/superduck-linux-arm64/bin/chrome-native-host ./cmd/native-host
	GOOS=linux   GOARCH=amd64 go build $(GO_BUILD_FLAGS) -o ../npm/packages/superduck-linux-x64/bin/superduck ./cmd/superduck
	GOOS=linux   GOARCH=amd64 go build                  -o ../npm/packages/superduck-linux-x64/bin/chrome-native-host ./cmd/native-host
	@echo "Done. Binaries placed in npm/packages/*/bin/"

clean:
	@echo "Cleaning build artifacts..."
	rm -rf $(BUILD_DIR)
	rm -f chrome-native-host chrome-mcp-server

install: all
	@echo "Installing binaries..."
	@mkdir -p ~/bin
	cp $(BUILD_DIR)/chrome-native-host ~/bin/
	cp $(BUILD_DIR)/chrome-mcp-server ~/bin/
	@echo "Done. Add ~/bin to your PATH if not already added."

test:
	@echo "Running tests..."
	go test -parallel=4 ./...

# Race-enabled tests live in a separate target because `-race` requires CGO and
# a working C toolchain (gcc/clang). Default `make test` stays portable; CI and
# anyone with a full toolchain can opt into stricter concurrency checking via
# `make test-race`.
test-race:
	@echo "Running tests with race detector (requires CGO + C toolchain)..."
	CGO_ENABLED=1 go test -race -parallel=4 ./...

# Test-performance tracking. Emits per-test timings (-v) and a machine-readable
# JSON event stream (test-results.json) that CI can publish as an artifact and
# downstream tooling (BuildPulse, Datadog CI Visibility, custom dashboards) can
# ingest to chart suite duration over time. SLOW_TEST_MS (default 500ms) flags
# any individual test that exceeds the threshold so regressions are caught
# early instead of being buried in averages.
SLOW_TEST_MS ?= 500

test-perf:
	@echo "Running tests with timing instrumentation (slow threshold $(SLOW_TEST_MS)ms)..."
	@go test -v -count=1 -json ./... | tee test-results.json >/dev/null
	@echo ""
	@echo "Slow tests (>= $(SLOW_TEST_MS)ms):"
	@awk -v slow=$(SLOW_TEST_MS) ' \
		/"Action":"pass"/ && /"Test":/ && /"Elapsed":/ { \
			match($$0, /"Test":"[^"]+"/); test=substr($$0, RSTART+8, RLENGTH-9); \
			match($$0, /"Package":"[^"]+"/); pkg=substr($$0, RSTART+11, RLENGTH-12); \
			match($$0, /"Elapsed":[0-9.]+/); elapsed=substr($$0, RSTART+10, RLENGTH-10)+0; \
			ms = elapsed * 1000; \
			if (ms >= slow) printf "  %6.0fms  %s.%s\n", ms, pkg, test; \
		} \
	' test-results.json | sort -nr || true
	@echo ""
	@echo "Top 10 slowest tests overall:"
	@awk ' \
		/"Action":"pass"/ && /"Test":/ && /"Elapsed":/ { \
			match($$0, /"Test":"[^"]+"/); test=substr($$0, RSTART+8, RLENGTH-9); \
			match($$0, /"Package":"[^"]+"/); pkg=substr($$0, RSTART+11, RLENGTH-12); \
			match($$0, /"Elapsed":[0-9.]+/); elapsed=substr($$0, RSTART+10, RLENGTH-10)+0; \
			printf "%.6f\t%s.%s\n", elapsed, pkg, test; \
		} \
	' test-results.json | sort -nr | head -10 | awk '{ printf "  %7.3fs  %s\n", $$1, $$2 }'

# Coverage gate. Only the packages that actually have unit tests are
# included; cmd/* and pure I/O packages are skipped because they require
# Chrome / native messaging at the other end. Adjust MIN_COVERAGE deliberately
# (and add tests) when raising the bar.
COVERAGE_PACKAGES ?= ./cmd/mcp-server/... ./internal/converter/...
MIN_COVERAGE ?= 40

test-coverage:
	@echo "Running tests with coverage gate (>= $(MIN_COVERAGE)%) on $(COVERAGE_PACKAGES)..."
	@go test -covermode=atomic -coverprofile=coverage.out $(COVERAGE_PACKAGES)
	@go tool cover -func=coverage.out | tail -1
	@total=$$(go tool cover -func=coverage.out | awk '/^total:/ {gsub("%","",$$3); print $$3}'); \
		awk -v t="$$total" -v m="$(MIN_COVERAGE)" 'BEGIN{ if (t+0 < m+0) { printf "FAIL: coverage %.1f%% < %s%%\n", t, m; exit 1 } else { printf "OK: coverage %.1f%% >= %s%%\n", t, m } }'

# Install golangci-lint at the pinned version into $GOPATH/bin (or $HOME/go/bin).
lint-install:
	@echo "Installing golangci-lint $(GOLANGCI_LINT_VERSION)..."
	GOBIN=$${GOBIN:-$$HOME/go/bin} go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@$(GOLANGCI_LINT_VERSION)

# Run the Go linter. Uses an installed golangci-lint if present on PATH,
# otherwise falls back to $HOME/go/bin/golangci-lint (where lint-install puts it).
lint:
	@echo "Running golangci-lint..."
	@if command -v golangci-lint >/dev/null 2>&1; then \
		golangci-lint run ./...; \
	elif [ -x "$$HOME/go/bin/golangci-lint" ]; then \
		"$$HOME/go/bin/golangci-lint" run ./...; \
	else \
		echo "golangci-lint not found. Run 'make lint-install' first."; \
		exit 1; \
	fi

# Development helpers
dev-native-host: native-host
	@echo "Starting native-host in development mode..."
	$(BUILD_DIR)/chrome-native-host --uds

dev-mcp-server: mcp-server
	@echo "Starting mcp-server in development mode..."
	$(BUILD_DIR)/chrome-mcp-server

# Show project structure
tree:
	@tree -I '.git|.idea|build' -L 3
