export interface QaseProject {
  code: string;
  title: string;
  description: string;
  counts: {
    cases: number;
    suites: number;
    milestones: number;
    runs: {
      total: number;
      active: number;
    };
    defects: {
      total: number;
      open: number;
    };
  };
}

export interface QaseProjectsResponse {
  status: boolean;
  result: {
    total: number;
    filtered: number;
    count: number;
    entities: QaseProject[];
  };
}
