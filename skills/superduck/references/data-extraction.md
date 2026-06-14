# Data Extraction Patterns

Common patterns for extracting data from web pages using SuperDuck.

Important: `superduck --tab "$TAB" exec ...` usually appends a human-readable
`Tab Context` section after the JavaScript result. Do not `JSON.parse` the full
stdout unless you first strip that trailing context. For parseable JSON files,
prefer `scripts/extract-data.mjs`.

## Basic Text Extraction

### Get Page Title and URL

```bash
superduck --tab $TAB exec "JSON.stringify({ title: document.title, url: window.location.href })"
```

### Extract All Text Content

```bash
superduck --tab $TAB page_text > output.txt
```

### Extract Specific Element Text

```bash
superduck --tab $TAB exec "document.querySelector('h1')?.textContent"
```

## Link Extraction

### All Links on Page

```bash
superduck --tab $TAB exec "
JSON.stringify(
  Array.from(document.querySelectorAll('a[href]')).map(a => ({
    text: a.textContent.trim(),
    href: a.href,
    target: a.target
  }))
)
"
```

### Links with Specific Pattern

```bash
# Extract only external links
superduck --tab $TAB exec "
JSON.stringify(
  Array.from(document.querySelectorAll('a[href]'))
    .filter(a => !a.href.startsWith(window.location.origin))
    .map(a => ({ text: a.textContent.trim(), href: a.href }))
)
"
```

## Table Data Extraction

### Simple Table

```bash
superduck --tab $TAB exec "
JSON.stringify(
  Array.from(document.querySelectorAll('table tr')).map(row =>
    Array.from(row.querySelectorAll('th, td')).map(cell => cell.textContent.trim())
  )
)
"
```

### Table with Headers

```bash
superduck --tab $TAB exec "
JSON.stringify({
  headers: Array.from(document.querySelectorAll('table thead th')).map(th => th.textContent.trim()),
  rows: Array.from(document.querySelectorAll('table tbody tr')).map(row =>
    Array.from(row.querySelectorAll('td')).map(cell => cell.textContent.trim())
  )
})
"
```

## List Extraction

### Ordered/Unordered Lists

```bash
superduck --tab $TAB exec "
JSON.stringify(
  Array.from(document.querySelectorAll('ul li, ol li')).map(li => li.textContent.trim())
)
"
```

### Nested Lists

```bash
superduck --tab $TAB exec "
function extractList(element) {
  return Array.from(element.children).map(li => ({
    text: li.firstChild?.textContent?.trim() || '',
    children: li.querySelector('ul, ol') ? extractList(li.querySelector('ul, ol')) : []
  }));
}
JSON.stringify(extractList(document.querySelector('ul')));
"
```

## Form Data Extraction

### Get All Form Fields

```bash
superduck --tab $TAB exec "
JSON.stringify(
  Array.from(document.querySelectorAll('input, textarea, select')).map(field => ({
    name: field.name,
    type: field.type,
    value: field.value,
    placeholder: field.placeholder,
    required: field.required
  }))
)
"
```

### Extract Form with Values

```bash
superduck --tab $TAB exec "
JSON.stringify({
  action: document.querySelector('form')?.action,
  method: document.querySelector('form')?.method,
  fields: Array.from(document.querySelectorAll('form input, form textarea, form select')).map(f => ({
    name: f.name,
    value: f.value,
    type: f.type
  }))
})
"
```

## Image Extraction

### All Images with Metadata

```bash
superduck --tab $TAB exec "
JSON.stringify(
  Array.from(document.images).map(img => ({
    src: img.src,
    alt: img.alt,
    width: img.naturalWidth,
    height: img.naturalHeight,
    title: img.title
  }))
)
"
```

### Images Larger Than Specific Size

```bash
superduck --tab $TAB exec "
JSON.stringify(
  Array.from(document.images)
    .filter(img => img.naturalWidth > 800 && img.naturalHeight > 600)
    .map(img => ({ src: img.src, width: img.naturalWidth, height: img.naturalHeight }))
)
"
```

## Meta Data Extraction

### Page Metadata

```bash
superduck --tab $TAB exec "
JSON.stringify({
  title: document.title,
  description: document.querySelector('meta[name=\"description\"]')?.content,
  keywords: document.querySelector('meta[name=\"keywords\"]')?.content,
  author: document.querySelector('meta[name=\"author\"]')?.content,
  ogTitle: document.querySelector('meta[property=\"og:title\"]')?.content,
  ogImage: document.querySelector('meta[property=\"og:image\"]')?.content
})
"
```

## Article/Blog Post Extraction

### Extract Article Content

