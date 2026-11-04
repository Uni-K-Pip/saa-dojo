// Node のモジュール解決フック。
// リポジトリ直下の scripts/lib/schema.mjs は zod を import するが、CI の app ジョブでは
// ルートの node_modules がない。通常の解決に失敗したパッケージ名（bare specifier）だけを
// app/node_modules から解決し直す。
let fallbackParent = null;

export async function initialize(data) {
  fallbackParent = data?.fallbackParent ?? null;
}

const isBare = (s) => !/^(?:\.{1,2}\/|\/|[a-zA-Z][a-zA-Z0-9+.-]*:)/.test(s);

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (fallbackParent && err?.code === 'ERR_MODULE_NOT_FOUND' && isBare(specifier)) {
      return nextResolve(specifier, { ...context, parentURL: fallbackParent });
    }
    throw err;
  }
}
