import type { Request, Response, NextFunction } from 'express';
import {
  createPost as createPostService,
  getPost as getPostService,
  listResponses as listResponsesService,
  submitResponse as submitResponseService,
} from './posts.service.js';
import {
  createPostSchema,
  postIdParamSchema,
  submitResponseSchema,
} from './posts.validation.js';

/**
 * Thin controllers. Per CLAUDE.md, business logic lives in the service
 * layer; controllers only translate HTTP <-> service inputs and shape the
 * response envelope.
 *
 * All routes here require auth (see posts.routes.ts — requireAuth is
 * applied at the router mount). We still defensively guard on `req.user`
 * so the service contract is explicit.
 */

function requireUser(req: Request): { id: string; phone: string } {
  if (!req.user) {
    // requireAuth guarantees this; defensive throw that the central error
    // handler maps to the standard envelope.
    throw new Error('Authentication required');
  }
  return req.user;
}

export async function postCreate(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const body = createPostSchema.parse(req.body);
    const result = await createPostService({
      authorId: user.id,
      groupId: body.groupId,
      caption: body.caption,
      mediaIds: body.mediaIds,
      timerMinutes: body.timerMinutes,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getPostDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const { id } = postIdParamSchema.parse(req.params);
    const result = await getPostService(user.id, id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getResponses(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const { id } = postIdParamSchema.parse(req.params);
    const result = await listResponsesService(user.id, id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function postResponse(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const { id } = postIdParamSchema.parse(req.params);
    const body = submitResponseSchema.parse(req.body);
    const result = await submitResponseService({
      viewerId: user.id,
      postId: id,
      body: body.body,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
