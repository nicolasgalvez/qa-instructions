export type QaAsset = {
  id: string;
  contentType: string;
  filename: string;
  sha256?: string;
};

/** A point on the page, in CSS pixels from the viewport's top-left corner. */
export type QaPoint = { x: number; y: number };

/** A rectangle on the page, in CSS pixels from the viewport's top-left corner. */
export type QaBox = { x: number; y: number; width: number; height: number };

/**
 * When a Step Screenshot was taken, relative to its Action: at the moment of
 * the Action (preferred), just after it, or just before it.
 */
export type QaScreenshotMoment = 'action' | 'after' | 'before';

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
  /** When the step's Step Screenshot (its first asset) was taken. */
  screenshotMoment?: QaScreenshotMoment;
  /** The element the Action touched, at the moment of the Action. */
  elementBox?: QaBox;
  /** Where the Action clicked or tapped. */
  clickPoint?: QaPoint;
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

export type QaStepInput = Omit<QaStep, 'index'>;

export type QaAssetInput = {
  id: string;
  contentType: string;
  filename: string;
  data: Buffer;
  sha256?: string;
};
