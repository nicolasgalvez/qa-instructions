import type {
  QaAssetInput,
  QaGuideOptions,
  QaRunBundle,
  QaStep,
  QaStepInput,
} from '../model.js';

export type BundleBuilder = {
  guide(options: QaGuideOptions): void;
  addStep(input: QaStepInput): QaStep;
  addAsset(input: QaAssetInput): void;
  setStatus(status: QaRunBundle['meta']['status']): void;
  setSource(source: NonNullable<QaRunBundle['meta']['source']>): void;
  toBundle(): QaRunBundle;
  pendingAssets(): QaAssetInput[];
};

export function createBundleBuilder(): BundleBuilder {
  const meta: QaRunBundle['meta'] = {
    title: '',
    capturedAt: new Date().toISOString(),
    status: 'complete',
  };
  const steps: QaStep[] = [];
  const assets: QaRunBundle['assets'] = {};
  const pending: QaAssetInput[] = [];

  return {
    guide(options) {
      meta.title = options.title;
      meta.prerequisite = options.prerequisite;
    },
    addStep(input) {
      const step: QaStep = {
        index: steps.length + 1,
        action: input.action,
        expected: input.expected,
        url: input.url,
        assetIds: input.assetIds,
        section: input.section,
      };
      steps.push(step);
      return step;
    },
    addAsset(input) {
      pending.push(input);
      assets[input.id] = {
        id: input.id,
        contentType: input.contentType,
        filename: input.filename,
        sha256: input.sha256,
      };
    },
    setStatus(status) {
      meta.status = status;
    },
    setSource(source) {
      meta.source = source;
    },
    toBundle() {
      return { version: '1', meta, steps, assets };
    },
    pendingAssets() {
      return [...pending];
    },
  };
}
