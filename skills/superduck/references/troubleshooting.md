# Troubleshooting SuperDuck

Common issues and their solutions.

## Socket Connection Issues

### Error: "Socket connection failed (exit code 2)"

**Cause**: The SuperDuck native host is not running or the socket file doesn't exist.

**Solutions**:

1. Check if the native host is running:
   ```bash
   SKILL_DIR="${CODEX_HOME:-$HOME/.codex}/skills/superduck"
   node "$SKILL_DIR/scripts/check-superduck-status.mjs"
   ```

2. Verify the socket file exists:
   ```bash
   ls -la /tmp/chrome-native-host.sock
   ```

3. Try running `superduck doctor` for diagnostics:
   ```bash
   superduck doctor
   ```

4. Restart the browser with the SuperDuck extension installed

## Command Timeout Issues

### Error: "Command timeout (exit code 4)"

**Cause**: The command took longer than the default timeout.

**Solutions**:

1. Increase timeout:
   ```bash
   superduck --timeout 60 --tab $TAB navigate https://slow-site.com
   ```

2. For navigation, verify the page loaded with `context` instead of using `wait`:
   ```bash
   superduck --tab $TAB navigate https://example.com
   superduck --tab $TAB context  # Verify loaded
   ```

## Tab Not Found

### Error: "Invalid tab ID"

**Cause**: The tab ID is invalid or the tab was closed.

**Solutions**:

1. List current tabs:
   ```bash
   superduck tabs
   ```

2. Create a fresh tab:
   ```bash
   TAB=$(superduck tab_group new | grep -o 'Tab ID: [0-9]*' | grep -o '[0-9]*')
   ```

3. Use existing tab group:
   ```bash
   superduck tab_group list --create-if-empty
   ```

## Wait Command Issues

### Error: long wait, timeout, or unexpected wait duration

**Cause**: `wait` uses seconds, not milliseconds. `wait 2000` means 2000 seconds.

**Workaround**: Use `sleep` or `context` instead:

```bash
# Instead of: superduck --tab $TAB wait 2000
sleep 2

# Or use seconds explicitly:
superduck --tab $TAB wait 2

# Or verify page load:
superduck --tab $TAB context
```

## GIF Recording Not Working

### Problem: GIF commands capture 0 frames

**Cause**: GIF recording requires `--tab` and may capture 0 frames for actions
performed entirely through CLI commands.

**Solution**: Use screenshots + ffmpeg:

```bash
# Take screenshots
superduck --tab $TAB screenshot --output /tmp/step1.jpg
# ... perform actions ...
superduck --tab $TAB screenshot --output /tmp/step2.jpg

# Convert to GIF
ffmpeg -framerate 1 -i /tmp/step%d.jpg output.gif
```

## Binary Not Found

### Error: "command not found: superduck"

**Cause**: SuperDuck CLI is not installed or not in PATH.

**Solutions**:

1. Check installation:
   ```bash
   which superduck
   ```

2. Install or add to PATH:
   ```bash
   # If installed but not in PATH
   export PATH="/usr/local/bin:$PATH"
   ```

3. Verify version:
   ```bash
   superduck version
   ```

## Screenshot Output Issues

### Problem: Screenshot saved with unexpected filename

**Behavior**: A directory output auto-generates a filename. A file output uses
the requested basename but may be extension-aligned to the real image type.

**Solution**: Use an explicit file path when you need a stable name, then read
the command output to confirm the final path:

```bash
# Auto-name under a directory
superduck --tab $TAB screenshot --output /tmp/
# Creates: /tmp/[uuid].jpg

# Stable basename; may become /tmp/my-screenshot.jpg if JPEG is returned
superduck --tab $TAB screenshot --output /tmp/my-screenshot.jpg
```

## JavaScript Execution Errors

### Error: Exec command fails or returns unexpected output

**Common Issues**:

1. **Quote escaping**: Use single quotes around JavaScript:
   ```bash
   superduck --tab $TAB exec 'document.title'
   ```

2. **Complex scripts**: Use heredoc or separate file:
   ```bash
   superduck --tab $TAB exec "$(cat script.js)"
   ```

3. **Return values**: Make sure the script returns a value, and strip the
   trailing `Tab Context` if parsing stdout:
   ```bash
   # Bad: console.log(data)
   # Good: JSON.stringify(data)
   ```

## Permission Denied

### Error: Permission denied when running scripts

**Solution**: Make scripts executable:

```bash
SKILL_DIR="${CODEX_HOME:-$HOME/.codex}/skills/superduck"
chmod +x "$SKILL_DIR"/scripts/*.mjs
chmod +x "$SKILL_DIR"/templates/*.sh
```

## Extension Not Loaded

### Problem: Browser doesn't have SuperDuck extension

**Check**:

```bash
# Verify extension is installed
superduck doctor
```

**Solution**: Install the SuperDuck extension from Chrome Web Store or load it as unpacked extension.

## Debugging Tips

### Enable Verbose Mode

```bash
superduck -v --tab $TAB navigate https://example.com
```

### Check Logs

```bash
superduck log
```

### Test with Simple Commands

Start with basic commands to verify functionality:

```bash
# Test version
superduck version

# Test tab creation
superduck tab_group new

# Test simple navigation
superduck --tab $TAB navigate https://example.com
superduck --tab $TAB context
```

## Getting Help

If issues persist:

1. Run diagnostics:
   ```bash
   superduck doctor
   SKILL_DIR="${CODEX_HOME:-$HOME/.codex}/skills/superduck"
   node "$SKILL_DIR/scripts/check-superduck-status.mjs" --json
   ```

2. Check socket status:
   ```bash
   ls -la /tmp/chrome-native-host.sock
   ```

3. Verify browser has extension loaded

4. Restart browser and try again
