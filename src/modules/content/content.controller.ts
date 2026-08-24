import type { Request, Response } from "express";
import status from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import * as contentService from "./content.service";

export const homepage = catchAsync(async (_req: Request, res: Response) => {
  const data = await contentService.getPublishedHomepage();
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: "Homepage content retrieved.",
    data,
  });
});

export const page = catchAsync(async (req: Request, res: Response) => {
  const data = await contentService.getContentPage(String(req.params.slug));
  sendResponse(res, {
    status: status.OK,
    success: true,
    message: "Content page retrieved.",
    data,
  });
});
