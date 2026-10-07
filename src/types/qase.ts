export interface Workspace {
  id: 'sm_pl' | 'sm';
  label: string;
  token: string;
}

export const WORKSPACES: Workspace[] = [
  {
    id: 'sm_pl',
    label: 'SourceMeridian - PL',
    token: import.meta.env.VITE_QASE_API_TOKEN_SM_PL as string,
  },
  {
    id: 'sm',
    label: 'SourceMeridian',
    token: import.meta.env.VITE_QASE_API_TOKEN_SM as string,
  },
];

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

export interface QaseExternalIssue {
  id: string;
  type: string;
  link: string | null;
}

export interface QaseRun {
  id: number;
  title: string;
  status: number;
  status_text: string;
  start_time: string | null;
  end_time: string | null;
  user_id: number;
  milestone: { title: string; description: string | null } | null;
  external_issue?: QaseExternalIssue | null;
  environment?: { title: string } | null;
  stats: {
    total: number;
    passed: number;
    failed: number;
    blocked: number;
    skipped: number;
    retest: number;
    in_progress: number;
    invalid: number;
    untested: number;
  };
}

export interface QaseMilestone {
  id: number;
  title: string;
  status: string;
  description: string | null;
  due_date: string | null;
  created_at: string;
}

export interface QaseMilestonesResponse {
  status: boolean;
  result: {
    total: number;
    filtered: number;
    count: number;
    entities: QaseMilestone[];
  };
}

export interface QaseUser {
  id: number;
  name: string;
  email: string;
  status: number;
}

export interface QaseUsersResponse {
  status: boolean;
  result: {
    total: number;
    filtered: number;
    count: number;
    entities: QaseUser[];
  };
}

export interface QaseRunsResponse {
  status: boolean;
  result: {
    total: number;
    filtered: number;
    count: number;
    entities: QaseRun[];
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

export interface QaseCase {
  id: number;
  suite_id: number | null;
  automation: 0 | 1 | 2; // 0 = manual, 1 = to_be_automated, 2 = automated
  created_at: string;
  updated_at: string;
}

export interface QaseSuite {
  id: number;
  title: string;
  parent_id: number | null;
}

export interface QaseSuitesResponse {
  status: boolean;
  result: {
    total: number;
    filtered: number;
    count: number;
    entities: QaseSuite[];
  };
}

export interface QaseCasesResponse {
  status: boolean;
  result: {
    total: number;
    filtered: number;
    count: number;
    entities: QaseCase[];
  };
}

export interface QaseResult {
  id: string;
  status: string; // 'passed' | 'failed' | 'blocked' | 'skipped' | 'invalid' | ...
  time_ms: number | null;
  case_id: number;
  run_id: number;
  case: {
    title: string;
    suite_title: string | null;
  } | null;
}

export interface QaseResultsResponse {
  status: boolean;
  result: {
    total: number;
    filtered: number;
    count: number;
    entities: QaseResult[];
  };
}

export interface QaseDefect {
  id: number;
  title: string;
  status: string; // 'open' | 'resolved' | 'in_progress' | 'invalid'
  severity: string | number | null;
  created_at: string;
  updated_at: string;
  resolved: string | null;
}

export interface QaseDefectsResponse {
  status: boolean;
  result: {
    total: number;
    filtered: number;
    count: number;
    entities: QaseDefect[];
  };
}
