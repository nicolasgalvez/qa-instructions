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
    status: 'complete' | 'partial' | 'failed';
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
};

export type QaAssetInput = {
  id: string;
  contentType: string;
  filename: string;
  data: Buffer;
  sha256?: string;
};
