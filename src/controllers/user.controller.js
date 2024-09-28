import mongoose from "mongoose";
import { User } from "../models/user.models.js";
import ApiError from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHanlder } from "../utils/async-handler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import jwt from "jsonwebtoken";

const registerUser = asyncHanlder(async (req, res) => {
  // 1. Get user data from request body
  const { username, email, fullName, password } = req.body;

  // 2. Validate user data
  if (
    [username, email, fullName, password].some(
      (field) => field === undefined || field.length === 0,
    )
  ) {
    {
      throw new ApiError(400, "Missing requried fields");
    }
  }
  // 3. Check if user already exists
  const existingUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existingUser) {
    throw new ApiError(409, "User with same email or username already exists");
  }

  // 4. Check for images or avatars
  const avatarLocalPath = req?.files?.avatar?.[0]?.path;
  const coverImageLocalPath = req?.files?.coverImage?.[0]?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar is required");
  }

  // 5. Upload images to cloudinary

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  // 6. Create user object - create entry in database
  if (!avatar) {
    throw new ApiError(500, "Error uploading avatar");
  }

  //   const user = new User();
  const user = await User.create({
    username: username.toLowerCase(),
    email,
    fullName,
    avatar: avatar.url,
    coverImage: coverImage?.url,
    password,
  });

  if (!user) {
    throw new ApiError(500, "Something went wrong while creating user");
  }

  res
    .status(201)
    .json(new ApiResponse(201, user, "User registered successfully"));
});

const loginUser = asyncHanlder(async (req, res) => {
  const { email, username, password } = req.body;

  // check if all fields are present
  if (!email || !username || !password) {
    throw new ApiError(400, "Missing required credentials");
  }

  // find the user
  const user = await User.findOne({
    $or: [{ email }, { username }],
  });

  // if there is no user
  if (!user) {
    throw new ApiError(404, "Invalid credentials");
  }

  // check if password is correct
  const isValidPassword = await user.isPasswordMatch(password);

  if (!isValidPassword) {
    throw new ApiError(401, "Invalid credentials");
  }

  // generate access token
  const accessToken = await user.generateAccessToken();
  // generate refresh token
  const refreshToken = await user.generateRefreshToken();

  // save refresh token in database
  user.refreshToken = refreshToken;
  await user.save();

  // create a DTO for the user
  const userDto = {
    _id: user._id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    avatar: user.avatar,
    coverImage: user.coverImage,
    watchHistory: user.watchHistory,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
  // send response
  // res.status(200).json(
  //   new ApiResponse(200, {
  //     user: userDto,
  //     accessToken,
  //     refreshToken,
  //   }),
  // );

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };

  return res
    .status(200)
    .cookie("refreshToken", refreshToken, options)
    .cookie("accessToken", accessToken, options)
    .json(
      new ApiResponse(
        200,
        { user: userDto, refreshToken },
        "User logged in successfully",
      ),
    );
});

const logoutUser = asyncHanlder(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { refreshToken: undefined });

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };

  return res
    .status(200)
    .clearCookie("refreshToken", options)
    .clearCookie("accessToken", options)
    .json(new ApiResponse(200, null, "User logged out successfully"));
});

const refreshAccessToken = asyncHanlder(async (req, res) => {
  const { refreshToken } = req.cookies.resfreshToken || req.body.refreshToken;

  if (!refreshToken) {
    throw new ApiError(400, "Refresh token is required");
  }

  // decode the refresh token
  const decodedToken = jwt.verify(
    refreshToken,
    process.env.REFRESH_TOKEN_SECRET,
  );

  // find the user
  const user = await User.findById(decodedToken._id);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // check if the refresh token is valid
  if (user.refreshToken !== refreshToken) {
    throw new ApiError(401, "Unauthorized request");
  }

  // generate new access token
  const accessToken = await user.generateAccessToken();
  // generate new refresh token
  const newRefreshToken = await user.generateRefreshToken();
  user.refreshToken = newRefreshToken;
  await user.save();

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };

  return res
    .status(200)
    .cookie("refreshToken", newRefreshToken, options)
    .cookie("accessToken", accessToken, options)
    .json(
      new ApiResponse(
        200,
        { refreshToken: newRefreshToken },
        "Token refreshed successfully",
      ),
    );
});

