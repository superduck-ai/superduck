package errortrack

import "os"

func defaultGetenv(name string) string { return os.Getenv(name) }
