// meilisearch@0.58 ships types only through its package "exports" map, which the
// backend's classic ("node") moduleResolution can't read. Re-export the real
// declarations by path so `import ... from 'meilisearch'` is fully typed, while
// Node still resolves the runtime entry via the package exports.
declare module 'meilisearch' {
  export * from 'meilisearch/dist/index';
}
