export const EXCLUDED_TAGS = new Set(['script', 'style', 'meta', 'link', 'title', 'noscript']);

export const INTERACTIVE_TAGS = new Set([
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'details',
  'summary'
]);

export const SEMANTIC_TAGS = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'nav',
  'main',
  'header',
  'footer',
  'section',
  'article',
  'aside'
]);

export const ROLE_BY_TAG: Record<string, string> = {
  a: 'link',
  article: 'article',
  aside: 'complementary',
  button: 'button',
  footer: 'contentinfo',
  form: 'form',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  header: 'banner',
  img: 'image',
  label: 'label',
  li: 'listitem',
  main: 'main',
  nav: 'navigation',
  ol: 'list',
  section: 'region',
  select: 'combobox',
  table: 'table',
  textarea: 'textbox',
  ul: 'list'
};
