import type { IntlShape } from 'react-intl';
import type { ElementInfo } from './types';

export function normalizeFieldName(name?: string): string {
  if (!name) return '';
  return name
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .toLowerCase();
}

export function getTextEntryDescription(intl: IntlShape, text: string, fieldName?: string): string {
  const preview30 = `${text.substring(0, 30)}${text.length > 30 ? '...' : ''}`;
  const preview50 = `${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`;

  let description = intl.formatMessage(
    { id: 'workflow_type_text_preview', defaultMessage: 'Type "{text}"' },
    { text: preview30 }
  );

  if (text.includes('@')) {
    description = intl.formatMessage(
      { id: 'workflow_enter_email', defaultMessage: 'Enter email "{text}"' },
      { text }
    );
  } else if (text.length < 20 && !text.includes(' ')) {
    description = intl.formatMessage(
      { id: 'workflow_enter_text', defaultMessage: 'Enter "{text}"' },
      { text }
    );
  } else if (text.length > 50) {
    description = intl.formatMessage(
      { id: 'workflow_type_text_long', defaultMessage: 'Type text: "{text}"' },
      { text: preview50 }
    );
  }

  const normalizedFieldName = normalizeFieldName(fieldName);
  if (normalizedFieldName) {
    description = intl.formatMessage(
      {
        id: 'workflow_in_field',
        defaultMessage: '{description} in {fieldName} field'
      },
      {
        description,
        fieldName: normalizedFieldName
      }
    );
  }

  return description;
}

export function generateElementDescription(intl: IntlShape, element: ElementInfo): string {
  const tagName = element.tagName.toLowerCase();
  const text = element.text?.trim();
  const attrs = element.attributes || {};
  const truncatedText40 = (value: string) =>
    value.length > 40 ? `${value.substring(0, 40)}...` : value;
  const truncatedText50 = (value: string) =>
    value.length > 50 ? `${value.substring(0, 50)}...` : value;
  const clickNamed = (value: string) =>
    intl.formatMessage(
      { id: 'workflow_click_named', defaultMessage: 'Click on "{target}"' },
      { target: value }
    );

  if (attrs['aria-label']) {
    return clickNamed(attrs['aria-label']);
  }

  if (attrs.title && (!text || text.length <= 3)) {
    return clickNamed(attrs.title);
  }

  if ((tagName === 'button' || tagName === 'a') && text && text.length > 1) {
    return intl.formatMessage(
      { id: 'workflow_click_button', defaultMessage: 'Click on "{target}" button' },
      { target: truncatedText40(text) }
    );
  }

  if ((tagName === 'button' || tagName === 'a') && attrs.title) {
    return intl.formatMessage(
      { id: 'workflow_click_button', defaultMessage: 'Click on "{target}" button' },
      { target: attrs.title }
    );
  }

  if (tagName === 'input') {
    const type = attrs.type || 'text';
    const placeholder = attrs.placeholder;
    const name = attrs.name;

    if (type === 'submit' || type === 'button') {
      const value = attrs.value || text;
      return value
        ? intl.formatMessage(
            { id: 'workflow_click_button', defaultMessage: 'Click on "{target}" button' },
            { target: value }
          )
        : intl.formatMessage({
            id: 'workflow_click_submit_button',
            defaultMessage: 'Click on submit button'
          });
    }

    if (placeholder) {
      return intl.formatMessage(
        { id: 'workflow_click_field', defaultMessage: 'Click on "{target}" field' },
        { target: placeholder }
      );
    }

    if (name) {
      return intl.formatMessage(
        { id: 'workflow_click_named_field', defaultMessage: 'Click on {fieldName} field' },
        { fieldName: normalizeFieldName(name) }
      );
    }

    return intl.formatMessage(
      { id: 'workflow_click_input', defaultMessage: 'Click on {inputType} input' },
      { inputType: type }
    );
  }

  if (tagName === 'select') {
    const name = attrs.name;
    return name
      ? intl.formatMessage(
          {
            id: 'workflow_click_named_dropdown',
            defaultMessage: 'Click on {fieldName} dropdown'
          },
          { fieldName: normalizeFieldName(name) }
        )
      : intl.formatMessage({
          id: 'workflow_click_dropdown_menu',
          defaultMessage: 'Click on dropdown menu'
        });
  }

  if (tagName === 'img') {
    const alt = attrs.alt;
    return alt
      ? intl.formatMessage(
          { id: 'workflow_click_image_named', defaultMessage: 'Click on "{target}" image' },
          { target: alt }
        )
      : intl.formatMessage({ id: 'workflow_click_image', defaultMessage: 'Click on image' });
  }

  if (attrs.role) {
    return text
      ? clickNamed(truncatedText40(text))
      : intl.formatMessage(
          { id: 'workflow_click_role', defaultMessage: 'Click on {role}' },
          { role: attrs.role }
        );
  }

  if (tagName === 'div' || tagName === 'span') {
    const tooltip =
      attrs.title || attrs['data-tooltip'] || attrs['data-tip'] || attrs['data-original-title'];
    if (tooltip && (!text || text.length <= 3)) {
      return clickNamed(tooltip);
    }

    if (text) {
      const displayText = truncatedText50(text);
      if (attrs.class?.includes('menu') || attrs.class?.includes('nav')) {
        return intl.formatMessage(
          {
            id: 'workflow_click_menu_item',
            defaultMessage: 'Click on "{target}" menu item'
          },
          { target: displayText }
        );
      }
      return clickNamed(displayText);
    }

    if (tooltip) {
      return clickNamed(tooltip);
    }
  }

  if (attrs.id) {
    return intl.formatMessage(
      { id: 'workflow_click_id', defaultMessage: 'Click on {target}' },
      {
        target: attrs.id
          .replace(/-/g, ' ')
          .replace(/_/g, ' ')
          .replace(/([A-Z])/g, ' $1')
          .trim()
      }
    );
  }

  const tooltip =
    attrs.title ||
    attrs['data-tooltip'] ||
    attrs['data-tip'] ||
    attrs['data-original-title'] ||
    attrs['aria-description'];
  if (tooltip) {
    return clickNamed(tooltip);
  }

  if (text) {
    return clickNamed(truncatedText40(text));
  }

  return intl.formatMessage(
    { id: 'workflow_click_tag_element', defaultMessage: 'Click on {tagName} element' },
    { tagName }
  );
}
