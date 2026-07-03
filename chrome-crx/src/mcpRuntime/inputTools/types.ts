import { isRecord } from '../../messageTypes';
import type { ClickOptions } from '../cdp';
import type { ToolContext, ToolResult } from '../pageTools';

export interface ComputerToolParams {
  action: string;
  coordinate?: [number, number];
  text?: string;
  duration?: number;
  scroll_direction?: string;
  scroll_amount?: number;
  start_coordinate?: [number, number];
  region?: [number, number, number, number];
  repeat?: number;
  ref?: string;
  modifiers?: string;
  tabId?: number;
  annotate?: boolean;
  coordinate_space?: 'screenshot' | 'viewport';
}

export type { ClickOptions };

export type FormInputValue = string | number | boolean;

export interface FormInputToolParams {
  ref: string;
  value: FormInputValue;
  tabId?: number;
}

export interface FormInputScriptResult extends ToolResult {
  success?: boolean;
  action?: string;
  ref?: string;
  element_type?: string;
  previous_value?: string | boolean;
  new_value?: string | boolean;
  message?: string;
}

export interface ScrollToRefResult {
  success: boolean;
  error?: string;
  coordinates?: [number, number];
}

export type PermissionManagerLike = ToolContext['permissionManager'];

export function isScrollToRefResult(value: unknown): value is ScrollToRefResult {
  return (
    isRecord(value) &&
    typeof value.success === 'boolean' &&
    (value.error === undefined || typeof value.error === 'string') &&
    (value.coordinates === undefined ||
      (Array.isArray(value.coordinates) &&
        value.coordinates.length === 2 &&
        value.coordinates.every((entry) => typeof entry === 'number')))
  );
}

export function isFormInputScriptResult(value: unknown): value is FormInputScriptResult {
  return (
    isRecord(value) &&
    (value.error === undefined || typeof value.error === 'string') &&
    (value.success === undefined || typeof value.success === 'boolean') &&
    (value.action === undefined || typeof value.action === 'string') &&
    (value.ref === undefined || typeof value.ref === 'string') &&
    (value.element_type === undefined || typeof value.element_type === 'string') &&
    (value.previous_value === undefined ||
      typeof value.previous_value === 'string' ||
      typeof value.previous_value === 'boolean') &&
    (value.new_value === undefined ||
      typeof value.new_value === 'string' ||
      typeof value.new_value === 'boolean') &&
    (value.message === undefined || typeof value.message === 'string') &&
    (value.output === undefined || typeof value.output === 'string')
  );
}
