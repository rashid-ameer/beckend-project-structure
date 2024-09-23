import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";

const app = express();

// middlewares
app.use(cors({ origin: process.env.ORIGIN, credentials: true }));

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());
// route import
import userRoute from "./routes/user.route.js";

// route decalaration
app.use("/api/v1/user", userRoute);

export { app };
