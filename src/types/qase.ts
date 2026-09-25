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

export interface QaseRun {
  id: number;
  title: string;
  status: number;
  status_text: string;
  start_time: string | null;
  end_time: string | null;
  user_id: number;
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
  automation: 0 | 1 | 2; // 0 = manual, 1 = to_be_automated, 2 = automated
  created_at: string;
  updated_at: string;
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
