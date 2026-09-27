export type QaAsset = {
  id: string;
  contentType: string;
  filename: string;
  sha256?: string;
};

export type QaStep = {
  index: number;
  action: string;
  expected?: string;
  url?: string;
  assetIds?: string[];
  /** Titles of the Section this step is in, outermost group first. */
  section?: string[];
  /** True on the QA Step where the test failed. */
  failed?: boolean;
  /** The test changed the page by script here; the tester may need to act by hand. Has no Highlight. */
  warning?: boolean;
  /** The Action was forced past the runner's usual checks; its Highlight may not line up. */
  approximate?: boolean;
};

export type QaRunBundle = {
  version: '1';
  meta: {
    title: string;
    prerequisite?: string;
    source?: {
      runner: 'playwright' | 'jest' | 'devtools' | 'manual';
      testFile?: string;
      testTitle?: string;
      project?: string;
    };
    capturedAt: string;
    /**
     * `incomplete`: derived from a test that did not pass, so the QA Steps
     * stop where it failed.
     */
    status: 'complete' | 'incomplete';
  };
  steps: QaStep[];
  assets: Record<string, QaAsset>;
};

export type QaGuideOptions = {
  title: string;
  prerequisite?: string;
};

export type QaStepInput = {
  action: string;
  expected?: string;
  url?: string;
  assetIds?: string[];
  section?: string[];
  failed?: boolean;
  warning?: boolean;
  approximate?: boolean;
};

export type QaAssetInput = {
  id: string;
  contentType: string;
  filename: string;
  data: Buffer;
  sha256?: string;
};
