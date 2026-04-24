#!/usr/bin/env bash
# Manual repro — raw superduck CLI calls that failed in visual_test.sh.
# Run line-by-line. Replace $TAB with your tab id first.

# ensure MCP tab group, then create a fresh tab and grab its tabId
./superduck tab_group list --create-if-empty
./superduck tab_group new           # copy "Tab ID: <n>" from the output

export TAB=1339682770     # <-- paste the tabId from above
./superduck --tab $TAB navigate http://localhost:8765/

./superduck --tab $TAB screenshot --output /tmp/sd_repro/initial.jpg

./superduck --tab $TAB left_click 78 155
./superduck --tab $TAB right_click 235 155
./superduck --tab $TAB double_click 380 155
./superduck --tab $TAB triple_click 545 155

./superduck --tab $TAB hover 80 335

./superduck --tab $TAB left_click 200 430
./superduck --tab $TAB type "hello superduck"

./superduck --tab $TAB left_click_drag 95 855 240 855

./superduck --tab $TAB left_click 260 500   # fetch button
./superduck --tab $TAB left_click 105 500   # log button
./superduck --tab $TAB left_click 165 500   # err button

./superduck --tab $TAB screenshot --output /tmp/sd_repro/final.jpg
