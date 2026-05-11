import * as ReactModule from "react";
import * as JsxRuntimeModule from "react/jsx-runtime";

type ModuleRecord = Record<string, unknown>;
type CallableModuleRecord = ModuleRecord &
  ((this: unknown, ...args: unknown[]) => unknown) & {
    prototype?: unknown;
  };

function mergeModuleExports<T extends object>(target: T, modules: unknown[]): T {
  for (let index = 0; index < modules.length; index += 1) {
    const module = modules[index];

    if (typeof module === "string" || Array.isArray(module) || !module) {
      continue;
    }

    const moduleRecord = module as ModuleRecord;
    for (const key in moduleRecord) {
      if (key === "default" || key in target) {
        continue;
      }

      const descriptor = Object.getOwnPropertyDescriptor(moduleRecord, key);
      if (!descriptor) {
        continue;
      }

      Object.defineProperty(
        target,
        key,
        descriptor.get
          ? descriptor
          : {
              enumerable: true,
              get: () => moduleRecord[key]
            }
      );
    }
  }

  Object.defineProperty(target, Symbol.toStringTag, { value: "Module" });
  return Object.freeze(target);
}

const globalScope: typeof globalThis | Record<string, unknown> =
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof window !== "undefined"
      ? window
      : typeof global !== "undefined"
        ? global
        : typeof self !== "undefined"
          ? self
          : {};

function interopDefault<T>(module: T): unknown {
  if (
    module &&
    typeof module === "object" &&
    "__esModule" in module &&
    Object.prototype.hasOwnProperty.call(module, "default")
  ) {
    return (module as ModuleRecord).default;
  }

  return module;
}

function interopNamespaceCompat<T extends ModuleRecord>(module: T): T | ModuleRecord {
  if (Object.prototype.hasOwnProperty.call(module, "__esModule")) {
    return module;
  }

  const defaultExport = module.default;
  let namespaceProxy: ModuleRecord;

  if (typeof defaultExport === "function") {
    const callable = function namespaceCallable(this: unknown, ...args: unknown[]): unknown {
      let isConstructCall: boolean;
      try {
        isConstructCall = this instanceof namespaceCallable;
      } catch {
        isConstructCall = false;
      }

      if (isConstructCall) {
        return Reflect.construct(
          defaultExport as (...callArgs: unknown[]) => unknown,
          args,
          (this as { constructor?: unknown })?.constructor as new (...ctorArgs: unknown[]) => unknown
        );
      }

      return (defaultExport as (...callArgs: unknown[]) => unknown).apply(this, args);
    } as CallableModuleRecord;

    callable.prototype = (defaultExport as { prototype?: unknown }).prototype;
    namespaceProxy = callable;
  } else {
    namespaceProxy = {};
  }

  Object.defineProperty(namespaceProxy, "__esModule", { value: true });

  Object.keys(module).forEach((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(module, key);
    if (!descriptor) {
      return;
    }

    Object.defineProperty(
      namespaceProxy,
      key,
      descriptor.get
        ? descriptor
        : {
            enumerable: true,
            get: () => module[key]
          }
    );
  });

  return namespaceProxy;
}

function getJsxRuntime(): typeof JsxRuntimeModule {
  return JsxRuntimeModule;
}

function getReactModule(): typeof ReactModule {
  return ReactModule;
}

const ReactDefault = interopDefault(ReactModule) as typeof ReactModule;
const ReactNamespace = mergeModuleExports(
  { __proto__: null, default: ReactDefault } as Record<string, unknown>,
  [ReactModule]
);

export {
  ReactDefault as R,
  getReactModule as a,
  getJsxRuntime as b,
  globalScope as c,
  ReactNamespace as d,
  interopNamespaceCompat as e,
  interopDefault as g,
  JsxRuntimeModule as j,
  ReactModule as r
};
