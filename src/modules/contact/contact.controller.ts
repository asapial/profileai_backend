import type { Request, Response } from "express";
import status from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { submitContactRequest } from "./contact.service";

export const submit = catchAsync(async (req: Request, res: Response) => {
  const data = await submitContactRequest(req.body);
  sendResponse(res, {
    status: status.CREATED,
    success: true,
    message: "Thanks — your message is now with our team.",
    data,
  });
});
