package selfupdate

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

const CheckInterval = 24 * time.Hour

type CheckResult struct {
	Latest    string    `json:"latest"`
	CheckedAt time.Time `json:"checked_at"`
}

func cacheFilePath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".superduck", "update-check"), nil
}

func readCache() (CheckResult, error) {
	path, err := cacheFilePath()
	if err != nil {
		return CheckResult{}, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return CheckResult{}, err
	}
	var r CheckResult
	if err := json.Unmarshal(data, &r); err != nil {
		return CheckResult{}, err
	}
	return r, nil
}

func WriteCache(r CheckResult) error {
	path, err := cacheFilePath()
	if err != nil {
		return err
	}
	data, err := json.Marshal(r)
	if err != nil {
		return err
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, append(data, '\n'), 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func WriteCacheNow(latest string) {
	_ = WriteCache(CheckResult{Latest: latest, CheckedAt: time.Now()})
}

func needsRemoteCheck(cached CheckResult) bool {
	if cached.Latest == "" || cached.CheckedAt.IsZero() {
		return true
	}
	return time.Since(cached.CheckedAt) > CheckInterval
}

func BackgroundCheck() <-chan CheckResult {
	ch := make(chan CheckResult, 1)
	go func() {
		cached, _ := readCache()
		if !needsRemoteCheck(cached) {
			ch <- cached
			return
		}
		latest, err := LatestVersion()
		if err != nil {
			ch <- cached
			return
		}
		result := CheckResult{Latest: latest, CheckedAt: time.Now()}
		_ = WriteCache(result)
		ch <- result
	}()
	return ch
}

func UpdateHint(current, latest string) string {
	cur, err := parseSemver(current)
	if err != nil {
		return ""
	}
	lat, err := parseSemver(latest)
	if err != nil {
		return ""
	}
	if cur.Compare(lat) >= 0 {
		return ""
	}
	return fmt.Sprintf("superduck %s is available (current: %s). Run `superduck update` to upgrade.", latest, current)
}
