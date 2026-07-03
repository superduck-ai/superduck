#!/usr/bin/env bash
# Run golangci-lint on the chrome-native-host module when staged Go files change.
set -e
cd "$(dirname "$0")/../chrome-native-host"
golangci-lint run --timeout=5m
