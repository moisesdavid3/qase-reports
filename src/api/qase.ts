import axios from 'axios';
import type { QaseProjectsResponse } from '../types/qase';

const token = import.meta.env.VITE_QASE_API_TOKEN;

const client = axios.create({
  baseURL: '/api/qase',
  headers: {
    'Token': token,
    'Content-Type': 'application/json',
  },
});

export async function fetchProjects(limit = 100, offset = 0): Promise<QaseProjectsResponse> {
  const { data } = await client.get<QaseProjectsResponse>('/project', {
    params: { limit, offset },
  });
  return data;
}
