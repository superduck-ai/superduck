# SuperDuck CLI — visual regression review

You are reviewing screenshots produced by `testdata/visual_test.sh`. The
script drives the CLI through a fixed scenario against
`testdata/cli_test.html` and saves one screenshot per step into
`/tmp/sd_visual/step-NN-<name>.{jpg,png}`. The test page reports success
visually: each section has a Status line that turns into a green pill with
text like `got left-click ✓` once the corresponding event fires.

## Your task

For each step listed below:

1. Use the `Read` tool on the screenshot path. Inspect the image visually.
2. Decide PASS / FAIL based **only on what is visible in the image**. If the
   evidence is missing, mark FAIL — do not assume.
3. Output a markdown table with columns:
   `Step | File | Verdict | Evidence`.
4. After the table, list any FAILs with one-sentence root-cause guesses
   (e.g. "click missed the button", "page not loaded").

Be strict. Saying PASS without visible evidence wastes the next debugging
round. If a screenshot is missing entirely, that's a FAIL with reason
"screenshot not produced".

## Steps and expected evidence

| # | File suffix              | What you should see                                                                 |
|---|--------------------------|--------------------------------------------------------------------------------------|
| 01 | initial                  | Test page loaded; "superduck CLI test page" h1 visible; all sections rendered.       |
| 02 | after-left-click         | Section 1 Status reads "got left-click ✓" with green pill background.                |
| 03 | after-right-click        | Section 1 Status reads "got right-click ✓".                                          |
| 04 | after-double-click       | Section 1 Status reads "got double-click ✓".                                         |
| 05 | after-triple-click       | Section 1 Status reads "got triple-click, text selected ✓"; the gray sentence after the buttons is highlighted/selected. |
| 06 | after-hover              | Section 2 hover box has orange background AND the dark "you hovered!" tooltip is visible just below it. |
| 07 | after-type               | Section 3 input contains the literal text `hello superduck`; key/keydown indicator updated. |
| 08 | after-drag               | Section 4 drop box is green with text "DROPPED ✓" or "DROPPED (mouseup) ✓"; Status pill green. |
| 09 | after-scroll-down        | The yellow `you reached the bottom ✅` box is visible (page scrolled).               |
| 10 | after-scroll-up          | Page scrolled back to top — the h1 header and section 1 are visible again.          |
| 11 | after-network-fetch      | (No required visual change on the page, but the screenshot should still show our test page rendered, not a blank or chrome-extension page.) |
| 12 | after-console-capture    | Same — page should still be rendered normally.                                       |
| 13 | after-resize-narrow      | Layout reflowed to a noticeably narrower viewport (sections wrap differently / become single-column; window obviously skinnier than step 01). |
| 14 | after-navigate-baidu     | The Baidu home page (百度) is visible; its logo and search box clearly recognisable. |
| 15 | after-navigate-back      | Test page is visible again (we navigated back).                                      |
| 16 | after-navigate-forward   | Baidu visible again (navigated forward).                                             |
| 17 | final                    | Test page restored.                                                                  |

## Tips

- File extension is `.jpg` for default screenshots and `.png` for region zooms;
  `Read` the file path the script printed in `report.txt` if unsure. List
  files first with `ls /tmp/sd_visual/`.
- If multiple steps look identical, that itself is a FAIL — the page didn't
  react. Note which.
- If you see a chrome-extension or chrome:// URL instead of the test page,
  that's an environmental failure (extension state corruption); flag it
  rather than blaming the CLI.

## When done

Output the table and the FAIL summary. Do not edit any files. Do not run
the test script — you are only judging existing screenshots.