```bash
superduck --tab $TAB exec "
JSON.stringify({
  title: document.querySelector('h1, .title, .post-title')?.textContent?.trim(),
  author: document.querySelector('.author, .byline, [rel=\"author\"]')?.textContent?.trim(),
  date: document.querySelector('time, .date, .published')?.textContent?.trim(),
  content: document.querySelector('article, .content, .post-content')?.textContent?.trim(),
  tags: Array.from(document.querySelectorAll('.tag, .category')).map(t => t.textContent.trim())
})
"
```

## E-commerce Data

### Product Information

```bash
superduck --tab $TAB exec "
JSON.stringify({
  name: document.querySelector('h1, .product-name')?.textContent?.trim(),
  price: document.querySelector('.price, .product-price')?.textContent?.trim(),
  description: document.querySelector('.description, .product-description')?.textContent?.trim(),
  images: Array.from(document.querySelectorAll('.product-image img')).map(img => img.src),
  inStock: document.querySelector('.in-stock, .availability')?.textContent?.trim(),
  rating: document.querySelector('.rating, .stars')?.textContent?.trim()
})
"
```

## Search Results

### Extract Search Result Items

```bash
superduck --tab $TAB exec "
JSON.stringify(
  Array.from(document.querySelectorAll('.search-result, .result-item')).map(item => ({
    title: item.querySelector('h2, h3, .title')?.textContent?.trim(),
    link: item.querySelector('a')?.href,
    snippet: item.querySelector('.snippet, .description')?.textContent?.trim()
  }))
)
"
```

## News/Feed Extraction

### Hacker News Front Page

```bash
superduck --tab $TAB navigate https://news.ycombinator.com/
superduck --tab $TAB context

superduck --tab $TAB exec "
JSON.stringify(
  Array.from(document.querySelectorAll('.athing')).map((item, index) => {
    const subtext = item.nextElementSibling;
    return {
      rank: index + 1,
      title: item.querySelector('.titleline a')?.textContent?.trim(),
      url: item.querySelector('.titleline a')?.href,
      points: subtext?.querySelector('.score')?.textContent,
      author: subtext?.querySelector('.hnuser')?.textContent,
      comments: subtext?.querySelector('.subtext a:last-child')?.textContent
    };
  })
)
"
```

### Reddit Front Page

```bash
superduck --tab $TAB navigate https://old.reddit.com/
superduck --tab $TAB context

superduck --tab $TAB exec "
JSON.stringify(
  Array.from(document.querySelectorAll('.thing')).map(post => ({
    title: post.querySelector('.title a')?.textContent?.trim(),
    url: post.querySelector('.title a')?.href,
    subreddit: post.querySelector('.subreddit')?.textContent,
    author: post.querySelector('.author')?.textContent,
    score: post.querySelector('.score')?.textContent
  }))
)
"
```

## Using Helper Scripts

### Node.js Data Extractor

```bash
SKILL_DIR="${CODEX_HOME:-$HOME/.codex}/skills/superduck"
node "$SKILL_DIR/scripts/extract-data.mjs" \
  https://example.com \
  ".item" \
  --output data.json
```

### Custom Extraction Script

Create a custom script for your specific use case:

```javascript
// my-extractor.mjs
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

function stripTabContext(stdout) {
  return stdout.split(/\n\s*\nTab Context:/)[0].trim();
}

async function extractMyData(url) {
  const { stdout: tabOutput } = await execFileAsync('superduck', ['tab_group', 'new']);
  const tabId = tabOutput.match(/Tab ID:\s*(\d+)/)?.[1];
  if (!tabId) throw new Error('Failed to create SuperDuck tab');

  await execFileAsync('superduck', ['--tab', tabId, 'navigate', url]);
  await execFileAsync('superduck', ['--tab', tabId, 'context']);

  const js = `JSON.stringify({
    title: document.title,
    links: Array.from(document.querySelectorAll('a[href]')).map(a => ({
      text: a.textContent.trim(),
      href: a.href
    }))
  })`;
  const { stdout } = await execFileAsync('superduck', ['--tab', tabId, 'exec', js]);
  return JSON.parse(stripTabContext(stdout));
}
```

## Best Practices

1. **Always verify page loaded** before extraction:
   ```bash
   superduck --tab $TAB context
   ```

2. **Use defensive selectors** with `?.` operator:
   ```javascript
   document.querySelector('.maybe-exists')?.textContent
   ```

3. **Trim whitespace** from extracted text:
   ```javascript
   element.textContent.trim()
   ```

4. **Handle arrays safely**:
   ```javascript
   Array.from(elements).map(...)
   ```

5. **Return JSON** for structured data, then strip trailing `Tab Context` before parsing:
   ```javascript
   JSON.stringify(data)
   ```
