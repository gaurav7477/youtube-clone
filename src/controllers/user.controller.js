import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import jwt from "jsonwebtoken";
import {v2 as cloudinary} from 'cloudinary';

const generateAccessAndRefereshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });
    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating referesh and access token"
    );
  }
};

const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    console.log("Image deleted from Cloudinary:", result);
    return result;
  } catch (error) {
    throw new ApiError(500, "Error while deleting image from cloudinary");
  }
};

export const registerUser = asyncHandler(async (req, res) => {
  const { fullName, email, username, password } = req.body;

  if (
    [fullName, email, username, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existedUser) {
    throw new ApiError(409, "User with email or username already exists");
  }
  //console.log(req.files);

  const avatarLocalPath = req.files?.avatar[0]?.path;
  //const coverImageLocalPath = req.files?.coverImage[0]?.path;

  let coverImageLocalPath;
  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatar) {
    throw new ApiError(400, "Avatar file is required");
  }

  const user = await User.create({
    fullName,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase(),
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering the user");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered Successfully"));
});

export const loginUser = asyncHandler(async (req, res) => {
  const { email, username, password } = req.body;

  if (!email && !username) {
    throw new ApiError(400, "username or email required");
  }

  const user = await User.findOne({ $or: [{ username }, { password }] });

  if (!user) {
    throw new ApiError(400, "user not found");
  }

  const isPasswordMatch = await user.isPasswordCorrect(password);

  if (!isPasswordMatch) {
    throw new ApiError(400, "invalid user credential");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefereshTokens(
    user._id
  );

  // get user with refresh token
  const loggedInUser = await User.findById(user._id);

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged In Successfully"
      )
    );
});

export const logoutUser = asyncHandler(async (req, res) => {
  // need of middleware
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: {
        refreshToken: 1,
      },
    },
    {
      new: true,
    }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged Out"));
});

export const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "unauthorized request");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedToken._id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    const options = {
      httpOnly: true,
      secure: true,
    };

    const { accessToken, newRefreshToken } =
      await generateAccessAndRefereshTokens(user._id)
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", newRefreshToken, options)
        .json(
          new ApiResponse(
            200,
            { accessToken, refreshToken: newRefreshToken },
            "Access token refreshed"
          )
        );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

export const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id);
  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordCorrect) {
    throw new ApiError(400, "invalid old password");
  }

  user.password = newPassword;

  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "password change successfully"));
});

export const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "User fetched successfully"));
});

export const updateAccountDetails = asyncHandler(async(req, res) => {
  const {fullName, email} = req.body

  if (!fullName || !email) {
      throw new ApiError(400, "All fields are required")
  }

  const user = await User.findByIdAndUpdate(
      req.user?._id,
      {
          $set: {
              fullName,
              email: email
          }
      },
      {new: true}
      
  ).select("-password")

  return res
  .status(200)
  .json(new ApiResponse(200, user, "Account details updated successfully"))
});

export const updateUserAvatar = asyncHandler(async(req,res)=>{
  const avatarLocalPath = req.file?.path

  if(!avatarLocalPath){
    throw new ApiError(400,"Avatar file is missing")
  }

  // delete old image from cloudinary
  if(req.user?.avatar){
    const publicId = req.user.avatar.split("/").pop().split(".")[0]
    console.log("publicid",publicId)
    await deleteFromCloudinary(publicId)
  }
 
  
  const avatar = await uploadOnCloudinary(avatarLocalPath)

  if(!avatar.url){
    throw new ApiError(400,"Error while uploading avatar")
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set:{
        avatar:avatar.url
      }
    },
    {new:true}
  ).select("-password")

  res.status(200)
  .json(new ApiResponse(200,user,"Avatar image updated successfully"))
})


export const updateUserCoverImage = asyncHandler(async(req,res)=>{
  const avatarLocalPath = req.file?.path

  if(!avatarLocalPath){
    throw new ApiError(400,"coverImage file is missing")
  }

  // delete old image from cloudinary
  if(req.user?.coverImage){
    const publicId = req.user.avatar.split("/").pop().split(".")[0]
    console.log("publicid",publicId)
    await deleteFromCloudinary(publicId)
  }
 
  
  const coverImage = await uploadOnCloudinary(avatarLocalPath)

  if(!coverImage.url){
    throw new ApiError(400,"Error while uploading avatar")
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set:{
        coverImage:coverImage.url
      }
    },
    {new:true}
  ).select("-password")

  res.status(200)
  .json(new ApiResponse(200,user,"coverImage image updated successfully"))
})


