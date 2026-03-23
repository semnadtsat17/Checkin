/**
 * Typed response builders.
 * Keeps controller code terse and response shape consistent.
 */
import { Response } from 'express';
import { ApiResponse, PaginatedResponse } from '@hospital-hr/shared';
import { PageResult } from '../storage/JsonStorageService';

export function ok<T>(res: Response, data: T, message?: string): Response {
  const body: ApiResponse<T> = { success: true, data, message };
  return res.status(200).json(body);
}

export function created<T>(res: Response, data: T, message?: string): Response {
  const body: ApiResponse<T> = { success: true, data, message };
  return res.status(201).json(body);
}

export function noContent(res: Response): Response {
  return res.status(204).send();
}

export function badRequest(res: Response, error: string): Response {
  const body: ApiResponse = { success: false, error };
  return res.status(400).json(body);
}

export function notFoundResponse(res: Response, error = 'Not found'): Response {
  const body: ApiResponse = { success: false, error };
  return res.status(404).json(body);
}

export function paginated<T>(res: Response, result: PageResult<T>): Response {
  const body: PaginatedResponse<T> = {
    items: result.items,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
  };
  return res.status(200).json({ success: true, data: body });
}
