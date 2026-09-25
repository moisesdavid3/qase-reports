import axios from 'axios';
import type { QaseProjectsResponse, QaseRunsResponse, QaseUsersResponse, QaseCasesResponse } from '../types/qase';

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
    params: { limit, offset, ...(search ? { search } : {}) },
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
