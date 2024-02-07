import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";

export const verifyJwtToken = asyncHandler(async (req, _ ,next) => {
  // for web dev req.cookies but for mobile app dev use header
  try {
    const token =
      req.cookies?.accessToken ||
      req.header("Authorization")?.replace("Bearer", "");
  
    if (!token) {
      throw new ApiError(401, "unauthorized request");
    }
  
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  console.log(decodedToken);
    const user = await User.findById(decodedToken?._id).select(
      "-password -refreshToken"
    );

  
    if (!user) {
      throw new ApiError(401, "Invalid Access Token");
    }
  
    req.user = user
    next()
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid access token") 
  }
});