const updatePassword = asyncHanlder(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ApiError(400, "Missing required fields");
  }

  // get the cookies
  const accessToken = req.cookies.accessToken;

  if (!accessToken) {
    throw new ApiError(401, "Unauthorized request");
  }

  // decode the access token
  const decodedToken = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);

  // find the user
  const user = await User.findById(decodedToken._id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // check if the current password is correct
  const isValidPassword = await user.isPasswordMatch(currentPassword);

  if (!isValidPassword) {
    throw new ApiError(401, "Invalid credentials");
  }

  // update the password
  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Password updated successfully"));
});

const getCurrentUser = asyncHanlder(async (req, res) => {
  // get access token
  const accessToken =
    req.cookies.accessToken || req.headers.authorization?.split(" ")[1];

  if (!accessToken) {
    throw new ApiError(401, "Unauthorized request");
  }

  // decode the access token
  const decodedToken = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);

  // find the user
  const user = await User.findById(decodedToken._id);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, user, "User details fetched successfully"));
});

const updateAvatar = asyncHanlder(async (req, res) => {
  // get access token
  const accessToken =
    req.cookies.accessToken || req.headers.authorization?.split(" ")[1];

  if (!accessToken) {
    throw new ApiError(401, "Unauthorized request");
  }

  const avatarLocalPath = req.file?.path;
  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar is required");
  }

  // upload avatar to cloudinary
  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar.url) {
    throw new ApiError(500, "Error uploading avatar");
  }

  // decode the access token
  const decodedToken = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);

  // find the user
  const user = await User.findById(decodedToken._id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  user.avatar = avatar.url;
  await user.save({ validateBeforeSave: false });

  const userDto = {
    _id: user._id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    avatar: user.avatar,
    coverImage: user.coverImage,
    watchHistory: user.watchHistory,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  return res
    .status(200)
    .json(
      new ApiResponse(200, { user: userDto }, "Avatar updated successfully"),
    );
});

const updateCover = asyncHanlder(async (req, res) => {
  // get access token
  const accessToken =
    req.cookies.accessToken || req.headers.authorization?.split(" ")[1];

  if (!accessToken) {
    throw new ApiError(401, "Unauthorized request");
  }

  const coverLocalPath = req.file?.path;
  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar is required");
  }

  // upload avatar to cloudinary
  const coverImage = await uploadOnCloudinary(coverLocalPath);

  if (!coverImage.url) {
    throw new ApiError(500, "Error uploading avatar");
  }

  // decode the access token
  const decodedToken = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);

  // find the user
  const user = await User.findById(decodedToken._id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  user.coverImage = coverImage.url;
  await user.save({ validateBeforeSave: false });

  const userDto = {
    _id: user._id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    avatar: user.avatar,
    coverImage: user.coverImage,
    watchHistory: user.watchHistory,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { user: userDto },
        "Cover Image updated successfully",
      ),
    );
});

const getUserChannelProfile = asyncHanlder(async (req, res) => {
  const { username } = req.params;

  if (!username || !username.trim()) {
    throw new ApiError(400, "Username is missing");
  }

  const result = await User.aggregate([
    {
      $match: { username: username.toLowerCase() },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers",
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribed",
      },
    },
    {
      $addFields: {
        subscribersCount: {
          $size: "$subscribers",
        },
        subscribedCount: {
          $size: "$subscribed",
        },
        isSubscribed: {
          $cond: {
            if: {
              $in: [req.user._id, "$subscribers.subscriber"],
            },
            then: true,
            else: false,
          },
        },
      },
    },
    {
      $project: {
        fullName: 1,
        username: 1,
        email: 1,
        subscribedCount: 1,
        subscribersCount: 1,
        avatar: 1,
        coverImage: 1,
      },
    },
  ]);

  if (!result.length) {
    throw new ApiError(404, "Channel does not exists");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, result[0], "Channel profile fetched successfully"),
    );
});

const getWatchHistory = asyncHanlder(async (req, res) => {
  const result = await User.aggregate([
    {
      $match: {
        _id: mongoose.Types.ObjectId(req.user._id),
      },
    },
    {
      $lookup: {
        from: "videos",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistory",

        pipeline: [
          {
            $lookup: {
              from: "users",
              foreignField: "_id",
              localField: "owner",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    fullName: 1,
                    username: 1,
                    avatar: 1,
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              $first: "owner",
            },
          },
        ],
      },
    },
  ]);

  return res.json(
    new ApiResponse(
      200,
      { watchHistory: result[0].watchHistory },
      "Watch history fetched successfully",
    ),
  );
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  updatePassword,
  updateAvatar,
  updateCover,
};
