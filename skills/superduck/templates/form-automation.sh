#!/bin/bash

# Form Automation Template
# Fill out a multi-field form automatically

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <form_url> [field1=value1] [field2=value2] ..."
  echo ""
  echo "Example:"
  echo "  $0 https://example.com/form name='John Doe' email='john@example.com'"
  exit 1
fi

URL="$1"
shift

# Reuse the current session tab group, creating it only if needed.
echo "Resolving session tab..."
TAB_ID=$(superduck --json tab_group list --create-if-empty | jq -r '.tabContext.currentTabId // ""')

if [ -z "$TAB_ID" ]; then
  echo "Error: Failed to resolve tab"
  exit 1
fi

echo "Using tab ID: $TAB_ID"

# Navigate to form
echo "Navigating to $URL..."
superduck --tab "$TAB_ID" navigate "$URL"
superduck --tab "$TAB_ID" context

# Get form structure
echo "Analyzing form..."
superduck --tab "$TAB_ID" exec "
JSON.stringify(
  Array.from(document.querySelectorAll('input, textarea, select')).map(field => ({
    name: field.name,
    id: field.id,
    type: field.type,
    placeholder: field.placeholder
  }))
)
"

echo ""
echo "Filling form fields..."

# Fill each field
for FIELD in "$@"; do
  FIELD_NAME="${FIELD%%=*}"
  FIELD_VALUE="${FIELD#*=}"
  FIELD_NAME_JSON=$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$FIELD_NAME")
  FIELD_VALUE_JSON=$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$FIELD_VALUE")

  echo "Setting $FIELD_NAME = $FIELD_VALUE"

  # Find and set field value, then notify common frontend frameworks.
  superduck --tab "$TAB_ID" exec "
    const name = $FIELD_NAME_JSON;
    const value = $FIELD_VALUE_JSON;
    const field = document.querySelector('[name=' + CSS.escape(name) + '], #' + CSS.escape(name));
    if (field) {
      field.focus();
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
  "

  sleep 0.5
done

echo ""
echo "Form filled. Ready to submit."
echo "To submit, run:"
echo "  superduck --tab $TAB_ID key Enter"
echo ""
echo "Or take a screenshot to verify:"
echo "  superduck --tab $TAB_ID screenshot --output /tmp/"
