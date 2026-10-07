import axios from 'axios';
import type { QaseProjectsResponse, QaseRunsResponse, QaseUsersResponse, QaseCasesResponse, QaseResultsResponse, QaseSuitesResponse, QaseMilestonesResponse } from '../types/qase';

function createClient(token: string) {
  return axios.create({
    baseURL: '/api/qase',
    headers: {
      'Token': token,
      'Content-Type': 'application/json',
    },
  });
}

export async function fetchProjects(token: string, limit = 100, offset = 0): Promise<QaseProjectsResponse> {
  const { data } = await createClient(token).get<QaseProjectsResponse>('/project', {
    params: { limit, offset },
  });
  return data;
}

export async function fetchRuns(
  token: string,
  projectCode: string,
  limit = 20,
  offset = 0,
  search = '',
): Promise<QaseRunsResponse> {
  const { data } = await createClient(token).get<QaseRunsResponse>(`/run/${projectCode}`, {
    params: { limit, offset, include: 'external_issue', ...(search ? { search } : {}) },
  });
  return data;
}

export async function fetchUsers(token: string): Promise<QaseUsersResponse> {
  const { data } = await createClient(token).get<QaseUsersResponse>('/user', {
    params: { limit: 100 },
  });
  return data;
}

export async function fetchCases(
  token: string,
  projectCode: string,
  limit = 100,
  offset = 0,
): Promise<QaseCasesResponse> {
  const { data } = await createClient(token).get<QaseCasesResponse>(`/case/${projectCode}`, {
    params: { limit, offset },
  });
  return data;
}

export async function fetchMilestones(
  token: string,
  projectCode: string,
  limit = 100,
  offset = 0,
): Promise<QaseMilestonesResponse> {
  const { data } = await createClient(token).get<QaseMilestonesResponse>(`/milestone/${projectCode}`, {
    params: { limit, offset },
  });
  return data;
}

export async function fetchSuites(
  token: string,
  projectCode: string,
  limit = 100,
  offset = 0,
): Promise<QaseSuitesResponse> {
  const { data } = await createClient(token).get<QaseSuitesResponse>(`/suite/${projectCode}`, {
    params: { limit, offset },
  });
  return data;
}

export async function fetchResults(
  token: string,
  projectCode: string,
  runId: number,
  limit = 100,
  offset = 0,
): Promise<QaseResultsResponse> {
  const { data } = await createClient(token).get<QaseResultsResponse>(`/result/${projectCode}`, {
    params: { limit, offset, run_id: runId },
  });
  return data;
}
