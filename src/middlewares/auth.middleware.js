import { User } from "../models/user.models.js";
import ApiError from "../utils/api-error.js";
import { asyncHanlder } from "../utils/async-handler.js";
import jwt from "jsonwebtoken";

export const verifyJWT = asyncHanlder(async (req, res, next) => {
  try {
    // get the token from the request header or cookie
    const token =
      req.cookies?.accessToken || req.headers.authorization?.split(" ")[1];

    if (!token) {
      throw new ApiError(401, "Unauthorized request");
    }

    // verify the token
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const user = await User.findById().select("-password -refreshToken");
    if (!user) {
      throw new ApiError(401, "Unauthorized request");
    }

    req.user = user;
    next();
  } catch (error) {
    throw new ApiError(401, "Unauthorized request");
  }
});
